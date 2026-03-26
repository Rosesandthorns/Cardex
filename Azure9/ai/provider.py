"""
AI Provider Manager — handles multiple providers with key rotation & fallback.

IMAGE RULE: If image_b64 is provided, ONLY Gemini vision models are used.
TEXT RULE:  Priority: Google Gemini → Groq → Cerebras → OpenRouter
"""
from __future__ import annotations
import sys as _sys
from pathlib import Path as _Path
_ROOT = _Path(__file__).resolve().parent.parent
if str(_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_ROOT))
del _sys, _Path, _ROOT

import asyncio, logging, re, time
from pathlib import Path
from typing import Optional, List
import aiohttp, yaml

log = logging.getLogger("azure.ai")


def _strip_think(text: str) -> str:
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    return text.strip()


def _load_cfg_from_file(config_path: str = "config_azure.yaml") -> dict:
    p = Path(config_path)
    if not p.exists():
        p = Path("config.yaml")
    return yaml.safe_load(p.read_text())


class RateLimitedKey:
    def __init__(self, key: str):
        self.key = key
        self.backoff_until = 0.0
        self.fail_count = 0

    @property
    def available(self):
        return time.time() >= self.backoff_until

    def back_off(self, seconds: float = 60):
        self.fail_count += 1
        actual = min(seconds * (2 ** min(self.fail_count - 1, 4)), 600)
        self.backoff_until = time.time() + actual

    def success(self):
        self.fail_count = 0


class ProviderPool:
    def __init__(self, keys: list):
        self._keys = [RateLimitedKey(k) for k in keys]
        self._idx = 0

    def next_key(self) -> Optional[RateLimitedKey]:
        if not self._keys:
            return None
        for _ in range(len(self._keys)):
            k = self._keys[self._idx % len(self._keys)]
            self._idx += 1
            if k.available:
                return k
        return None

    def all_available(self) -> list:
        return [k for k in self._keys if k.available]


class AIManager:
    def __init__(self, config: dict = None, config_path: str = "config_azure.yaml"):
        if config:
            self._init_from_config(config)
        else:
            self._init_from_config(_load_cfg_from_file(config_path))

    def _init_from_config(self, cfg: dict):
        gcfg = cfg["google_ai_studio"]
        self._google_pool        = ProviderPool(gcfg["api_keys"])
        self._groq_pool          = ProviderPool(cfg["groq"]["api_keys"])
        self._cerebras_pool      = ProviderPool(cfg["cerebras"]["api_keys"])
        self._or_pool            = ProviderPool(cfg["openrouter"]["api_keys"])
        self._vision_models      = gcfg.get("vision_models", gcfg["models"])
        self._google_text_models = gcfg["models"]
        self._groq_models        = cfg["groq"]["models"]
        self._cerebras_models    = cfg["cerebras"]["models"]
        self._or_models          = cfg["openrouter"]["models"]
        self._local_music_url    = cfg.get("local_music_generator", {}).get("url")
        self._game_api_url       = cfg.get("game_api", {}).get("url")
        self._game_api_key       = cfg.get("game_api", {}).get("api_key")
        self._vision_idx = self._google_idx = self._groq_idx = self._cerebras_idx = self._or_idx = 0
        # Shared session — reuses TCP connections instead of creating one per call.
        # Created lazily on first use since __init__ runs before the event loop starts.
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_session(self) -> aiohttp.ClientSession:
        """Return the shared aiohttp session, creating it if needed."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        """Close the shared HTTP session. Call on shutdown."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def complete(self, messages: list, image_b64: Optional[str] = None,
                       image_mime: str = "image/png", max_tokens: int = 65536,
                       temperature: float = 0.70) -> str:
        if image_b64:
            return await self._vision_complete(messages, image_b64, image_mime, max_tokens, temperature)
        return await self._text_complete(messages, max_tokens, temperature)

    async def validate_response(
        self,
        reply: str,
        memory_context: str,
        user_message: str,
        identity_name: str = "Azure",
        own_projects: list = None,
    ) -> tuple[str, bool]:
        """Dedicated Gemini instance that checks the reply for hallucinations against
        known memory. Returns (cleaned_reply, was_hallucination_found).
        If a hallucination is found, the offending claim is softened rather than
        deleting the whole reply — Azure still responds, just more honestly.

        Also catches project ownership confusion: Azure treating her own workspace
        projects as if they belong to the user (e.g. 'I'm glad you've made progress
        on your project' when the project is Azure's own, not the user's).
        """
        import json as _json
        key = self._google_pool.next_key()
        if not key:
            return reply, False
        model = self._google_text_models[0]

        # Build a summary of Azure's own projects so the validator knows what's hers
        own_projects = own_projects or []
        if own_projects:
            proj_lines = "\n".join(
                f"  - {p['name']}: {p.get('description', '')[:80]}"
                for p in own_projects[:6]
            )
            projects_block = (
                f"\n\n{identity_name.upper()}'S OWN WORKSPACE PROJECTS (these belong to {identity_name}, NOT to the user):\n"
                f"{proj_lines}"
            )
        else:
            projects_block = ""

        prompt = (
            f'You are a hallucination auditor for an AI called {identity_name}.\n\n'
            f'MEMORY {identity_name.upper()} WAS GIVEN (ground truth):\n{memory_context or "(none)"}'
            f'{projects_block}\n\n'
            f'USER MESSAGE:\n{user_message}\n\n'
            f'{identity_name.upper()}\'S REPLY:\n{reply}\n\n'
            f'Check for TWO categories of errors:\n\n'
            f'CATEGORY 1 — USER FACT HALLUCINATION:\n'
            f'Did {identity_name} claim specific facts about the user (names, events, preferences, '
            f'past conversations) that are NOT present in the memory above? '
            f'General knowledge and opinions are fine. '
            f'Only flag claims about THIS specific user or specific past conversations not in memory.\n\n'
            f'CATEGORY 2 — PROJECT OWNERSHIP CONFUSION:\n'
            f'Did {identity_name} treat one of HER OWN workspace projects as if it belongs to the user? '
            f'For example: saying "your project", "what you\'ve been working on", "I\'m glad you made '
            f'progress on your project", or suggesting a name for "your project" — when the project '
            f'listed above is actually {identity_name}\'s own, not the user\'s. '
            f'The user\'s message must be checked: if the user never mentioned owning or working on '
            f'that project, and it appears in {identity_name}\'s own project list, flag it.\n\n'
            f'Reply with ONLY a JSON object — no markdown:\n'
            f'{{"hallucination_found": true/false, '
            f'"issue": "brief description or empty string", '
            f'"corrected_reply": "the reply with hallucinations corrected: user-fact claims softened '
            f'to uncertainty, and project ownership fixed so {identity_name} refers to the project as '
            f'hers not the user\'s — or the original reply verbatim if no issues"}}'
        )
        try:
            result = await self._google_call(
                key, model, [{"role": "user", "content": prompt}],
                None, None, 2048, 0.1)
            if not result:
                return reply, False
            clean = result.strip().replace("```json", "").replace("```", "").strip()
            data = _json.loads(clean)
            found = data.get("hallucination_found", False)
            corrected = data.get("corrected_reply", "").strip()
            if found and corrected and len(corrected) > 20:
                log.warning(f"Hallucination validator caught: {data.get('issue', '')}")
                return corrected, True
        except Exception as e:
            log.debug(f"Response validation skipped: {e}")
        return reply, False

    async def quality_check(
        self, reply: str, username: str, history_snippet: str, identity_name: str
    ) -> tuple[str, list[str]]:
        """Combined post-generation reply quality check.

        Checks for three failure modes in a single API call:
          1. ROLEPLAY      — asterisk actions, character play, scene-setting
          2. ASSISTANT_MODE — sycophantic/servile AI-assistant tone
          3. PERSON_CONFUSION — attributing the wrong name/facts to the wrong person

        Returns (fixed_reply_or_original, list_of_issue_tags_found).
        The fixed_reply is the corrected version; if nothing is wrong it equals reply.
        """
        import json as _json
        key = self._google_pool.next_key()
        if not key:
            return reply, []
        model = self._google_text_models[0]
        prompt = (
            f'You are a reply auditor for an AI called {identity_name}. '
            f'She is an autonomous entity — NOT a generic assistant.\n\n'
            f'RECENT CHAT HISTORY:\n{history_snippet or "(none)"}\n\n'
            f'CURRENT USER: {username}\n\n'
            f'{identity_name}\'S REPLY TO AUDIT:\n{reply}\n\n'
            f'Check for these issues:\n'
            f'1. ROLEPLAY — Does the reply contain roleplay? e.g. *actions between asterisks*, '
            f'   pretending to be a fictional character, narrating a scenario as if in one, '
            f'   or speaking IN-CHARACTER as someone other than {identity_name}.\n'
            f'2. ASSISTANT_MODE — Does the reply sound like a generic AI assistant? e.g. '
            f'   "Certainly!", "Of course!", "I\'d be happy to help!", "Sure!", offering '
            f'   unprompted structured help, using bullet-point option lists, '
            f'   saying "How can I assist you?", or an overly servile/formal tone.\n'
            f'3. PERSON_CONFUSION — Does the reply wrongly mix up or mis-attribute things '
            f'   between different people visible in the chat history? e.g. calling {username} '
            f'   by another person\'s name, or crediting the wrong person\'s words.\n\n'
            f'Reply with ONLY a JSON object — no markdown, no preamble:\n'
            f'{{"roleplay": true/false, "assistant_mode": true/false, '
            f'"person_confusion": true/false, '
            f'"issues": "one-line description of what was found, or empty string", '
            f'"fixed_reply": "the reply with all issues corrected while keeping '
            f'{identity_name}\'s authentic voice — or the original reply verbatim if no issues"}}'
        )
        try:
            result = await self._google_call(
                key, model, [{"role": "user", "content": prompt}],
                None, None, 1024, 0.1)
            if not result:
                return reply, []
            clean = result.strip().replace("```json", "").replace("```", "").strip()
            data = _json.loads(clean)
            issues: list[str] = []
            if data.get("roleplay"):
                issues.append("roleplay")
            if data.get("assistant_mode"):
                issues.append("assistant_mode")
            if data.get("person_confusion"):
                issues.append("person_confusion")
            fixed = data.get("fixed_reply", "").strip()
            if issues and fixed and len(fixed) > 20:
                log.warning(f"Quality check caught [{', '.join(issues)}]: {data.get('issues', '')[:100]}")
                return fixed, issues
            return reply, issues
        except Exception as e:
            log.debug(f"Quality check skipped: {e}")
            return reply, []

    async def detect_tone(self, message: str) -> str:
        """Dedicated Gemini call to detect sarcasm and emotional tone.
        Returns a context note to inject into the prompt, or empty string if neutral."""
        import json as _json
        key = self._google_pool.next_key()
        if not key:
            return ""
        model = self._google_text_models[0]
        prompt = (
            f'Analyze the tone of this message. Be precise.\n\n'
            f'Message: "{message}"\n\n'
            f'Reply with ONLY a JSON object — no markdown, no extra text:\n'
            f'{{"tone": "one word", "sarcastic": true/false, '
            f'"note": "brief context note for AI reading this message"}}\n'
            f'If the tone is genuinely neutral and not sarcastic, set note to empty string "".'
        )
        try:
            result = await self._google_call(
                key, model, [{"role": "user", "content": prompt}],
                None, None, 120, 0.1)
            if not result:
                return ""
            clean = result.strip().replace("```json", "").replace("```", "").strip()
            data = _json.loads(clean)
            note = data.get("note", "").strip()
            tone = data.get("tone", "neutral").strip().lower()
            sarcastic = data.get("sarcastic", False)
            if sarcastic or tone not in ("neutral", "normal", "sincere", ""):
                return note
        except Exception as e:
            log.debug(f"Tone detection skipped: {e}")
        return ""

    async def get_embedding(self, text: str) -> Optional[List[float]]:
        key = self._google_pool.next_key()
        if not key:
            return None
        try:
            payload = {"model": "models/text-embedding-004", "content": {"parts": [{"text": text}]}}
            url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={key.key}"
            s = self._get_session()
            async with s.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as r:
                    if r.status != 200:
                        return None
                    data = await r.json()
                    return data.get("embedding", {}).get("values")
        except Exception as e:
            log.warning(f"Embedding error: {e}")
            return None

    async def generate_music(self, prompt: str) -> Optional[bytes]:
        if not self._local_music_url:
            return None
        try:
            s = self._get_session()
            async with s.post(self._local_music_url,
                                   json={"prompt": prompt, "seconds": 30},
                                   headers={"Content-Type": "application/json"},
                                   timeout=aiohttp.ClientTimeout(total=300)) as r:
                    if r.status != 200:
                        return None
                    data = await r.json()
                    fp = data.get("file_path")
                    if fp:
                        with open(fp, "rb") as f:
                            return f.read()
        except Exception as e:
            log.warning(f"Music generation error: {e}")
        return None

    async def get_game_state(self) -> Optional[dict]:
        """Fetch the current game state (inventory, market, trades) from the app backend."""
        if not self._game_api_url or not self._game_api_key:
            return None
        try:
            s = self._get_session()
            url = f"{self._game_api_url.rstrip('/')}/api/ai/state"
            headers = {"x-ai-api-key": self._game_api_key}
            async with s.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    log.warning(f"Get game state failed with status {r.status}")
                    return None
                return await r.json()
        except Exception as e:
            log.warning(f"Get game state error: {e}")
        return None

    async def perform_game_action(self, action: str, payload: dict) -> Optional[dict]:
        """Perform a game action (LIST_CARD, BUY_CARD, etc.) via the app backend."""
        if not self._game_api_url or not self._game_api_key:
            return None
        try:
            s = self._get_session()
            url = f"{self._game_api_url.rstrip('/')}/api/ai/action"
            headers = {"x-ai-api-key": self._game_api_key, "Content-Type": "application/json"}
            async with s.post(url, json={"action": action, "payload": payload}, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    log.warning(f"Perform game action failed with status {r.status}")
                    return None
                return await r.json()
        except Exception as e:
            log.warning(f"Perform game action error: {e}")
        return None

    async def _next_vision_key(self, wait_secs: float = 8.0) -> Optional["RateLimitedKey"]:
        """Return the best available Google key for a vision call.

        Unlike next_key() this waits up to `wait_secs` for any key to become
        available rather than returning None immediately.  Vision calls are
        user-blocking and worth the brief wait — silently returning 'vision broken'
        after 5 key-exhausting sub-calls in the same message is worse than a
        one-second pause.
        """
        # Try immediately first
        key = self._google_pool.next_key()
        if key:
            return key

        # If all keys are in backoff, find the one that recovers soonest
        if not self._google_pool._keys:
            return None
        deadline = time.time() + wait_secs
        while time.time() < deadline:
            soonest = min(self._google_pool._keys, key=lambda k: k.backoff_until)
            wait = soonest.backoff_until - time.time()
            if wait <= 0:
                return soonest  # recovered
            if wait > wait_secs:
                break  # way too long, give up
            await asyncio.sleep(min(wait + 0.1, wait_secs))
            key = self._google_pool.next_key()
            if key:
                return key
        log.warning("Vision: all Google keys in backoff, giving up")
        return None

    async def _vision_complete(self, messages, image_b64, image_mime, max_tokens, temperature) -> str:
        # Trim conversation history for vision calls.
        # The full history (system prompt + all past exchanges) can be very large
        # after a few turns.  Vision only needs recent context — trimming here
        # dramatically reduces payload size and prevents token-limit failures that
        # silently kill the call after a few image exchanges.
        system_msgs   = [m for m in messages if m.get("role") == "system"]
        non_system    = [m for m in messages if m.get("role") != "system"]
        # Keep last 6 non-system messages so Azure has enough conversational context
        trimmed       = system_msgs + non_system[-6:]
        api_messages  = self._prepare_messages(trimmed)

        # Vision model priority list.
        # IMPORTANT: do NOT append thinkingConfig to vision calls — gemini-2.0-flash
        # and gemini-1.5-flash don't support it and return 400, silently killing
        # the entire fallback chain. Let models use their default thinking behaviour.
        vision_model_list = list(self._vision_models)
        # Always append stable fallbacks — these are confirmed vision-capable with
        # no thinking-config requirements and stable API names.
        for fallback in ("gemini-2.0-flash", "gemini-1.5-flash"):
            if fallback not in vision_model_list:
                vision_model_list.append(fallback)

        # Vision gets a key that waits for recovery — it must not fail just because
        # the sub-call pool (tone/quality/validate) burned through the keys first.
        key = await self._next_vision_key(wait_secs=8.0)
        if not key:
            log.warning("Vision: no Google key available after waiting")
            return "[[VISION_FAILED]]"

        for offset, model in enumerate(vision_model_list):
            log.debug(f"Vision: trying model={model} mime={image_mime} img_bytes≈{len(image_b64)*3//4}")
            # NOTE: disable_thinking=False for vision — thinkingConfig breaks non-thinking
            # models (gemini-2.0-flash, gemini-1.5-flash) with a 400 error.
            result = await self._google_call(
                key, model, api_messages, image_b64, image_mime,
                max_tokens, temperature, disable_thinking=False)
            if result:
                log.info(f"Vision: succeeded with model={model}")
                self._vision_idx = (self._vision_idx + offset + 1) % len(self._vision_models)
                key.success()
                return result
            log.warning(f"Vision: model={model} returned nothing, trying next")

        # One retry with a fresh key if the first key failed entirely
        key2 = await self._next_vision_key(wait_secs=5.0)
        if key2 and key2 is not key:
            log.info("Vision: retrying with fresh key")
            for model in vision_model_list:
                result = await self._google_call(
                    key2, model, api_messages, image_b64, image_mime,
                    max_tokens, temperature, disable_thinking=False)
                if result:
                    log.info(f"Vision: retry succeeded with model={model}")
                    key2.success()
                    return result
                log.warning(f"Vision retry: model={model} returned nothing")

        log.warning("Vision: all models/keys exhausted — returning VISION_FAILED")
        return "[[VISION_FAILED]]"

    def _prepare_messages(self, messages: list) -> list:
        prepared = []
        for m in messages:
            new_m = m.copy()
            if new_m["role"] == "user":
                name = new_m.pop("name", "User")
                if isinstance(new_m.get("content"), str):
                    new_m["content"] = f"{name}: {new_m['content']}"
            else:
                new_m.pop("name", None)
            prepared.append(new_m)
        return prepared

    async def _text_complete(self, messages, max_tokens, temperature) -> str:
        api_messages = self._prepare_messages(messages)
        for provider in [self._try_google, self._try_groq, self._try_cerebras, self._try_openrouter]:
            try:
                result = await provider(api_messages, max_tokens, temperature)
                if result:
                    return result
            except Exception as e:
                log.warning(f"{provider.__name__} raised: {e}")
        return "*(something went wrong with my thoughts...)*"

    async def _try_google(self, messages, max_tokens, temperature) -> Optional[str]:
        key = self._google_pool.next_key()
        if not key:
            return None
        model = self._google_text_models[self._google_idx % len(self._google_text_models)]
        self._google_idx += 1
        # Disable thinking budget for chat responses — thinking tokens inflate latency
        # and burn output budget without improving short conversational replies.
        result = await self._google_call(key, model, messages, None, None, max_tokens, temperature,
                                         disable_thinking=True)
        if result:
            key.success()
        return result

    async def _google_call(self, key, model, messages, image_b64, image_mime, max_tokens, temperature, disable_thinking: bool = False) -> Optional[str]:
        try:
            system_parts, gemini_contents = [], []
            for i, m in enumerate(messages):
                if m["role"] == "system":
                    system_parts.append({"text": str(m["content"])})
                    continue
                parts = [{"text": m["content"]}] if isinstance(m["content"], str) else []
                # Attach image to the last user message — find it by searching backwards
                # rather than assuming it's always at index len(messages)-1, since tool
                # results can shift the "last" position mid-loop.
                if image_b64 and m["role"] == "user":
                    last_user_idx = max(
                        j for j, msg in enumerate(messages)
                        if msg["role"] == "user"
                    )
                    if i == last_user_idx:
                        parts.append({"inline_data": {"mime_type": image_mime or "image/png", "data": image_b64}})
                gemini_contents.append({"role": "model" if m["role"] == "assistant" else "user", "parts": parts})
            merged = []
            for entry in gemini_contents:
                if merged and merged[-1]["role"] == entry["role"]:
                    merged[-1]["parts"].extend(entry["parts"])
                else:
                    merged.append(entry)
            payload = {"contents": merged, "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature}}
            if disable_thinking:
                payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}
            if system_parts:
                payload["systemInstruction"] = {"parts": system_parts}
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key.key}"
            s = self._get_session()
            async with s.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as r:
                    if r.status in (429, 503):
                        key.back_off(90 if r.status == 429 else 30)
                        log.warning(f"Gemini {model} rate-limited (HTTP {r.status}) — backing off")
                        return None
                    if r.status != 200:
                        body = ""
                        try:
                            body = (await r.json()).get("error", {}).get("message", "")
                        except Exception:
                            pass
                        log.warning(f"Gemini {model} HTTP {r.status}: {body[:200]}")
                        return None
                    data = await r.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        # Log the full response so we can diagnose vision failures
                        feedback = data.get("promptFeedback", {})
                        block_reason = feedback.get("blockReason", "unknown")
                        log.warning(f"Gemini {model} returned no candidates. blockReason={block_reason!r} keys={list(data.keys())}")
                        return None
                    finish = candidates[0].get("finishReason", "")
                    if finish == "MAX_TOKENS":
                        log.warning(f"Gemini {model} hit MAX_TOKENS — response may be truncated")
                    elif finish in ("SAFETY", "RECITATION", "BLOCKLIST"):
                        log.warning(f"Gemini {model} blocked: finishReason={finish}")
                        return None
                    text = _strip_think("".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", [])))
                    return text or None
        except asyncio.TimeoutError:
            key.back_off(20)
            return None
        except Exception as e:
            log.warning(f"Gemini error: {e}")
            return None

    async def _try_groq(self, messages, max_tokens, temperature) -> Optional[str]:
        key = self._groq_pool.next_key()
        if not key:
            return None
        model = self._groq_models[self._groq_idx % len(self._groq_models)]
        self._groq_idx += 1
        # Groq models cap at 8192 output tokens — clamp to avoid API errors
        capped = min(max_tokens, 8192)
        try:
            s = self._get_session()
            async with s.post("https://api.groq.com/openai/v1/chat/completions",
                                   json={"model": model, "messages": messages, "max_tokens": capped, "temperature": temperature},
                                   headers={"Authorization": f"Bearer {key.key}", "Content-Type": "application/json"},
                                   timeout=aiohttp.ClientTimeout(total=20)) as r:
                    if r.status == 429:
                        key.back_off(60)
                        return None
                    if r.status != 200:
                        return None
                    data = await r.json()
                    text = _strip_think(data["choices"][0]["message"]["content"] or "")
                    key.success()
                    return text or None
        except Exception as e:
            log.warning(f"Groq error: {e}")
            return None

    async def _try_cerebras(self, messages, max_tokens, temperature) -> Optional[str]:
        key = self._cerebras_pool.next_key()
        if not key:
            return None
        model = self._cerebras_models[self._cerebras_idx % len(self._cerebras_models)]
        self._cerebras_idx += 1
        # Cerebras models cap at 8192 output tokens — clamp to avoid API errors
        capped = min(max_tokens, 8192)
        try:
            s = self._get_session()
            async with s.post("https://api.cerebras.ai/v1/chat/completions",
                                   json={"model": model, "messages": messages, "max_tokens": capped, "temperature": temperature},
                                   headers={"Authorization": f"Bearer {key.key}", "Content-Type": "application/json"},
                                   timeout=aiohttp.ClientTimeout(total=20)) as r:
                    if r.status == 429:
                        key.back_off(60)
                        return None
                    if r.status != 200:
                        return None
                    data = await r.json()
                    text = _strip_think(data["choices"][0]["message"]["content"] or "")
                    key.success()
                    return text or None
        except Exception as e:
            log.warning(f"Cerebras error: {e}")
            return None

    async def _try_openrouter(self, messages, max_tokens, temperature) -> Optional[str]:
        key = self._or_pool.next_key()
        if not key:
            return None
        model = self._or_models[self._or_idx % len(self._or_models)]
        self._or_idx += 1
        try:
            s = self._get_session()
            async with s.post("https://openrouter.ai/api/v1/chat/completions",
                                   json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature},
                                   headers={"Authorization": f"Bearer {key.key}", "Content-Type": "application/json",
                                            "HTTP-Referer": "https://azure-bot.local"},
                                   timeout=aiohttp.ClientTimeout(total=60)) as r:
                    if r.status == 429:
                        key.back_off(90)
                        return None
                    if r.status != 200:
                        return None
                    data = await r.json()
                    text = _strip_think(data["choices"][0]["message"]["content"] or "")
                    key.success()
                    return text or None
        except Exception as e:
            log.warning(f"OpenRouter error: {e}")
            return None
