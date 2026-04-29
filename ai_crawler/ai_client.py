"""Lightweight AI client using the Anthropic Messages API format (Ark-compatible)."""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any

from . import config


def chat(
    messages: list[dict[str, str]],
    *,
    system: str | None = None,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.3,
) -> str:
    """Send a chat completion request and return the assistant text."""
    model = model or config.AI_MODEL
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": messages,
    }
    if system:
        body["system"] = system

    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{config.AI_BASE_URL}/v1/messages",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": config.AI_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode(errors="replace")
        raise RuntimeError(
            f"AI API error {exc.code}: {err_body[:500]}"
        ) from exc

    for block in result.get("content", []):
        if block.get("type") == "text":
            return block["text"]

    raise RuntimeError(f"Unexpected AI response structure: {json.dumps(result)[:300]}")


def chat_json(
    messages: list[dict[str, str]],
    *,
    system: str | None = None,
    model: str | None = None,
) -> Any:
    """Chat and parse the response as JSON (strips markdown fences if present)."""
    raw = chat(messages, system=system, model=model)
    text = raw.strip()
    if text.startswith("```"):
        first_nl = text.index("\n")
        text = text[first_nl + 1 :]
        if text.endswith("```"):
            text = text[:-3]
    return json.loads(text)
