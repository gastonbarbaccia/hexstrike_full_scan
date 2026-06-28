"""
AI Provider abstraction — supports Anthropic (Claude) and OpenAI (GPT/o-series).
Set AI_PROVIDER=openai and OPENAI_API_KEY to switch providers.
"""
import json
import os
from typing import Any, List, Optional

AI_PROVIDER  = os.environ.get("AI_PROVIDER", "anthropic").lower()
OPENAI_API_KEY  = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL    = os.environ.get("OPENAI_MODEL", "gpt-4o")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL   = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")


class UnifiedResponse:
    """Normalised response from any AI provider."""
    def __init__(self, text_blocks: List[str], tool_calls: List[dict], stop_reason: str):
        self.text_blocks = text_blocks   # List[str]
        self.tool_calls  = tool_calls    # List[{id, name, input}]
        self.stop_reason = stop_reason   # "end_turn" | "tool_use"
        self._raw: Any = None            # raw provider response (for history)


def _to_openai_tools(anthropic_tools: list) -> list:
    """Convert Anthropic tool schema → OpenAI function calling schema."""
    result = []
    for t in anthropic_tools:
        result.append({
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            }
        })
    return result


# ── Anthropic provider ───────────────────────────────────────────────────────

class AnthropicProvider:
    def __init__(self):
        import anthropic as _anthropic
        self.client = _anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        self.model  = ANTHROPIC_MODEL

    async def chat(self, system: str, tools: list, messages: list, max_tokens: int) -> UnifiedResponse:
        raw = await self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            tools=tools,
            messages=messages,
        )
        text_blocks = [b.text for b in raw.content if b.type == "text" and b.text.strip()]
        tool_calls  = [
            {"id": b.id, "name": b.name, "input": b.input}
            for b in raw.content if b.type == "tool_use"
        ]
        stop = "tool_use" if raw.stop_reason == "tool_use" else "end_turn"
        resp = UnifiedResponse(text_blocks, tool_calls, stop)
        resp._raw = raw.content  # keep raw content for message history
        return resp

    def append_assistant_turn(self, messages: list, response: UnifiedResponse):
        messages.append({"role": "assistant", "content": response._raw})

    def append_tool_results(self, messages: list, results: list):
        # results: List[{tool_use_id, content}]
        messages.append({
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": r["tool_use_id"], "content": r["content"]}
                for r in results
            ]
        })

    async def generate(self, prompt: str, max_tokens: int = 16000) -> str:
        resp = await self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text if resp.content else ""


# ── OpenAI provider ──────────────────────────────────────────────────────────

class OpenAIProvider:
    def __init__(self):
        import openai as _openai
        self.client = _openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
        self.model  = OPENAI_MODEL

    async def chat(self, system: str, tools: list, messages: list, max_tokens: int) -> UnifiedResponse:
        oai_messages = [{"role": "system", "content": system}] + messages
        oai_tools    = _to_openai_tools(tools)

        raw = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            tools=oai_tools,
            messages=oai_messages,
        )
        msg = raw.choices[0].message

        text_blocks = [msg.content] if msg.content and msg.content.strip() else []
        tool_calls  = []
        if msg.tool_calls:
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except Exception:
                    args = {}
                tool_calls.append({"id": tc.id, "name": tc.function.name, "input": args})

        stop = "tool_use" if raw.choices[0].finish_reason == "tool_calls" else "end_turn"
        resp = UnifiedResponse(text_blocks, tool_calls, stop)
        resp._raw = msg  # keep message for history
        return resp

    def append_assistant_turn(self, messages: list, response: UnifiedResponse):
        msg = response._raw
        entry: dict = {"role": "assistant", "content": msg.content}
        if msg.tool_calls:
            entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
        messages.append(entry)

    def append_tool_results(self, messages: list, results: list):
        # results: List[{tool_use_id, content}]
        for r in results:
            messages.append({
                "role": "tool",
                "tool_call_id": r["tool_use_id"],
                "content": r["content"],
            })

    async def generate(self, prompt: str, max_tokens: int = 16000) -> str:
        resp = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or ""


# ── Factory ──────────────────────────────────────────────────────────────────

def get_provider() -> AnthropicProvider | OpenAIProvider:
    if AI_PROVIDER == "openai":
        return OpenAIProvider()
    return AnthropicProvider()
