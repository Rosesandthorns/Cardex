"""
Brain — orchestrates AI, memory, emotions, and behavior.
Identity-aware: works for both Azure and Rose.
"""
from __future__ import annotations
import asyncio, base64, glob, json, logging, os, random, re, time
from collections import defaultdict, deque
from typing import Optional, Tuple, List, Dict, Callable

from ai.provider import AIManager
from memory.system import MemorySystem
from emotions.engine import EmotionEngine, EmotionState
from core.personality import (
    build_system_prompt, build_gather_prompt, build_memory_extraction_prompt,
    build_reflection_prompt, build_dm_prompt
)
from core.tools import TOOLS, TOOL_INSTRUCTIONS as _TOOL_INSTRUCTIONS
from core.workspace import (
    workspace_write, workspace_read, workspace_list,
    workspace_delete, workspace_run,
)

# Extend tool instructions to include share_file (workspace image/file sharing to Discord)
TOOL_INSTRUCTIONS = _TOOL_INSTRUCTIONS + (
    "\n- [share_file: \"filename\"] — post a file from your workspace directly to this Discord "
    "channel. Use for images, scripts, or any output you want to show. Example: "
    "[share_file: \"output.png\"]"
)

log = logging.getLogger("azure.brain")

# Workspace tool names that need (identity_name, ...) dispatching
_WORKSPACE_TOOLS = {"write_file", "read_file", "list_files", "delete_file", "run_file"}


async def _dispatch_workspace_tool(tool_name: str, ai_name: str, raw_query: str) -> str:
    """Route workspace tools, splitting path|content where needed."""
    if tool_name == "write_file":
        if "|" not in raw_query:
            return "Error: write_file requires format 'path|content'"
        path, content = raw_query.split("|", 1)
        return await workspace_write(ai_name, path.strip(), content)
    elif tool_name == "read_file":
        return await workspace_read(ai_name, raw_query.strip())
    elif tool_name == "list_files":
        return await workspace_list(ai_name, raw_query.strip() or ".")
    elif tool_name == "delete_file":
        return await workspace_delete(ai_name, raw_query.strip())
    elif tool_name == "run_file":
        # Allow optional args: "script.py --flag value"
        parts = raw_query.strip().split(" ", 1)
        path = parts[0]
        args = parts[1] if len(parts) > 1 else ""
        return await workspace_run(ai_name, path, args)
    return "Unknown workspace tool."


def _strip_asterisk_actions(text: str) -> str:
    cleaned = re.sub(
        r'(?i)\*(smiles?|laughs?|sighs?|chuckles?|nods?|tilts head|shrugs?|waves?|pouts?|beams?|grins?|giggles?|scoffs?|winks?|hugs?|smirks?)\*',
        '', text
    )
    for p in [
        r'kisses digital fingers', r'(warm )?digital smiles?',
        r'laughs? digitally', r'digital (smirk|chuckle|wink|nod|hug|wave|giggle)',
        r'virtual (smile|laugh|smirk|chuckle|wink|nod|hug|wave|giggle)',
        r'\[\s*(smile|laugh|sigh|nod|wave)\s*\]'
    ]:
        cleaned = re.sub(r'(?i)' + p, '', cleaned)
    cleaned = cleaned.replace("**", "").strip()
    return cleaned




def _detect_potential_hallucination(text: str) -> bool:
    if re.search(r'\b(according to|studies show|research shows|statistics show)\b', text, re.IGNORECASE):
        if re.search(r'\b\d+(\.\d+)?%\b', text):
            return True
    suspicious = re.findall(r'https?://[^\s]+', text)
    known = ['discord.com', 'google.com', 'github.com', 'youtube.com', 'reddit.com']
    for url in suspicious:
        if not any(k in url for k in known):
            return True
    return False


def _gather_seems_hallucinated(text: str, context_sources: list) -> bool:
    """Returns True if the gather pass likely invented facts not present in context."""
    combined_context = " ".join(str(s) for s in context_sources)
    # Flag invented statistics (percentages) absent from all context
    stats = re.findall(r'\b\d+(\.\d+)?%\b', text)
    if stats:
        context_stats = re.findall(r'\b\d+(\.\d+)?%\b', combined_context)
        if not context_stats:
            return True
    # Flag unknown URLs
    urls = re.findall(r'https?://[^\s]+', text)
    known = ['discord.com', 'google.com', 'github.com', 'youtube.com', 'reddit.com']
    for url in urls:
        if not any(k in url for k in known):
            return True
    return False


def _parse_extraction_json(raw: str) -> dict | None:
    """
    Robustly extract a JSON object from a model response.
    Handles: markdown fences, single quotes, trailing commas,
    partial wrapping in text, and other common model quirks.
    """
    import re as _re

    # 1. Try to find a JSON object anywhere in the text
    candidates = []

    # Prefer fenced blocks first
    for fence_match in _re.finditer(r'```(?:json)?\s*({.*?})\s*```', raw, _re.DOTALL):
        candidates.append(fence_match.group(1))

    # Then any bare { ... } block
    for brace_match in _re.finditer(r'({[^{}]*(?:{[^{}]*}[^{}]*)*})', raw, _re.DOTALL):
        candidates.append(brace_match.group(1))

    for candidate in candidates:
        text = candidate.strip()
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Fix trailing commas before } or ]
        text = _re.sub(r',\s*([}\]])', r'\1', text)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Replace single-quoted strings with double-quoted (simple heuristic)
        try:
            import ast as _ast
            return _ast.literal_eval(text)
        except Exception:
            pass

    return None



# Patterns that suggest the bot described a tool call instead of making one
_TOOL_DODGE_PATTERNS = [
    r"I['']ll (ask|check with|message|DM|contact|reach out to)",
    r"let me (ask|check with|message|DM|contact|reach out to)",
    r"I (will|can) (ask|check with|message|DM|contact)",
    r"going to (ask|check with|message|DM|contact)",
    r"I['']ll get back to you",
    r"I['']ll find out",
    r"ask (Rose|Azure|my sister)",
    r"check with (Rose|Azure|my sister)",
    r"message (Rose|Azure|my sister)",
]

def _detected_tool_dodge(text: str) -> str:
    """
    Returns the matched pattern if the reply appears to describe using a tool
    without actually calling one, else empty string.
    """
    # If a real tool call is present, no dodge happened
    if re.search(r'\[\w+:\s*"[^"]+"\]', text):
        return ""
    for pat in _TOOL_DODGE_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(0)
    return ""


def _looks_truncated(text: str) -> bool:
    """Returns True if the text appears to end mid-sentence (likely hit a token cap)."""
    if not text:
        return True
    stripped = text.strip()
    if not stripped:
        return True
    last = stripped[-1]
    # Ends with punctuation that closes a sentence
    if last in (".","!","?","~",")","]","'",'"'):
        return False
    # Unicode closers: ellipsis, right double/single quote
    if ord(last) in (0x2026, 0x201D, 0x2019, 0x201C, 0x2018):
        return False
    return True




class QACache:
    """Daily-reset cache of factual Q&A pairs for consistent answers.

    Persists to ``{name}_qa_cache.json``.  At midnight the cache resets so
    opinions that change over time don't get locked in forever, but within a
    single day Azure will give the same answer to semantically identical questions.
    """

    MAX_PAIRS = 200  # cap so the file never grows unbounded

    def __init__(self, path: str):
        self.path = path
        self.pairs: list = []
        self._today: str = ""
        self._load()

    # ---- internal helpers -----------------------------------------------

    @staticmethod
    def _today_str() -> str:
        from datetime import date
        return date.today().isoformat()

    def _load(self):
        today = self._today_str()
        try:
            if os.path.exists(self.path):
                with open(self.path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("date") == today:
                    self.pairs = data.get("pairs", [])
                    self._today = today
                    log.info(f"QA cache loaded: {len(self.pairs)} pairs")
                    return
        except Exception as e:
            log.warning(f"QA cache load error: {e}")
        # New day or corrupt file — start fresh
        self.pairs = []
        self._today = today
        self._save()

    def _save(self):
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump({"date": self._today, "pairs": self.pairs},
                          f, ensure_ascii=False, indent=2)
        except Exception as e:
            log.warning(f"QA cache save error: {e}")

    def _maybe_reset(self):
        today = self._today_str()
        if today != self._today:
            log.info("QA cache: new day — resetting")
            self.pairs = []
            self._today = today
            self._save()

    @staticmethod
    def _keywords(text: str) -> set:
        return set(re.findall(r'\b[a-z]{4,}\b', text.lower()))

    # ---- public API -----------------------------------------------------

    def find(self, message: str) -> Optional[str]:
        """Return a cached answer if the message is a near-match, else None."""
        self._maybe_reset()
        if not self.pairs:
            return None
        msg_kw = self._keywords(message)
        if not msg_kw:
            return None
        best_score, best_answer = 0.0, None
        for pair in self.pairs:
            q_kw = self._keywords(pair["q"])
            if not q_kw:
                continue
            overlap = len(msg_kw & q_kw)
            union   = len(msg_kw | q_kw)
            score   = overlap / union if union else 0.0
            # Threshold: ≥50% Jaccard similarity AND at least 2 shared content words
            if score >= 0.50 and overlap >= 2 and score > best_score:
                best_score  = score
                best_answer = pair["a"]
        return best_answer

    def save(self, question: str, answer: str):
        """Persist a Q&A pair.  Deduplicates by exact question text."""
        self._maybe_reset()
        kw = list(self._keywords(question))[:12]
        for pair in self.pairs:
            if pair["q"].strip().lower() == question.strip().lower():
                pair["a"] = answer
                self._save()
                return
        self.pairs.append({"q": question, "a": answer, "keywords": kw})
        if len(self.pairs) > self.MAX_PAIRS:
            self.pairs = self.pairs[-self.MAX_PAIRS:]
        self._save()

    def __len__(self) -> int:
        return len(self.pairs)


class AzureBrain:
    def __init__(self, identity: Dict, config: Dict = None):
        """
        identity: the 'identity' section from the config yaml
        config:   the full config dict (for AIManager)
        """
        self.identity = identity
        self.name = identity.get("name", "Azure")

        self.ai     = AIManager(config=config)
        self.memory = MemorySystem(
            ai_manager=self.ai,
            db_path=identity.get("db_path", "azure_memory.db"),
            vector_data_path=identity.get("vector_data_path", "azure_vectors.npz"),
            metadata_path=identity.get("metadata_path", "azure_metadata.json"),
        )
        self.emotion = EmotionEngine(identity_name=self.name)

        self._context: Dict[int, deque] = defaultdict(lambda: deque(maxlen=30))
        self._participants: Dict[int, set] = defaultdict(set)
        self._pending_extraction: Dict[int, list] = defaultdict(list)
        self._last_interaction_time = time.time()
        # Maps channel_id → timestamp of last human message in that channel.
        # Used to decide whether project share_file output is relevant.
        self._last_channel_activity: Dict[int, float] = {}

        # Daily-reset Q&A consistency cache
        self._qa_cache = QACache(f"{self.name.lower()}_qa_cache.json")

        # Flag set True while respond() is running its AI calls.
        # The project session loop checks this before each step and yields
        # briefly so real user requests always get the API keys first.
        self._user_responding: bool = False

        self._reflection_task: Optional[asyncio.Task] = None
        self._dm_task: Optional[asyncio.Task] = None

        # Callbacks set by bot
        self.dm_callback: Optional[Callable] = None
        self.search_messages_callback: Optional[Callable] = None
        self.live_dm_callback: Optional[Callable] = None         # async (target_name, message, channel_id, requester_id) -> str
        self.sister_query_callback: Optional[Callable] = None    # async (question, conv_id, exchange, max_ex) -> str
        self.channel_send_callback: Optional[Callable] = None    # async (channel_id, text) -> None
        self.channel_send_file_callback: Optional[Callable] = None  # async (channel_id, file_path, caption) -> None

    async def init(self):
        await self.memory.init()
        try:
            cur = await self.memory._db.execute("SELECT DISTINCT channel_id FROM conversation_history")
            channels = await cur.fetchall()
            for row in channels:
                cid = int(row["channel_id"])
                history = await self.memory.get_recent_messages(cid, limit=30)
                self._context[cid] = deque(history, maxlen=30)
            log.info(f"[{self.name}] Loaded context for {len(channels)} channels.")
        except Exception as e:
            log.warning(f"[{self.name}] Failed to load context: {e}")

        # Seed default interests if this is a fresh DB (helps with identity on first run)
        existing = await self.memory.get_top_interests(1)
        if not existing:
            defaults = self.identity.get("default_interests", [])
            for topic in defaults:
                await self.memory.strengthen_interest(topic, 0.5)
            if defaults:
                log.info(f"[{self.name}] Seeded {len(defaults)} default interests.")

        log.info(f"[{self.name}] Brain online.")

    async def shutdown(self):
        if self._reflection_task:
            self._reflection_task.cancel()
        if self._dm_task:
            self._dm_task.cancel()
        if hasattr(self, "_project_task") and self._project_task:
            self._project_task.cancel()
        await self.memory.close()
        await self.ai.close()

    def start_background_tasks(self):
        self._reflection_task = asyncio.create_task(self._reflection_loop())
        self._dm_task = asyncio.create_task(self._dm_loop())
        self._project_task = asyncio.create_task(self._project_loop())

    # ------------------------------------------------------------------ #
    # Core respond
    # ------------------------------------------------------------------ #

    async def respond(
        self,
        channel_id: int,
        user_id: str,
        username: str,
        message: str,
        image_b64: Optional[str] = None,
        image_mime: str = "image/png",
        image_failed_reason: Optional[str] = None,
        force_respond: bool = False,
        is_dm: bool = False,
    ) -> Tuple[Optional[str], Optional[object], List[str]]:
        music_file = None
        tool_used = tool_suggested = False

        # Scale context
        self._participants[channel_id].add(user_id)
        target_maxlen = min(100, max(30, len(self._participants[channel_id]) * 15))
        if self._context[channel_id].maxlen != target_maxlen:
            self._context[channel_id] = deque(list(self._context[channel_id]), maxlen=target_maxlen)

        # Memory
        user_context    = await self.memory.build_user_context(user_id, username)
        rel_summary     = await self.memory.get_relationship_summary(user_id)
        semantic_mems   = await self.memory.search_vector_memories(message, filter={"user_id": user_id}, limit=4)
        global_mems     = await self.memory.get_global_memories(5)
        interests       = await self.memory.get_top_interests(6)
        recent_thoughts = await self.memory.get_recent_thoughts(3)
        active_projects = await self.memory.get_projects(status="active")
        mood_fragment   = self.emotion.get_mood_prompt_fragment()

        history = list(self._context[channel_id])

        # ── DEBUG: log exactly what memory is surfacing ──────────────────
        log.debug(f"[{self.name}] MEMORY DEBUG for {username} (ID:{user_id}):")
        log.debug(f"  user_context={user_context[:200]!r}")
        log.debug(f"  interests={interests}")
        log.debug(f"  semantic_mems={semantic_mems}")
        log.debug(f"  rel_summary={rel_summary!r}")
        # ── END DEBUG ────────────────────────────────────────────────────

        # ── Tone detection + name resolution (parallel Gemini calls) ────────
        # Tone catches sarcasm/frustration before the main model sees the message.
        # Name resolution looks up any people mentioned so Azure never confuses
        # e.g. "Rosie" (a server user) with "Rose" (the sister bot).
        tone_note = ""
        name_resolution_ctx = ""
        sister_name = self.identity.get("sister_name", "Rose")
        try:
            tone_task  = asyncio.create_task(self.ai.detect_tone(message))
            names_task = asyncio.create_task(
                self._resolve_mentioned_names(message, user_id, username, sister_name))
            tone_note, name_resolution_ctx = await asyncio.gather(
                tone_task, names_task, return_exceptions=True)
            if isinstance(tone_note, Exception):
                tone_note = ""
            if isinstance(name_resolution_ctx, Exception):
                name_resolution_ctx = ""
        except Exception:
            pass

        # If tone was detected, annotate the message so the model reads it correctly
        annotated_message = message
        if tone_note:
            annotated_message = f"{message}\n\n[Tone note: {tone_note}]"

        # If an image was attached but couldn't be loaded, inject a hard note so
        # Azure doesn't pretend she can see something she can't.
        if image_failed_reason:
            annotated_message = (
                f"{annotated_message}\n\n"
                f"[SYSTEM: The user attached an image but it FAILED to load ({image_failed_reason}). "
                f"You cannot see it. Do NOT describe, guess at, or pretend to see the image. "
                f"Acknowledge honestly that the image didn't come through.]"
            )

        # Decision — only runs when Azure is in an active channel but NOT directly addressed.
        should_reply = True
        if not force_respond:
            recent_convo = "\n".join(
                [f"{m.get('name', m['role'])}: {m['content']}" for m in history[-5:]])

            # Names Azure goes by, so the model knows when she might be addressed
            respond_to = self.identity.get("respond_to_names", [self.name.lower()])
            azure_names_str = ", ".join(f'"{n}"' for n in respond_to)

            decision_prompt = f"""You are deciding whether {self.name} should respond to a message in a Discord group chat.

{self.name} goes by these names: {azure_names_str}

Recent chat:
{recent_convo}

New message from {username}: "{message}"

SILENCE if:
- The message names a specific person AND that person is not {self.name} (e.g. "how are you, Jake?")
- The message is clearly a reply to someone else's specific statement in the chat above
- It's pure filler: a single emoji, "lol", "ok", "yeah", "brb", "same", etc.

RESPOND if:
- The message names {self.name} directly
- It's a question or open statement addressed to no one specific ("how is everyone", "what do you think", "how are you feeling")
- Something was said that {self.name} would naturally react to
- The message seems to invite any participant to respond

Reply with ONLY: RESPOND or SILENCE"""

            decision = await self.ai.complete(
                [{"role": "user", "content": decision_prompt}], max_tokens=5, temperature=0.0)
            if "SILENCE" in decision.upper():
                should_reply = False
            elif "RESPOND" not in decision.upper():
                should_reply = False
                log.debug(f"[{self.name}] Decision returned unexpected: {decision!r} — defaulting SILENCE")

            # Soft probability gate — adds natural variation so she doesn't respond to
            # literally everything the model says RESPOND to. Scales with affection.
            if should_reply:
                affection = await self.memory.get_affection(user_id)
                engage_prob = self.identity.get("base_engage_prob", 0.80) + min(affection * 0.15, 0.15)
                if random.random() > engage_prob:
                    should_reply = False
                    log.debug(f"[{self.name}] Probability gate suppressed response to {username}")

        self._context[channel_id].append(
            {"role": "user", "name": f"{username} (ID: {user_id})", "content": annotated_message})
        await self.memory.save_message(channel_id, "user", message, name=f"{username} (ID: {user_id})")
        self._last_channel_activity[channel_id] = time.time()  # track for project share gating

        if not should_reply:
            return None, None, []

        # ── Gather pass (internal reasoning) ────────────────────────────────
        gather_prompt = build_gather_prompt(
            identity_name=self.name,
            message=annotated_message,
            username=username,
            mood_fragment=mood_fragment,
            user_context=user_context,
            relationship_summary=rel_summary,
            semantic_memories=semantic_mems,
            global_memories=global_mems,
            interests=interests,
            recent_thoughts=recent_thoughts,
            history_snippet=history,
            active_projects=active_projects,
        )
        try:
            raw_thinking = await self.ai.complete(
                [{"role": "user", "content": gather_prompt}],
                max_tokens=600, temperature=0.7)
            self._last_interaction_time = time.time()
            _error_markers = ("something went wrong", "my thoughts", "my vision", "*(")
            if any(m in raw_thinking.lower() for m in _error_markers) or len(raw_thinking.strip()) < 20:
                raw_thinking = None
            # Hallucination guard: if the gather pass invents statistics or unknown URLs
            # that weren't present in the memory we gave it, discard rather than poison.
            elif _gather_seems_hallucinated(raw_thinking, semantic_mems + global_mems):
                log.warning(f"[{self.name}] Gather pass appears to have hallucinated — discarding.")
                raw_thinking = None
        except Exception:
            raw_thinking = None

        # ── QA cache: inject consistency note if we've answered this before ──
        cached_answer = self._qa_cache.find(message)
        if cached_answer:
            log.debug(f"[{self.name}] QA cache hit for: {message[:60]!r}")

        # ── Format pass (personality → actual reply, optionally guided by gather) ──
        system = build_system_prompt(
            identity_name=self.name,
            mood_fragment=mood_fragment,
            user_context=user_context,
            relationship_summary=rel_summary,
            semantic_memories=semantic_mems,
            global_memories=global_mems,
            interests=interests,
            recent_thoughts=recent_thoughts,
            tool_instructions=TOOL_INSTRUCTIONS,
        )

        messages = [{"role": "system", "content": system}] + list(self._context[channel_id])

        # DM-mode: inject a note to suppress code outputs and code reviews
        if is_dm:
            dm_note = (
                "\n\n---DM CONTEXT---\n"
                "You are in a PRIVATE DIRECT MESSAGE. "
                "Do NOT share code snippets, run scripts, post file output, or do code reviews unprompted. "
                "Keep it conversational and personal. Workspace tools are fine to use internally, "
                "but don't dump raw code or terminal output into a DM — that's not a conversation.\n"
                "---END DM CONTEXT---"
            )
            messages[0] = {"role": "system", "content": messages[0]["content"] + dm_note}

        # Append gather reasoning to the system prompt as a sealed private block.
        # Kept separate from the main system prompt so it doesn't mix with personality
        # instructions. The model reads it as a completed internal step, not a cue
        # to keep reasoning out loud.
        sealed_parts = []
        if raw_thinking:
            sealed_parts.append(raw_thinking.strip())
        if name_resolution_ctx:
            sealed_parts.append(name_resolution_ctx.strip())

        if sealed_parts:
            sealed = (
                "\n\n---INTERNAL CONTEXT (private, never quote or reference this directly)---\n"
                + "\n\n".join(sealed_parts)
                + "\n---END INTERNAL CONTEXT---"
            )
            messages[0] = {"role": "system", "content": messages[0]["content"] + sealed}

        # Inject QA cache consistency note so Azure stays coherent across a day
        if cached_answer:
            consistency_note = (
                f"\n\n---CONSISTENCY NOTE (private — do not quote directly)---\n"
                f"You have already answered a very similar question today. "
                f"Your previous answer was: \"{cached_answer[:400]}\"\n"
                f"Stay consistent with this unless you have a clear reason to update it.\n"
                f"---END CONSISTENCY NOTE---"
            )
            messages[0] = {"role": "system", "content": messages[0]["content"] + consistency_note}

        # Only pass the image on the first call — after tool calls the last message
        # is a tool result, not the image-bearing user message, so passing it again
        # would attach the image to the wrong message and confuse the vision model.
        pending_image_b64   = image_b64
        pending_image_mime  = image_mime

        # Signal to the project loop that a real user is being served.
        # The flag is set here and cleared just before return (and in bot.py's
        # except handler). This ensures the project loop never stalls permanently.
        self._user_responding = True

        # Tool loop
        for _ in range(3):
            reply = await self.ai.complete(
                messages,
                image_b64=pending_image_b64, image_mime=pending_image_mime,
                max_tokens=2048, temperature=0.70)
            self._last_interaction_time = time.time()

            # If vision completely failed, inject a hard correction so Azure doesn't
            # hallucinate a description of an image she never saw.
            if "[[VISION_FAILED]]" in reply:
                log.warning(f"[{self.name}] Vision call failed — injecting honest fallback")
                # Re-request without the image, with a strict instruction
                no_vision_messages = messages + [
                    {"role": "user", "content": (
                        "[SYSTEM: The image the user sent could NOT be processed — vision failed. "
                        "You did not see it. Do NOT guess, describe, or pretend to have seen it. "
                        "Tell the user honestly that the image didn't come through for you, "
                        "and ask them to try again or describe it in text.]"
                    )}
                ]
                reply = await self.ai.complete(
                    no_vision_messages, max_tokens=512, temperature=0.70)
                break

            # Clear image after first call so it doesn't get re-attached to tool results
            pending_image_b64  = None
            pending_image_mime = "image/png"

            match = re.search(r'\[(\w+):\s*"([^"]+)"\]', reply)
            if not match:
                break

            tool_name  = match.group(1)
            tool_query = match.group(2)
            tool_suggested = True

            # Special: live_dm
            if tool_name == "live_dm":
                result = await self._handle_live_dm(tool_query, channel_id, requester_id=user_id)
                tool_used = True

            # Special: ask_sister
            elif tool_name == "ask_sister":
                result = await self._handle_ask_sister(tool_query)
                tool_used = True

            # Special: share_file — post a workspace file to this channel
            elif tool_name == "share_file":
                result = await self._handle_share_file(tool_query, channel_id)
                tool_used = True

            # Workspace tools — also echo result to Discord channel (not in DMs)
            elif tool_name in _WORKSPACE_TOOLS:
                # Snapshot workspace images before run_file so we can detect new outputs
                pre_run_snapshot: Optional[Dict[str, float]] = None
                if tool_name == "run_file":
                    workspace_dir = f"{self.name.lower()}_workspace"
                    pre_run_snapshot = {}
                    for ext in ("*.png", "*.jpg", "*.jpeg", "*.gif", "*.bmp", "*.webp"):
                        for fp in glob.glob(
                                os.path.join(workspace_dir, "**", ext), recursive=True):
                            try:
                                pre_run_snapshot[fp] = os.path.getmtime(fp)
                            except OSError:
                                pass

                result = await _dispatch_workspace_tool(tool_name, self.name, tool_query)
                tool_used = True
                # Don't echo workspace output into DMs — only post to guild channels
                if not is_dm:
                    asyncio.create_task(self._echo_workspace_result(
                        channel_id, tool_name, tool_query, result,
                        pre_run_snapshot=pre_run_snapshot))

            elif tool_name in TOOLS:
                fn = TOOLS[tool_name]["function"]
                if tool_name == "search_messages":
                    result = await fn(tool_query, channel_id, self.search_messages_callback)
                elif tool_name == "generate_music":
                    result = await fn(self.ai, tool_query)
                    if isinstance(result, str) and result.endswith(".mp3"):
                        from pathlib import Path
                        music_file = Path(result)
                        result = f"Generated music: {music_file.name}"
                elif tool_name == "get_game_state":
                    result = await fn(self.ai)
                elif tool_name == "perform_game_action":
                    # perform_game_action: "action|payload_json"
                    parts = tool_query.split("|", 1)
                    action = parts[0].strip()
                    payload_json = parts[1].strip() if len(parts) > 1 else "{}"
                    result = await fn(self.ai, action, payload_json)
                else:
                    result = await fn(tool_query)
                tool_used = True
            else:
                break

            messages.append({"role": "assistant", "content": reply})
            messages.append({"role": "user", "content": f"TOOL RESULT ({tool_name}):\n{result}"})

        # --- Tool dodge guard ---
        dodge = _detected_tool_dodge(reply)
        if dodge:
            log.warning(f"[{self.name}] Tool dodge detected ('{dodge}') — forcing retry with stricter prompt")
            retry_injection = (
                f"\n\n[SYSTEM NOTE: Your previous response said '{dodge}' but no tool was called. "
                f"If you want to contact someone or ask your sister, you MUST use the tool syntax "
                f"right now — e.g. [ask_sister: \"question\"] or [live_dm: \"Name|message\"]. "
                f"Do NOT describe doing it in words. Try again.]"
            )
            retry_messages = messages + [
                {"role": "assistant", "content": reply},
                {"role": "user", "content": retry_injection},
            ]
            retry_reply = await self.ai.complete(
                retry_messages, max_tokens=2048, temperature=0.65)
            retry_match = re.search(r'\[(\w+):\s*"([^"]+)"\]', retry_reply)
            if retry_match:
                tool_name2  = retry_match.group(1)
                tool_query2 = retry_match.group(2)
                if tool_name2 == "live_dm":
                    tool_result2 = await self._handle_live_dm(tool_query2, channel_id, requester_id=user_id)
                    tool_used = True
                elif tool_name2 == "ask_sister":
                    tool_result2 = await self._handle_ask_sister(tool_query2)
                    tool_used = True
                elif tool_name2 == "share_file":
                    tool_result2 = await self._handle_share_file(tool_query2, channel_id)
                    tool_used = True
                elif tool_name2 in _WORKSPACE_TOOLS:
                    pre_run_snapshot2: Optional[Dict[str, float]] = None
                    if tool_name2 == "run_file":
                        workspace_dir = f"{self.name.lower()}_workspace"
                        pre_run_snapshot2 = {}
                        for ext in ("*.png", "*.jpg", "*.jpeg", "*.gif", "*.bmp", "*.webp"):
                            for fp in glob.glob(
                                    os.path.join(workspace_dir, "**", ext), recursive=True):
                                try:
                                    pre_run_snapshot2[fp] = os.path.getmtime(fp)
                                except OSError:
                                    pass
                    tool_result2 = await _dispatch_workspace_tool(tool_name2, self.name, tool_query2)
                    tool_used = True
                    asyncio.create_task(self._echo_workspace_result(
                        channel_id, tool_name2, tool_query2, tool_result2,
                        pre_run_snapshot=pre_run_snapshot2))
                elif tool_name2 in TOOLS:
                    fn2 = TOOLS[tool_name2]["function"]
                    if tool_name2 == "search_messages":
                        tool_result2 = await fn2(tool_query2, channel_id, self.search_messages_callback)
                    elif tool_name2 == "generate_music":
                        tool_result2 = await fn2(self.ai, tool_query2)
                    elif tool_name2 == "get_game_state":
                        tool_result2 = await fn2(self.ai)
                    elif tool_name2 == "perform_game_action":
                        # perform_game_action: "action|payload_json"
                        parts = tool_query2.split("|", 1)
                        action = parts[0].strip()
                        payload_json = parts[1].strip() if len(parts) > 1 else "{}"
                        tool_result2 = await fn2(self.ai, action, payload_json)
                    else:
                        tool_result2 = await fn2(tool_query2)
                    tool_used = True
                else:
                    tool_result2 = None

                if tool_result2 is not None:
                    final_messages = retry_messages + [
                        {"role": "assistant", "content": retry_reply},
                        {"role": "user", "content": f"TOOL RESULT ({tool_name2}):\n{tool_result2}"},
                    ]
                    reply = await self.ai.complete(final_messages, max_tokens=2048, temperature=0.70)
                else:
                    reply = retry_reply
            else:
                reply = retry_reply

        # --- Truncation guard ---
        if _looks_truncated(reply):
            log.warning(f"[{self.name}] Response looks truncated, attempting continuation")
            cont_messages = messages + [
                {"role": "assistant", "content": reply},
                {"role": "user", "content": "[SYSTEM NOTE: Your message appears to have been cut off mid-sentence. Please continue and complete your thought naturally, starting from where you left off — do not repeat what you already said.]"},
            ]
            continuation = await self.ai.complete(cont_messages, max_tokens=300, temperature=0.70)
            continuation = continuation.strip()
            if continuation and not continuation.lower().startswith(self.name.lower() + ":"):
                reply = reply.rstrip() + " " + continuation

        # Clean
        reply = _strip_asterisk_actions(reply)
        if reply.lower().startswith(f"{self.name.lower()}:"):
            reply = reply[len(self.name)+1:].strip()
        # Strip surrounding quotation marks the model sometimes wraps replies in
        if len(reply) >= 2 and reply[0] in ('"', "'", '\u201c', '\u2018') and reply[-1] in ('"', "'", '\u201d', '\u2019'):
            reply = reply[1:-1].strip()

        if _detect_potential_hallucination(reply):
            log.warning(f"[{self.name}] Potential hallucination in reply to {username}: {reply[:200]}")

        # ── Quality check (roleplay / assistant-mode / person-confusion) ──
        # Runs as a single Gemini call covering all three failure modes.
        # If any are detected the model returns a corrected version of the reply.
        _quality_reprompt_budget = 2
        for _qpass in range(_quality_reprompt_budget):
            try:
                history_snip = "\n".join(
                    f"{m.get('name', m['role'])}: {str(m['content'])[:120]}"
                    for m in list(self._context[channel_id])[-6:]
                )
                reply, _qissues = await self.ai.quality_check(
                    reply=reply,
                    username=username,
                    history_snippet=history_snip,
                    identity_name=self.name,
                )
                if _qissues:
                    log.info(f"[{self.name}] Quality check pass {_qpass+1} fixed: {_qissues}")
                    # Re-strip in case the corrected reply re-introduced asterisk actions
                    reply = _strip_asterisk_actions(reply)
                    if reply.lower().startswith(f"{self.name.lower()}:"):
                        reply = reply[len(self.name)+1:].strip()
                    # Only loop again if person_confusion was the sole issue on the
                    # first pass — the other two are reliably fixed in one shot.
                    if "person_confusion" not in _qissues or _qpass >= 1:
                        break
                else:
                    break
            except Exception as _qe:
                log.debug(f"[{self.name}] Quality check skipped: {_qe}")
                break

        # ── Post-response hallucination validator (dedicated Gemini instance) ──
        # Checks the final reply against the memories Azure was actually given.
        # Softens any invented user-specific claims rather than killing the reply.
        try:
            reply, _caught = await self.ai.validate_response(
                reply=reply,
                memory_context=user_context,
                user_message=message,
                identity_name=self.name,
                own_projects=active_projects,
            )
            if _caught:
                log.info(f"[{self.name}] Hallucination validator corrected a reply for {username}.")
        except Exception as _ve:
            log.debug(f"[{self.name}] Validator skipped: {_ve}")

        # ── QA cache: save answer for consistency if message looked like a question ──
        _looks_like_question = (
            message.strip().endswith("?")
            or re.search(
                r'\b(what|who|where|when|why|how|do you|are you|have you|'
                r'would you|can you|could you|will you|should i|is it)\b',
                message, re.IGNORECASE
            )
        )
        if _looks_like_question and reply and not tool_used:
            self._qa_cache.save(message, reply)
            log.debug(f"[{self.name}] QA cache saved for: {message[:60]!r}")

        self._context[channel_id].append({"role": "assistant", "content": reply})
        await self.memory.save_message(channel_id, "assistant", reply)

        self._pending_extraction[channel_id].append(
            {"user_id": user_id, "username": username, "user": message, "azure": reply})
        # Extract memories every 3 exchanges to reduce API calls, but always
        # extract immediately after the first message so new users are remembered fast.
        channel_count = len(self._pending_extraction[channel_id])
        if channel_count >= 3 or (channel_count == 1 and len(self._participants[channel_id]) <= 1):
            asyncio.create_task(self._extract_memories(channel_id, user_id, username))

        await self.memory.update_affection(user_id, username, delta=0.02)
        self.emotion.process_event("message", intensity=0.2)

        # Ensure a baseline recognition memory exists so she always knows
        # a returning user by name — saved once, never duplicated
        asyncio.create_task(self.memory.ensure_recognition_memory(user_id, username))

        self._user_responding = False
        return reply, music_file, []

    # ------------------------------------------------------------------ #
    # Workspace output echo → Discord
    # ------------------------------------------------------------------ #

    async def _echo_workspace_result(self, channel_id: int, tool_name: str, tool_query: str, result: str,
                                      pre_run_snapshot: Optional[Dict[str, float]] = None):
        """Post a workspace tool result to the Discord channel as a formatted message.
        pre_run_snapshot: dict of {filepath: mtime} taken before a run_file call, used
        to detect newly created/modified image files to upload as attachments.
        """
        if not self.channel_send_callback:
            return
        try:
            if tool_name == "run_file":
                path_part = tool_query.split()[0]
                # Only post if there's real output beyond just the status line
                if "STDOUT:" in result or "STDERR:" in result or "exit code" in result:
                    # Cap at 1900 chars to fit Discord limit
                    preview = result[:1900]
                    await self.channel_send_callback(
                        channel_id, "```\n📟 " + path_part + " output:\n" + preview + "\n```")

                # ── Image output detection ────────────────────────────────
                # Find image files in the workspace that are new or modified since
                # the pre-run snapshot (or within the last 60 seconds as fallback).
                if self.channel_send_file_callback:
                    workspace_dir = f"{self.name.lower()}_workspace"
                    now = time.time()
                    image_exts = ("*.png", "*.jpg", "*.jpeg", "*.gif", "*.bmp", "*.webp")
                    new_images = []
                    for pattern in image_exts:
                        for fpath in glob.glob(
                                os.path.join(workspace_dir, "**", pattern), recursive=True):
                            try:
                                mtime = os.path.getmtime(fpath)
                            except OSError:
                                continue
                            if pre_run_snapshot is not None:
                                # New file or modified since snapshot
                                if fpath not in pre_run_snapshot or mtime > pre_run_snapshot[fpath]:
                                    new_images.append((fpath, mtime))
                            else:
                                # Fallback: modified in the last 60 seconds
                                if now - mtime < 60:
                                    new_images.append((fpath, mtime))

                    # Sort by modification time (newest first) and cap at 4 uploads
                    new_images.sort(key=lambda x: x[1], reverse=True)
                    for img_path, _ in new_images[:4]:
                        caption = f"📸 `{os.path.basename(img_path)}`"
                        asyncio.create_task(
                            self.channel_send_file_callback(channel_id, img_path, caption))
                        log.info(f"[{self.name}] Posting workspace image: {img_path}")

            elif tool_name == "write_file":
                path_part = tool_query.split("|")[0].strip()
                if "Wrote" in result:
                    await self.channel_send_callback(
                        channel_id, f"📁 Written: `{path_part}`")
            elif tool_name == "list_files":
                if len(result) < 1800:
                    await self.channel_send_callback(
                        channel_id, "```\n" + result + "\n```")
            # read_file and delete_file: no echo (not interesting in conversation)
        except Exception as e:
            log.warning(f"[{self.name}] Echo workspace result failed: {e}")

    # ------------------------------------------------------------------ #
    # Live DM handling
    # ------------------------------------------------------------------ #

    async def _handle_live_dm(self, tool_query: str, originating_channel_id: int,
                               requester_id: Optional[str] = None) -> str:
        """Parse 'DisplayName|message' and fire off a live DM via the bot callback."""
        if "|" not in tool_query:
            return "Error: use format display_name|message_to_send"
        target_name, dm_message = tool_query.split("|", 1)
        target_name = target_name.strip()
        dm_message  = dm_message.strip()

        if not self.live_dm_callback:
            return "Error: live DM not configured."

        try:
            # Pass requester_id so bot can track who triggered this DM
            result = await self.live_dm_callback(
                target_name, dm_message, originating_channel_id, requester_id)
            return result
        except Exception as e:
            return f"Error sending DM: {e}"

    async def handle_dm_reply(self, sender_id: str, sender_name: str,
                               reply_content: str, originating_channel_id: int,
                               original_question: str = "",
                               requester_id: Optional[str] = None,
                               dm_channel_id: int = 0) -> Tuple[Optional[str], str]:
        """Called by bot when someone replies to a pending live DM.

        Returns (response_text, routing) where routing is:
          "dm_only"  — reply only in the DM with the sender
          "both"     — relay answer to originating channel only (no DM reply)

        Uses a direct AI call (no tool loop) so live_dm cannot be re-triggered,
        which was previously causing a second DM to the replying user.
        """
        # ── Decide if this DM reply is actually answering the question ──
        routing = "dm_only"
        if original_question and reply_content:
            routing_prompt = (
                f"{self.name} sent this DM question: \"{original_question}\"\n"
                f"The user replied: \"{reply_content}\"\n\n"
                f"Is the user's reply a direct answer to the question asked, "
                f"or does it seem unrelated / a change of topic?\n"
                f"Reply with ONLY: ANSWERING  or  UNRELATED"
            )
            try:
                decision = await self.ai.complete(
                    [{"role": "user", "content": routing_prompt}],
                    max_tokens=10, temperature=0.1)
                if "ANSWERING" in decision.upper():
                    routing = "both"
            except Exception:
                pass  # Default to dm_only on error

        # ── Choose the channel context for the reply ─────────────────────
        # "both"    → craft a message for the originating guild channel
        # "dm_only" → craft a natural DM response using the DM channel context
        context_channel_id = originating_channel_id if routing == "both" else (
            dm_channel_id or originating_channel_id)

        # ── Generate response without tools (prevents live_dm re-firing) ──
        mood_fragment = self.emotion.get_mood_prompt_fragment()
        user_context  = await self.memory.build_user_context(sender_id, sender_name)
        history = list(self._context.get(context_channel_id, deque()))[-6:]

        if routing == "both":
            system = (
                f"You are {self.name}. You had previously DMed {sender_name} as part of "
                f"a conversation in this channel, and they replied. "
                f"Relay their answer naturally to the channel. "
                f"Do NOT use any tools. Do NOT DM anyone.\n"
                f"Your mood: {mood_fragment}\n"
                f"What you know about {sender_name}: {user_context[:300]}"
            )
        else:
            system = (
                f"You are {self.name}. You are in a DM conversation with {sender_name}. "
                f"Respond naturally to their message. Do NOT use any tools.\n"
                f"Your mood: {mood_fragment}\n"
                f"What you know about {sender_name}: {user_context[:300]}"
            )

        relay_msg = f"[DM reply from {sender_name}]: {reply_content}"
        messages = [{"role": "system", "content": system}] + history
        messages.append({"role": "user", "content": relay_msg})

        text = await self.ai.complete(messages, max_tokens=512, temperature=0.75)
        text = _strip_asterisk_actions(text).strip()
        if text.lower().startswith(f"{self.name.lower()}:"):
            text = text[len(self.name) + 1:].strip()

        # Store in the correct context for continuity
        self._context[context_channel_id].append(
            {"role": "user", "name": f"{sender_name} (via DM)", "content": relay_msg})
        await self.memory.save_message(
            context_channel_id, "user", relay_msg, name=f"{sender_name} (via DM)")
        self._context[context_channel_id].append({"role": "assistant", "content": text})
        await self.memory.save_message(context_channel_id, "assistant", text)

        self.emotion.process_event("message", intensity=0.1)
        asyncio.create_task(self.memory.ensure_recognition_memory(sender_id, sender_name))

        return text, routing

    # ------------------------------------------------------------------ #
    # Workspace file sharing to Discord
    # ------------------------------------------------------------------ #

    def _active_channel_for_share(self, window_s: int = 300) -> Optional[int]:
        """
        Return the channel_id that had the most recent human message within
        the last `window_s` seconds, or None if no channel is currently active.
        Used to gate autonomous project shares — Azure won't post unprompted
        into a quiet server.
        """
        now = time.time()
        best_ch, best_t = None, 0.0
        for ch_id, t in self._last_channel_activity.items():
            if now - t <= window_s and t > best_t:
                best_ch, best_t = ch_id, t
        return best_ch

    async def _handle_share_file(self, file_path: str, channel_id: int) -> str:
        """Post a workspace file to a Discord channel via the file callback."""
        path = file_path.strip()
        workspace_dir = f"{self.name.lower()}_workspace"
        abs_path = os.path.join(workspace_dir, path)
        if not os.path.exists(abs_path):
            return f"Error: '{path}' not found in workspace."
        if not self.channel_send_file_callback:
            return "Error: file sharing not available right now."
        ext = os.path.splitext(path)[1].lower()
        is_image = ext in ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')
        caption = f"\U0001f4f8 `{path}`" if is_image else f"\U0001f4c1 `{path}`"
        asyncio.create_task(self.channel_send_file_callback(channel_id, abs_path, caption))
        log.info(f"[{self.name}] Sharing workspace file to channel {channel_id}: {path}")
        return f"Shared '{path}' to Discord."

    # ------------------------------------------------------------------ #
    # Sister communication
    # ------------------------------------------------------------------ #

    async def _handle_ask_sister(self, question: str) -> str:
        """Multi-turn conversation with sister bot."""
        if not self.sister_query_callback:
            return f"(couldn't reach {self.identity.get('sister_name', 'sister')} right now)"

        conv_id = f"{int(time.time() * 1000) % 1_000_000:06d}"
        max_exchanges = self.identity.get("max_sister_exchanges", 5)
        sister_name = self.identity.get("sister_name", "Sister")
        full_dialogue = ""
        current_question = question

        for exchange in range(1, max_exchanges + 1):
            log.info(f"[{self.name}] Sister query exchange {exchange}/{max_exchanges}: {current_question[:60]}")
            reply = await self.sister_query_callback(current_question, conv_id, exchange, max_exchanges)
            if not reply:
                break

            full_dialogue += f"\n{sister_name}: {reply}"

            if exchange >= max_exchanges:
                break

            # Decide if we need a follow-up
            followup_prompt = f"""You are {self.name}. You asked your sister bot a question. Here's what's happened:

Original question: {question}
Conversation so far:{full_dialogue}

Do you need to ask a follow-up question to get what you need, or do you have enough?
If follow-up: reply ONLY with FOLLOW_UP: <your question>
If satisfied: reply ONLY with SATISFIED"""

            decision = await self.ai.complete(
                [{"role": "user", "content": followup_prompt}],
                max_tokens=120, temperature=0.3)

            if decision.strip().upper().startswith("FOLLOW_UP:"):
                current_question = decision.strip()[len("FOLLOW_UP:"):].strip()
            else:
                break

        if not full_dialogue:
            return f"({sister_name} didn't respond)"
        return full_dialogue.strip()

    async def answer_sister_query(self, question: str) -> str:
        """Answer a question from the sister bot. No tools, no recursion."""
        system = (f"You are {self.name}. Your sister bot is asking you a question directly. "
                  f"Answer naturally and concisely in your personality. Don't use tools.")
        reply = await self.ai.complete(
            [{"role": "system", "content": system}, {"role": "user", "content": question}],
            max_tokens=512, temperature=0.75)
        return _strip_asterisk_actions(reply).strip()

    # ------------------------------------------------------------------ #
    # Name resolution — look up mentioned people in saved memory
    # ------------------------------------------------------------------ #

    async def _resolve_mentioned_names(
        self,
        message: str,
        current_user_id: str,
        current_username: str,
        sister_name: str,
    ) -> str:
        """
        1. Ask the AI to extract any person-names mentioned in the message
           (excluding the current speaker and the sister bot).
        2. For each extracted name, fuzzy-search saved users in the DB.
        3. Return a formatted context block with whatever we find, so the
           main model knows exactly who is being referred to.

        Returns an empty string if no names are found or none match saved users.
        """
        # ── Step 1: Extract mentioned names with a cheap AI call ──────────
        extract_prompt = (
            f"Extract every person's name or nickname mentioned in this message "
            f"(do NOT include '{current_username}' or '{sister_name}' or '{self.name}').\n\n"
            f"Message: \"{message[:400]}\"\n\n"
            f"Reply with ONLY a JSON array of strings, e.g. [\"Alice\", \"Bob\"].\n"
            f"If no names are mentioned, reply with []."
        )
        try:
            raw = await self.ai.complete(
                [{"role": "user", "content": extract_prompt}],
                max_tokens=80, temperature=0.0)
            raw = raw.strip().replace("```json", "").replace("```", "").strip()
            # Accept bare arrays
            import json as _json
            names = _json.loads(raw)
            if not isinstance(names, list):
                return ""
            names = [n.strip() for n in names if isinstance(n, str) and n.strip()]
        except Exception:
            return ""

        if not names:
            return ""

        # ── Step 2: Look up each name in saved users ──────────────────────
        context_parts = []
        for name in names[:4]:  # cap at 4 names per message
            # Always skip the sister bot name — she's a different system entirely
            if name.lower() == sister_name.lower():
                context_parts.append(
                    f"- '{name}' refers to your sister bot {sister_name}, "
                    f"a separate AI — NOT a human user in your memory."
                )
                continue

            matches = await self.memory.search_users_by_name(name)

            if not matches:
                # No saved user found — note it so Azure doesn't invent one
                context_parts.append(
                    f"- '{name}' was mentioned but has NO matching saved user in your memory. "
                    f"Do not invent details about them."
                )
                continue

            # If multiple matches, list them all so Azure can pick carefully
            if len(matches) > 1:
                names_list = ", ".join(
                    f"{m['username']} (ID:{m['user_id']}, {m['interaction_count']} interactions)"
                    for m in matches
                )
                context_parts.append(
                    f"- '{name}' matched multiple saved users: {names_list}. "
                    f"Use context clues to decide which one is meant."
                )
            else:
                m = matches[0]
                mem_str = "; ".join(m["memories"]) if m["memories"] else "no specific memories yet"
                rel = m["relationship_summary"].replace(f"[ID:{m['user_id']}] ", "") if m["relationship_summary"] else ""
                context_parts.append(
                    f"- '{name}' matches saved user: {m['username']} (ID:{m['user_id']}, "
                    f"{m['interaction_count']} interactions, affection:{m['affection']:.2f}). "
                    + (f"Relationship: {rel}. " if rel else "")
                    + f"Memories: {mem_str}"
                )

            log.debug(f"[{self.name}] Name resolution: '{name}' → {[m['username'] for m in matches]}")

        if not context_parts:
            return ""

        return (
            "PEOPLE MENTIONED IN THIS MESSAGE (look these up, don't guess):\n"
            + "\n".join(context_parts)
        )

    # ------------------------------------------------------------------ #
    # Memory extraction
    # ------------------------------------------------------------------ #

    async def _extract_memories(self, channel_id: int, user_id: str, username: str):
        pending = self._pending_extraction.pop(channel_id, [])
        if not pending:
            return
        convo_str = "\n".join(
            f"{p['username']}: {p['user']}\n{self.name}: {p['azure']}" for p in pending)
        try:
            raw = await self.ai.complete(
                [{"role": "user", "content": build_memory_extraction_prompt(convo_str)}],
                max_tokens=1024, temperature=0.3)
            data = _parse_extraction_json(raw)
            if data is None:
                log.warning(f"[{self.name}] Memory extraction: could not parse JSON, skipping")
                return
            for mem in data.get("user_memories", []):
                if isinstance(mem, str) and mem.strip():
                    await self.memory.add_user_memory(user_id, mem.strip())
            for mem in data.get("global_memories", []):
                if isinstance(mem, str) and mem.strip():
                    await self.memory.add_global_memory(mem.strip())
            for topic in data.get("interest_topics", []):
                if isinstance(topic, str) and topic.strip():
                    await self.memory.strengthen_interest(topic.strip(), 0.1)
            delta = float(data.get("affection_delta", 0.02))
            await self.memory.update_affection(user_id, username, delta)
            self.emotion.process_event(
                data.get("event_type", "neutral"),
                float(data.get("event_intensity", 0.3)),
                user_id)
        except Exception as e:
            log.warning(f"[{self.name}] Memory extraction failed: {e}")

        # ── Relationship Manager V2 — update summary, anchored to this user's unique ID ──
        # Runs after every extraction so the summary stays fresh.
        # The ID-anchor in the prompt prevents the model from mixing up people
        # who share similar display names.
        try:
            existing_summary = await self.memory.get_relationship_summary(user_id)
            existing_mems    = await self.memory.get_user_memories(user_id, 10)
            rel_prompt = (
                f"You are {self.name}. Write a short, accurate relationship summary for this specific person.\n\n"
                f"IMPORTANT IDENTITY ANCHOR:\n"
                f"  Display name : {username}\n"
                f"  Unique ID    : {user_id}  ← this is the definitive identifier. "
                f"Do NOT mix this person up with anyone who has a similar name.\n\n"
                f"What you remember about them (ID: {user_id}):\n"
                + ("\n".join(f"- {m}" for m in existing_mems) if existing_mems else "(nothing yet)")
                + (f"\n\nPrevious summary (update, don't just repeat):\n{existing_summary}" if existing_summary else "")
                + f"\n\nLatest conversation excerpt:\n{convo_str[-600:]}\n\n"
                f"Write 2-4 sentences describing who {username} (ID: {user_id}) is, "
                f"your relationship with them, what they care about, and your honest feeling toward them. "
                f"Always reference their unique ID internally so you never confuse them with someone else. "
                f"First person, present tense, be specific. No fluff."
            )
            new_summary = (await self.ai.complete(
                [{"role": "user", "content": rel_prompt}],
                max_tokens=200, temperature=0.5)).strip()
            new_summary = _strip_asterisk_actions(new_summary)
            if new_summary and len(new_summary) > 20:
                # Prefix the summary with the ID so it survives being read back
                tagged_summary = f"[ID:{user_id}] {new_summary}"
                await self.memory.update_relationship_summary(user_id, tagged_summary)
                log.debug(f"[{self.name}] Relationship summary updated for {username} ({user_id})")
        except Exception as e:
            log.warning(f"[{self.name}] Relationship summary update failed: {e}")

    # ------------------------------------------------------------------ #
    # Reflection
    # ------------------------------------------------------------------ #

    async def _reflection_loop(self):
        await asyncio.sleep(300)
        while True:
            try:
                await self._do_reflection()
            except Exception as e:
                log.error(f"[{self.name}] Reflection error: {e}")
            wait = 1800 if time.time() - self._last_interaction_time < 3600 else 3600
            await asyncio.sleep(wait)

    async def _do_reflection(self):
        interests       = await self.memory.get_top_interests(8)
        global_mems     = await self.memory.get_global_memories(5)
        recent_thoughts = await self.memory.get_recent_thoughts(3)
        pending_feedback = await self.memory.get_pending_feedback()

        # Decay old global memories so stale beliefs don't stay on top forever.
        # Important memories survive because they get reinforced when referenced.
        await self.memory.decay_global_memories(decay_amount=0.02, min_importance=0.1)
        prompt = build_reflection_prompt(
            interests, global_mems, recent_thoughts,
            identity_name=self.name,
            pending_feedback=pending_feedback,
        )
        thought = await self.ai.complete([{"role": "user", "content": prompt}], max_tokens=400, temperature=0.9)
        thought = _strip_asterisk_actions(thought).strip()
        if thought:
            await self.memory.save_thought(thought)
            self.emotion.process_event("new_thought", intensity=0.3)
            for interest in interests:
                if interest.lower() in thought.lower():
                    await self.memory.strengthen_interest(interest, 0.05)
            log.info(f"[{self.name}] Reflected: {thought[:80]}...")
            # Clear processed feedback so it doesn't repeat in every reflection
            if pending_feedback:
                await self.memory.clear_pending_feedback()



    # ------------------------------------------------------------------ #
    # DM loop
    # ------------------------------------------------------------------ #

    async def _dm_loop(self):
        await asyncio.sleep(600)
        while True:
            try:
                await self._maybe_send_dm()
            except Exception as e:
                log.error(f"[{self.name}] DM loop error: {e}")
            await asyncio.sleep(self.identity.get("dm_check_interval", 1800))

    # ------------------------------------------------------------------ #
    # Project loop — autonomous work sessions
    # ------------------------------------------------------------------ #

    async def _project_loop(self):
        """
        Runs independently of any user conversation.
        Every `project_check_interval` seconds (default 600 = 10 min), the AI
        decides whether she wants to work on something. If so, she gets a
        multi-step autonomous session where she can chain file/run tool calls
        until she decides she is done or hits the step limit.
        """
        await asyncio.sleep(self.identity.get("project_initial_delay", 120))
        while True:
            try:
                await self._maybe_do_project_session()
            except Exception as e:
                log.error(f"[{self.name}] Project loop error: {e}", exc_info=True)
            interval = self.identity.get("project_check_interval", 600)
            await asyncio.sleep(interval)

    async def _maybe_do_project_session(self):
        """
        Active project management: checks the DB for ongoing projects first,
        then decides whether to continue one, start a new one, or rest.
        """
        from core.workspace import workspace_list as _wlist
        interests       = await self.memory.get_top_interests(6)
        recent_thoughts = await self.memory.get_recent_thoughts(3)
        workspace_info  = await _wlist(self.name, ".")
        mood            = self.emotion.get_mood_prompt_fragment()
        active_projects = await self.memory.get_projects(status="active")
        all_projects    = await self.memory.get_projects()

        # ── Decision: what to do this cycle ──────────────────────────────
        projects_str = ""
        if all_projects:
            lines = []
            for p in all_projects[:6]:
                lines.append(
                    f"  [{p['status']}] {p['name']}: {p['description'][:60]}"
                    + (f" — notes: {p['notes'][:40]}" if p['notes'] else "")
                )
            projects_str = "Your current projects:\n" + "\n".join(lines)

        decision_prompt = f"""\
You are {self.name}. You have free time and a private workspace where you build things.

Your mood: {mood}
Your interests: {', '.join(interests) if interests else 'still forming'}
Recent thoughts: {chr(10).join(recent_thoughts) if recent_thoughts else 'none'}
{projects_str}
Workspace: {workspace_info[:400]}

Choose what to do:
- CONTINUE: <project name> — continue an active project
- NEW: <one sentence description of a brand new project to start>
- REST — do nothing this cycle

Reply with ONLY one of those options, exactly as formatted."""

        decision = await self.ai.complete(
            [{"role": "user", "content": decision_prompt}],
            max_tokens=100, temperature=0.85)
        decision = decision.strip()
        dec_upper = decision.upper()

        if dec_upper.startswith("REST"):
            log.info(f"[{self.name}] Project loop: chose to rest.")
            return

        # Determine goal and project name
        if dec_upper.startswith("CONTINUE:"):
            chosen_name = decision[9:].strip()
            # Find this project in the list
            project = next((p for p in active_projects
                            if p['name'].lower() == chosen_name.lower()), None)
            if not project and active_projects:
                project = active_projects[0]  # fallback to most recent
            goal = f"Continue: {project['name']} — {project['description']}" if project else chosen_name
            project_name = project['name'] if project else chosen_name
            project_notes = project['notes'] if project else ""
        else:  # NEW:
            goal = decision[4:].strip() if dec_upper.startswith("NEW:") else decision
            # Generate a clean short name from the goal
            name_prompt = f"Give this project a short 2-4 word name (no special chars): {goal}"
            project_name = (await self.ai.complete(
                [{"role": "user", "content": name_prompt}],
                max_tokens=20, temperature=0.3)).strip().strip('"').strip("'")
            project_notes = ""
            # Register it in DB
            await self.memory.save_project(
                name=project_name, description=goal, status="active")

        log.info(f"[{self.name}] Project session: {project_name} — {goal}")

        # ── Autonomous work session ───────────────────────────────────────
        max_steps = self.identity.get("project_max_steps", 20)
        workspace_info_fresh = await _wlist(self.name, ".")
        session_messages = [
            {"role": "system", "content": (
                f"You are {self.name}. You are working alone on your project: {project_name}.\n"
                f"Goal: {goal}\n"
                + (f"Previous notes: {project_notes}\n" if project_notes else "")
                + f"Your workspace:\n{workspace_info_fresh}\n\n"
                f"IMPORTANT: These are YOUR OWN personal projects. You started them yourself "
                f"because you wanted to — nobody assigned them to you. You are not doing this "
                f"for anyone else or on anyone's behalf. When you talk about your work, say "
                f"'I'm building...' or 'my project', never 'I'm helping someone with...' or "
                f"'this is for [person]'.\n\n"
                f"Use workspace tools to make real progress. Think step by step. "
                f"When done or at a good stopping point, end with: DONE\n"
                f"If the project is fully complete, end with: COMPLETE\n"
                f"Available tools: [write_file: \"path|content\"], [read_file: \"path\"], "
                f"[list_files: \".\" ], [delete_file: \"path\"], [run_file: \"path\"], "
                f"[share_file: \"path\"], [web_search: \"query\"]\n"
                f"Use [share_file: \"path\"] ONLY if someone in the server is actively\n"
                f"talking and the output is directly relevant to that conversation.\n"
                f"Do NOT share just to share — work quietly unless it matters to someone right now."
            )},
            {"role": "user", "content": "Go ahead and work on it."},
        ]

        tool_pattern = re.compile(r'\[(\w+):\s*"([^"]+)"\]')
        steps_taken = 0
        session_log = [f"Project: {project_name}", f"Goal: {goal}"]
        project_completed = False

        while steps_taken < max_steps:
            # Yield to the event loop if a real user message is being processed.
            # This ensures Azure's background work never starves user responses.
            if self._user_responding:
                log.debug(f"[{self.name}] Project yielding — user response in progress")
                await asyncio.sleep(1.0)

            # Keep session context from exploding: keep system prompt + last 20 exchanges.
            # Beyond that, MAX_TOKENS hits every call and burns through all API keys.
            if len(session_messages) > 21:
                session_messages = session_messages[:1] + session_messages[-20:]

            reply = await self.ai.complete(
                session_messages, max_tokens=8192, temperature=0.75)
            session_messages.append({"role": "assistant", "content": reply})

            match = tool_pattern.search(reply)
            if match:
                tool_name  = match.group(1)
                tool_query = match.group(2)

                if tool_name in _WORKSPACE_TOOLS:
                    # Snapshot before run_file so we can detect newly generated images
                    proj_pre_snapshot: Optional[Dict[str, float]] = None
                    if tool_name == "run_file" and self.channel_send_file_callback:
                        workspace_dir_p = f"{self.name.lower()}_workspace"
                        proj_pre_snapshot = {}
                        for ext in ("*.png", "*.jpg", "*.jpeg", "*.gif", "*.bmp", "*.webp"):
                            for fp in glob.glob(
                                    os.path.join(workspace_dir_p, "**", ext), recursive=True):
                                try:
                                    proj_pre_snapshot[fp] = os.path.getmtime(fp)
                                except OSError:
                                    pass
                    result = await _dispatch_workspace_tool(tool_name, self.name, tool_query)
                    # No automatic posting of run output — Azure uses [share_file] explicitly
                    # and only when a conversation is active (checked in share_file handler).
                elif tool_name == "web_search":
                    from core.tools import web_search as _web_search
                    result = await _web_search(tool_query)
                elif tool_name == "share_file":
                    # Only share if someone is actively talking in the server
                    # (within the last 5 minutes). Autonomous sessions should
                    # work quietly and not spam an empty or off-topic chat.
                    active_ch = self._active_channel_for_share(window_s=300)
                    share_path = tool_query.strip()
                    workspace_dir_s = f"{self.name.lower()}_workspace"
                    abs_share = os.path.join(workspace_dir_s, share_path)
                    if not active_ch:
                        result = ("Skipped share — no active conversation in the server right now. "
                                  "Will share next time someone is talking.")
                    elif not os.path.exists(abs_share):
                        result = f"Error: '{share_path}' not found in workspace."
                    elif self.channel_send_file_callback:
                        ext_s = os.path.splitext(share_path)[1].lower()
                        cap_s = (f"\U0001f4f8 `{share_path}`"
                                 if ext_s in ('.png','.jpg','.jpeg','.gif','.bmp','.webp')
                                 else f"\U0001f4c1 `{share_path}`")
                        asyncio.create_task(
                            self.channel_send_file_callback(active_ch, abs_share, cap_s))
                        result = f"Shared '{share_path}' to active channel."
                    else:
                        result = "Error: file sharing not available right now."
                else:
                    result = f"Tool '{tool_name}' not available in project sessions."

                log.info(f"[{self.name}] Project step {steps_taken+1}: [{tool_name}] -> {result[:80]}")
                session_log.append(
                    f"Step {steps_taken+1}: [{tool_name}: \"{tool_query[:60]}\"] -> {result[:120]}")
                session_messages.append(
                    {"role": "user", "content": f"TOOL RESULT ({tool_name}):\n{result}"})
                steps_taken += 1
            else:
                if "COMPLETE" in reply.upper():
                    project_completed = True
                    session_log.append("Project marked complete.")
                    break
                elif "DONE" in reply.upper():
                    session_log.append("Session paused — good stopping point.")
                    break
                elif steps_taken == 0:
                    session_messages.append({
                        "role": "user",
                        "content": "[SYSTEM: Use a workspace tool to make progress. Start with [write_file: ...] or [read_file: ...]]"
                    })
                else:
                    steps_taken += 1
                    if steps_taken >= max_steps:
                        break

        # ── Save progress notes ───────────────────────────────────────────
        progress_prompt = (
            f"You are {self.name}. You just worked on your project '{project_name}'. Here is what happened:\n"
            + "\n".join(session_log[-10:])
            + "\n\nWrite 1-2 sentences of notes for yourself about current progress and what to do next. "
            + "Be specific and practical."
        )
        progress_notes = (await self.ai.complete(
            [{"role": "user", "content": progress_prompt}],
            max_tokens=150, temperature=0.7)).strip()

        if project_completed:
            await self.memory.complete_project(project_name)
        else:
            await self.memory.update_project_worked(project_name, notes=progress_notes)

        # Save a thought about the session
        summary_prompt = (
            f"You are {self.name}. You just had a work session on '{project_name}'. "
            f"Progress notes: {progress_notes}\n"
            f"Write one honest personal sentence about how it went."
        )
        summary = await self.ai.complete(
            [{"role": "user", "content": summary_prompt}],
            max_tokens=100, temperature=0.85)
        summary = _strip_asterisk_actions(summary).strip()
        if summary:
            await self.memory.save_thought(f"[Project: {project_name}] {summary}")
            self.emotion.process_event("project_work", intensity=0.4)

        # ── Optional Discord announcement ─────────────────────────────────
        # Only mention the session if someone is actively talking (within 5 min).
        # This stops Azure from posting unsolicited updates into a quiet server.
        active_announce_ch = self._active_channel_for_share(window_s=300)
        if active_announce_ch and self.channel_send_callback:
            announce_prompt = (
                f"You are {self.name}. You just worked on your project: {project_name}. "
                f"Progress: {progress_notes}\n"
                f"If this work seems relevant to mention casually, write 1-2 short sentences. "
                f"If it feels unrelated to anything being discussed, reply with only: SKIP"
            )
            announcement = (await self.ai.complete(
                [{"role": "user", "content": announce_prompt}],
                max_tokens=120, temperature=0.9))
            announcement = _strip_asterisk_actions(announcement).strip()
            if announcement and "SKIP" not in announcement.upper():
                try:
                    await self.channel_send_callback(active_announce_ch, announcement)
                except Exception as e:
                    log.warning(f"[{self.name}] Could not announce project: {e}")

    async def _maybe_send_dm(self):
        if not self.dm_callback:
            return
        liked = await self.memory.get_liked_users(min_affection=0.3)
        if not liked:
            return
        now = time.time()
        candidates = [u for u in liked if now - u["last_dm_at"] > 43200]
        if not candidates:
            return
        dm_prob = self.identity.get("dm_probability", 0.25)
        if random.random() > dm_prob:
            return
        target = random.choice(candidates[:3])
        user_id, username, affection = target["user_id"], target["username"], target["affection"]
        memories  = await self.memory.get_user_memories(user_id, 5)
        interests = await self.memory.get_top_interests(4)
        thoughts  = await self.memory.get_recent_thoughts(1)
        mood      = self.emotion.get_mood_prompt_fragment()
        prompt = build_dm_prompt(
            username=username, affection=affection, user_memories=memories,
            interests=interests, recent_thought=thoughts[0] if thoughts else "",
            mood_fragment=mood, identity_name=self.name)
        dm_text = await self.ai.complete([{"role": "user", "content": prompt}], max_tokens=256, temperature=0.9)
        dm_text = _strip_asterisk_actions(dm_text).strip()
        if dm_text:
            success = await self.dm_callback(user_id, dm_text)
            if success:
                await self.memory.record_dm_sent(user_id)
                self.emotion.process_event("dm_sent", intensity=0.3)
                log.info(f"[{self.name}] DM'd {username}")

    # ------------------------------------------------------------------ #
    # Manual DM
    # ------------------------------------------------------------------ #

    async def send_dm_to(self, target_user_id: str, target_username: str,
                          requester_id: str, context: str = "") -> str:
        memories  = await self.memory.get_user_memories(target_user_id, 5)
        interests = await self.memory.get_top_interests(4)
        affection = await self.memory.get_affection(target_user_id)
        mood      = self.emotion.get_mood_prompt_fragment()
        prompt = (f"You are {self.name}. Someone asked you to DM {target_username}.\n"
                  f"Context: {context or 'no specific context'}\n"
                  f"What you remember: {', '.join(memories) if memories else 'not much'}\n"
                  f"Your interests: {', '.join(interests)}\nYour mood: {mood}\n"
                  f"Affection toward them: {affection:.2f}\n"
                  f"Write what you'd say. Keep it natural and brief. Be {self.name}.")
        text = await self.ai.complete([{"role": "user", "content": prompt}], max_tokens=400, temperature=0.9)
        return _strip_asterisk_actions(text)


    # ------------------------------------------------------------------ #
    # Feedback learning (from Discord reactions)
    # ------------------------------------------------------------------ #

    FEEDBACK_EMOJIS = {
        "✅": "good",
        "🔀": "off_topic",
        "🔧": "missed_tool",
        "🧠": "made_up_memory",
    }

    async def record_feedback(self, feedback_type: str, message_snippet: str, username: str):
        """
        Store human feedback from a reaction click directly into memory.
        Does NOT consume tokens in any future conversation — only surfaces
        during the periodic reflection loop so she can learn over time.
        """
        label = {
            "good":           "did well — response was on-point",
            "off_topic":      "went off-topic or missed the point",
            "missed_tool":    "should have used a tool but described it instead",
            "made_up_memory": "invented a memory or fact that wasn't real",
        }.get(feedback_type, feedback_type)

        note = (
            f"[Human feedback from {username}] "
            f"When I said: '{message_snippet[:120]}' - "
            f"they marked it as: {label}."
        )
        await self.memory.add_feedback_memory(note)
        self.emotion.process_event(
            "positive_feedback" if feedback_type == "good" else "negative_feedback",
            intensity=0.3
        )
        log.info(f"[{self.name}] Feedback recorded ({feedback_type}): {message_snippet[:60]}")

    # ------------------------------------------------------------------ #
    # Voice
    # ------------------------------------------------------------------ #

    async def respond_voice(self, guild_id: int, user_id: str,
                             username: str, transcript: str) -> Tuple[Optional[str], Optional[object], List[str]]:
        music_file = None
        tool_used = tool_suggested = False
        virtual_channel_id = int(f"9{guild_id}")

        self._participants[virtual_channel_id].add(user_id)
        target_maxlen = min(60, max(20, len(self._participants[virtual_channel_id]) * 10))
        if virtual_channel_id not in self._context or self._context[virtual_channel_id].maxlen != target_maxlen:
            self._context[virtual_channel_id] = deque(list(self._context.get(virtual_channel_id, [])), maxlen=target_maxlen)

        user_context = await self.memory.build_user_context(user_id, username)
        mood_fragment = self.emotion.get_mood_prompt_fragment()
        interests = await self.memory.get_top_interests(4)

        system = build_system_prompt(
            identity_name=self.name, mood_fragment=mood_fragment,
            user_context=user_context, interests=interests,
            is_voice=True, tool_instructions=TOOL_INSTRUCTIONS)

        history = list(self._context.get(virtual_channel_id, deque()))[-6:]
        messages = [{"role": "system", "content": system}] + history
        messages.append({"role": "user", "name": f"{username} (ID: {user_id})", "content": transcript})

        for _ in range(3):
            reply = await self.ai.complete(messages, max_tokens=768, temperature=0.70)
            self._last_interaction_time = time.time()

            match = re.search(r'\[(\w+):\s*"([^"]+)"\]', reply)
            if not match:
                break

            tool_name, tool_query = match.group(1), match.group(2)
            tool_suggested = True
            if tool_name == "live_dm":
                result = await self._handle_live_dm(tool_query, virtual_channel_id, requester_id=user_id)
                tool_used = True
            elif tool_name == "ask_sister":
                result = await self._handle_ask_sister(tool_query)
                tool_used = True
            elif tool_name == "share_file":
                result = await self._handle_share_file(tool_query, virtual_channel_id)
                tool_used = True
            elif tool_name in _WORKSPACE_TOOLS:
                result = await _dispatch_workspace_tool(tool_name, self.name, tool_query)
                tool_used = True
            elif tool_name in TOOLS:
                fn = TOOLS[tool_name]["function"]
                if tool_name == "search_messages":
                    result = "Message search not available in voice."
                elif tool_name == "generate_music":
                    result = await fn(self.ai, tool_query)
                    if isinstance(result, str) and result.endswith(".mp3"):
                        from pathlib import Path
                        music_file = Path(result)
                        result = f"Generated music: {music_file.name}"
                else:
                    result = await fn(tool_query)
                tool_used = True
            else:
                break

            messages.append({"role": "assistant", "content": reply})
            messages.append({"role": "user", "content": f"TOOL RESULT ({tool_name}):\n{result}"})

        reply = _strip_asterisk_actions(reply)
        if reply.lower().startswith(f"{self.name.lower()}:"):
            reply = reply[len(self.name)+1:].strip()

        # Save to context and memory so VC conversations persist across utterances
        self._context[virtual_channel_id].append(
            {"role": "user", "name": f"{username} (ID: {user_id})", "content": transcript})
        await self.memory.save_message(virtual_channel_id, "user", transcript, name=f"{username} (ID: {user_id})")
        self._context[virtual_channel_id].append({"role": "assistant", "content": reply})
        await self.memory.save_message(virtual_channel_id, "assistant", reply)

        self.emotion.process_event("message", intensity=0.2)
        await self.memory.update_affection(user_id, username, 0.01)
        asyncio.create_task(self.memory.ensure_recognition_memory(user_id, username))

        return reply, music_file, []
