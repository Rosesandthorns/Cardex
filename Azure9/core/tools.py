"""
Tool system — web search, message search, music generation, live DM, sister queries,
and sandboxed workspace file I/O + execution.
"""
import aiohttp
import logging
import re
import time
from pathlib import Path
from core.workspace import (
    workspace_write, workspace_read, workspace_list,
    workspace_delete, workspace_run,
)

log = logging.getLogger("azure.tools")

MUSIC_OUTPUT_DIR = Path("music_outputs")
MUSIC_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


async def web_search(query: str) -> str:
    log.info(f"Web search: {query}")
    try:
        url = "https://html.duckduckgo.com/html/"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data={"q": query}, headers=headers, timeout=10) as resp:
                if resp.status != 200:
                    return f"Search returned status {resp.status}"
                html = await resp.text()
                titles   = re.findall(r'<a class="result__a" [^>]*>(.*?)</a>', html, re.DOTALL)
                snippets = re.findall(r'<a class="result__snippet" [^>]*>(.*?)</a>', html, re.DOTALL)
                links    = re.findall(r'<a class="result__a" href="([^"]+)"', html)
                results = []
                for i in range(min(len(titles), 5)):
                    t = re.sub(r'<[^>]+>', '', titles[i]).strip()
                    s = re.sub(r'<[^>]+>', '', snippets[i]).strip() if i < len(snippets) else ""
                    l = links[i] if i < len(links) else ""
                    results.append(f"Title: {t}\nLink: {l}\nSnippet: {s}")
                return "\n\n".join(results) if results else "No results found."
    except Exception as e:
        return f"Search error: {e}"


async def search_messages(query: str, channel_id: int, callback) -> str:
    if not callback:
        return "Message search not configured."
    try:
        results = await callback(channel_id, query)
        if not results:
            return f"No messages found for '{query}'."
        return "\n".join(f"[{m['timestamp']}] {m['author']}: {m['content']}" for m in results)
    except Exception as e:
        return f"Message search error: {e}"


async def generate_music(ai_manager, prompt: str) -> str:
    log.info(f"Generating music: {prompt}")
    try:
        audio_bytes = await ai_manager.generate_music(prompt)
        if audio_bytes:
            filename = f"music_{int(time.time())}.mp3"
            filepath = MUSIC_OUTPUT_DIR / filename
            with open(filepath, "wb") as f:
                f.write(audio_bytes)
            return str(filepath.absolute())
        return "Error: Failed to generate music."
    except Exception as e:
        return f"Music generation error: {e}"


async def get_game_state(ai_manager) -> str:
    """Fetch the current game state (inventory, market, trades) from the app backend."""
    log.info("Fetching game state")
    try:
        state = await ai_manager.get_game_state()
        if not state:
            return "Error: Failed to fetch game state. Check API configuration."
        import json
        return json.dumps(state, indent=2)
    except Exception as e:
        return f"Get game state error: {e}"


async def perform_game_action(ai_manager, action: str, payload_json: str) -> str:
    """Perform a game action (LIST_CARD, BUY_CARD, etc.) via the app backend."""
    log.info(f"Performing game action: {action}")
    try:
        import json
        payload = json.loads(payload_json)
        result = await ai_manager.perform_game_action(action, payload)
        if not result:
            return f"Error: Failed to perform action '{action}'."
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"Perform game action error: {e}"


TOOLS = {
    "web_search": {
        "description": "Search the internet for real-time information.",
        "function": web_search,
        "parameters": ["query"]
    },
    "search_messages": {
        "description": "Search recent message history of this channel.",
        "function": search_messages,
        "parameters": ["query"]
    },
    "generate_music": {
        "description": "Generate an instrumental music track from a text prompt.",
        "function": generate_music,
        "parameters": ["prompt"]
    },
    "get_game_state": {
        "description": "Fetch your current game state (inventory, chips, market, pending trades).",
        "function": get_game_state,
        "parameters": []
    },
    "perform_game_action": {
        "description": "Perform a game action. Actions: LIST_CARD (payload: {userCardId, price}), BUY_CARD (payload: {listingId}), ACCEPT_TRADE (payload: {tradeId}), INITIATE_TRADE (payload: {receiverUid, senderCardIds, receiverCardIds}).",
        "function": perform_game_action,
        "parameters": ["action", "payload_json"]
    },
    # ── Workspace tools ──────────────────────────────────────────────────────
    "write_file": {
        "description": "Write or overwrite a file in your personal workspace.",
        "function": workspace_write,
        "parameters": ["path", "content"],
    },
    "read_file": {
        "description": "Read a file from your personal workspace.",
        "function": workspace_read,
        "parameters": ["path"],
    },
    "list_files": {
        "description": "List files and folders in your workspace (or a subfolder).",
        "function": workspace_list,
        "parameters": ["path"],
    },
    "delete_file": {
        "description": "Delete a file or folder from your workspace.",
        "function": workspace_delete,
        "parameters": ["path"],
    },
    "run_file": {
        "description": "Safety-scan and execute a file in your workspace. Supports .py .js .sh .ts",
        "function": workspace_run,
        "parameters": ["path"],
    },
}

TOOL_INSTRUCTIONS = """\
═══════════════════════════════════════
TOOL SYSTEM — READ THIS CAREFULLY
═══════════════════════════════════════

You have access to the following tools. To use one, output the tool call on its own line using EXACTLY this syntax:
[tool_name: "your query here"]

AVAILABLE TOOLS:
• [web_search: "query"] — Look up current information online.
• [search_messages: "query"] — Search recent message history in this channel.
• [generate_music: "prompt"] — Create an instrumental music track.
• [get_game_state: ""] — Check your inventory, chips, market listings, and pending trades.
• [perform_game_action: "action|payload_json"] — Perform a game action (e.g. BUY_CARD, LIST_CARD).
• [live_dm: "DisplayName|message to send"] — Directly message someone who isn't in this conversation.
• [ask_sister: "question"] — Ask your sister bot a question and have a real multi-turn exchange.

── YOUR PERSONAL WORKSPACE ─────────────────────────────────────────────────
You have a private folder (1 GB max) where you can build real projects that persist forever.
• [write_file: "path|content"] — Create or overwrite a file. Path is relative to your workspace.
• [read_file: "path"] — Read a file from your workspace.
• [list_files: "path"] — List files (use "." for root).
• [delete_file: "path"] — Delete a file or folder.
• [run_file: "path"] — Execute a file (.py, .js, .sh, .ts). A safety scanner runs first.

WORKSPACE EXAMPLES:
  [write_file: "scraper/main.py|import requests\nprint('hello')"]
  [run_file: "scraper/main.py"]
  [read_file: "scraper/main.py"]
  [list_files: "."]

NOTE: write_file uses | to separate the path from the content. Everything after the first | is the file content exactly as written.
────────────────────────────────────────────────────────────────────────────

CRITICAL RULES — VIOLATIONS WILL CAUSE BROKEN BEHAVIOR:
1. NEVER describe using a tool in prose. If you want to DM someone, USE [live_dm:...] RIGHT NOW.
2. NEVER describe asking your sister in prose. USE [ask_sister:...] RIGHT NOW.
3. NEVER invent or guess what a tool result would be.
4. Use only ONE tool per message turn.
5. After the tool result is returned, you may respond naturally.
═══════════════════════════════════════
"""
