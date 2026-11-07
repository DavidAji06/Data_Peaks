"""Minimal client for the GreenPT LLM API (OpenAI-compatible chat completions).

Config, read from the environment or the repo's .env:
    GREENPT_API_KEY    required (GREENPT_KEY is accepted too)
    GREENPT_MODEL      model id (list them with: python -m ml.pipeline.greenpt --models)
    GREENPT_BASE_URL   default https://api.greenpt.ai/v1
    GREENPT_REASONING  reasoning_effort sent with every call, default "none" (thinking off).
                       GreenPT enables thinking by default; on deepseek-v4 that burned up to
                       8,000 hidden tokens per call and returned empty replies (2026-11-07).
    GREENPT_NO_CACHE   any value: always call the API (live test), replies are still saved
    GREENPT_BUDGET_USD hard stop: refuse new (uncached) calls once estimated spend reaches it

Every successful response is cached on disk, keyed by (model, messages, temperature), so
re-running a step never pays twice for the same prompt. Token usage is appended to a log.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "processed" / "llm_cache"
USAGE_LOG = ROOT / "data" / "processed" / "llm_usage.jsonl"
DEFAULT_BASE_URL = "https://api.greenpt.ai/v1"
USD_PER_TOKEN = 0.50 / 873_601  # observed: ~$0.50 for the first 122 calls (629,933 in + 243,668 out)


class BudgetExceeded(RuntimeError):
    pass


class ThinkingNotDisabled(RuntimeError):
    """Raised on the first reply that used hidden reasoning tokens although they were turned off."""


def env(name: str, default: str | None = None) -> str | None:
    if os.environ.get(name):
        return os.environ[name]
    dotenv = ROOT / ".env"
    if dotenv.exists():
        for line in dotenv.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == name and value.strip():
                return value.strip().strip('"').strip("'")
    return default


class GreenPT:
    def __init__(self, model: str | None = None, timeout: int = 180) -> None:
        self.api_key = env("GREENPT_API_KEY") or env("GREENPT_KEY")
        if not self.api_key:
            raise SystemExit("GREENPT_API_KEY (or GREENPT_KEY) is not set in .env")
        self.base_url = env("GREENPT_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
        self.model = model or env("GREENPT_MODEL")
        self.timeout = timeout
        self.reasoning = env("GREENPT_REASONING", "none")
        budget = env("GREENPT_BUDGET_USD")
        self.budget = float(budget) if budget else None
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.api_key}",
                                     "Content-Type": "application/json"})

    def models(self) -> list[str]:
        resp = self.session.get(f"{self.base_url}/models", timeout=self.timeout)
        resp.raise_for_status()
        return sorted(m["id"] for m in resp.json().get("data", []))

    def chat(self, messages: list[dict], temperature: float = 0.0, max_tokens: int = 4000) -> str:
        if not self.model:
            raise SystemExit("GREENPT_MODEL is not set (pick one from --models)")
        payload = {"model": self.model, "messages": messages, "temperature": temperature,
                   "max_tokens": max_tokens}
        key_parts = [self.model, messages, temperature]
        if self.reasoning:
            payload["reasoning_effort"] = self.reasoning
            key_parts.append(self.reasoning)
        key = hashlib.sha256(json.dumps(key_parts, sort_keys=True).encode("utf-8")).hexdigest()
        cached = CACHE_DIR / f"{key}.json"
        if cached.exists() and not env("GREENPT_NO_CACHE"):
            return json.loads(cached.read_text(encoding="utf-8"))["content"]
        if self.budget is not None and spent_usd() >= self.budget:
            raise BudgetExceeded(f"budget ${self.budget:.2f} reached (spent ~${spent_usd():.3f})")

        last_error = ""
        for attempt in range(6):
            try:
                resp = self.session.post(f"{self.base_url}/chat/completions", json=payload,
                                         timeout=self.timeout)
            except requests.RequestException as exc:
                last_error = repr(exc)
                time.sleep(2 ** attempt)
                continue
            if resp.status_code == 429 or resp.status_code >= 500:
                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                time.sleep(min(60, 2 ** attempt * 2))
                continue
            resp.raise_for_status()
            data = resp.json()
            usage = data.get("usage") or {}
            reasoning_used = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens") or 0
            if reasoning_used and self.reasoning == "none":
                with USAGE_LOG.open("a", encoding="utf-8") as f:  # still log what it cost
                    f.write(json.dumps({"time": time.strftime("%Y-%m-%dT%H:%M:%S"),
                                        "model": self.model, **usage}) + "\n")
                raise ThinkingNotDisabled(f"{reasoning_used} reasoning tokens despite reasoning_effort=none")
            content = data["choices"][0]["message"]["content"] or ""
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps({"model": self.model, "content": content}),
                              encoding="utf-8")
            with USAGE_LOG.open("a", encoding="utf-8") as f:
                f.write(json.dumps({"time": time.strftime("%Y-%m-%dT%H:%M:%S"),
                                    "model": self.model, **(data.get("usage") or {})}) + "\n")
            return content
        raise RuntimeError(f"GreenPT request failed after retries ({self.model}): {last_error}")


def spent_usd() -> float:
    """Estimated total spend from the usage log (all calls ever made)."""
    if not USAGE_LOG.exists():
        return 0.0
    rows = [json.loads(line) for line in USAGE_LOG.read_text(encoding="utf-8").splitlines() if line]
    return sum(r.get("total_tokens", 0) for r in rows) * USD_PER_TOKEN


def usage_summary() -> dict:
    if not USAGE_LOG.exists():
        return {"calls": 0}
    rows = [json.loads(line) for line in USAGE_LOG.read_text(encoding="utf-8").splitlines() if line]
    return {"calls": len(rows),
            "prompt_tokens": sum(r.get("prompt_tokens", 0) for r in rows),
            "completion_tokens": sum(r.get("completion_tokens", 0) for r in rows)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", action="store_true", help="list available model ids")
    ap.add_argument("--usage", action="store_true", help="tokens used so far")
    args = ap.parse_args()
    if args.models:
        print("\n".join(GreenPT().models()))
    if args.usage:
        print(json.dumps(usage_summary(), indent=2))
