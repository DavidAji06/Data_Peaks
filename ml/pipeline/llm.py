"""LLM helpers used by the backend."""
from __future__ import annotations

import json
import re

from .greenpt import GreenPT

THEME_KEYS = ("agreement", "disagreement", "new_information")
MAX_POINTS = 3
MAX_REASONS = 50

SYSTEM_PROMPT = """You help ACAPS moderators read short, anonymous forecasts from humanitarian experts.
Summarise the experts' one-line reasons into three lists:
- agreement: points most experts share
- disagreement: points where experts clearly differ
- new_information: specific facts or factors raised by only one or two experts that could be missing from the analysis

Rules:
- At most 3 points per list, each under 20 words, in plain English.
- Only use what the reasons say. Do not add outside knowledge.
- Never include anything that could identify an expert.
- Use an empty list if nothing fits.

Reply with JSON only, in exactly this shape:
{"agreement": [], "disagreement": [], "new_information": []}"""


def empty_themes() -> dict:
    return {key: [] for key in THEME_KEYS}


def parse_json(text: str):
    match = re.search(r"\{.*\}", text, re.DOTALL)  # Ignore any text around the JSON
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def summarise_reasons(reasons: list[str]) -> dict:
    cleaned = [reason.strip() for reason in reasons if reason and reason.strip()][:MAX_REASONS]
    if not cleaned:
        return empty_themes()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "Expert reasons:\n" + "\n".join(f"- {r}" for r in cleaned)},
    ]

    try:
        reply = GreenPT(timeout=30).chat(messages, temperature=0.0, max_tokens=600)
    except (Exception, SystemExit) as error:  # GreenPT raises SystemExit if the key is missing
        print(f"[llm] summarise_reasons failed: {error}")
        return empty_themes()

    data = parse_json(reply)
    if not isinstance(data, dict):
        print("[llm] summarise_reasons got a reply that wasn't valid JSON")
        return empty_themes()

    return {
        key: [str(point).strip() for point in data.get(key, []) if str(point).strip()][:MAX_POINTS]
        if isinstance(data.get(key), list) else []
        for key in THEME_KEYS
    }