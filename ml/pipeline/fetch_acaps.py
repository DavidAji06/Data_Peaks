"""Download the ACAPS Humanitarian Access Events dataset.

Endpoint: GET https://api.acaps.org/api/v1/humanitarian-access/events/
Auth:     header ``Authorization: Token <ACAPS_TOKEN>`` (read from env / .env)

Usage:
    python -m ml.pipeline.fetch_acaps            # full download (~149 pages)
    python -m ml.pipeline.fetch_acaps --max-pages 2

Output:
    data/raw/acaps/humanitarian_access_events.json   (raw records, list)
    data/raw/acaps/humanitarian_access_events.csv    (flattened, one row per event)
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "raw" / "acaps"
BASE_URL = "https://api.acaps.org/api/v1/humanitarian-access/events/"


def load_token() -> str:
    token = os.environ.get("ACAPS_TOKEN")
    if not token:
        env = ROOT / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("ACAPS_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not token:
        raise SystemExit("ACAPS_TOKEN not set (env or .env)")
    return token


def fetch_all(max_pages: int | None = None, sleep: float = 0.5) -> list[dict]:
    session = requests.Session()
    session.headers["Authorization"] = f"Token {load_token()}"
    url: str | None = BASE_URL
    records: list[dict] = []
    page = 0
    while url and (max_pages is None or page < max_pages):
        for attempt in range(5):
            resp = session.get(url, timeout=60)
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(2 ** attempt * 2)
                continue
            resp.raise_for_status()
            break
        else:
            raise RuntimeError(f"giving up on {url}")
        data = resp.json()
        records.extend(data["results"])
        page += 1
        print(f"page {page}: {len(records)}/{data['count']}", flush=True)
        url = data.get("next")
        time.sleep(sleep)
    return records


def _fix_mojibake(s):
    # API returns some UTF-8 text double-decoded as latin-1 ("ChocÃ³" -> "Chocó")
    if isinstance(s, str):
        try:
            return s.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def flatten(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(records)
    list_cols = ["country", "iso3", "adm1", "adm1_name", "indicator", "subindicator",
                 "targeting_specific_population_groups"]
    for c in list_cols:
        if c in df:
            df[c] = df[c].apply(
                lambda v: "; ".join(_fix_mojibake(x).strip() for x in v) if isinstance(v, list) else v
            )
    for c in ["description", "source_name"]:
        if c in df:
            df[c] = df[c].map(_fix_mojibake)
    # short indicator codes, e.g. "I7; I8"
    df["indicator_codes"] = df["indicator"].fillna("").str.findall(r"\bI\d+\b").str.join("; ")
    # event_date is often missing and sometimes mistyped (e.g. 2205-05-28); an event
    # cannot happen after the source reporting it, so fall back to source_date then.
    ev = pd.to_datetime(df["event_date"], errors="coerce")
    src = pd.to_datetime(df["source_date"], errors="coerce")
    df["date"] = ev.where(ev.notna() & (src.isna() | (ev <= src)), src)
    df["date_fixed"] = ev.notna() & src.notna() & (ev > src)
    return df


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-pages", type=int, default=None)
    ap.add_argument("--from-cache", action="store_true",
                    help="re-build the CSV from the saved JSON without calling the API")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw = OUT_DIR / "humanitarian_access_events.json"
    if args.from_cache:
        records = json.loads(raw.read_text(encoding="utf-8"))
    else:
        records = fetch_all(args.max_pages)
        raw.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    df = flatten(records)
    df.to_csv(OUT_DIR / "humanitarian_access_events.csv", index=False, encoding="utf-8")
    print(f"saved {len(df)} events -> {OUT_DIR}")


if __name__ == "__main__":
    main()
