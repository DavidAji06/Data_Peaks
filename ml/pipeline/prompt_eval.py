"""Run a prompt version on the gold set and score it against the human labels.

    python -m ml.pipeline.prompt_eval ml/prompts/versions/v2_rules.md --dry-run   # cost estimate only
    python -m ml.pipeline.prompt_eval ml/prompts/versions/v2_rules.md             # tune split (paid)
    python -m ml.pipeline.prompt_eval ml/prompts/silver_labels.md --split test --final   # once, at the end

Labels go to data/processed/gold_runs/<prompt>__<split>.jsonl (cached, resumable).
Cost is estimated from tokens at the rate observed so far ($0.50 for the first 122 calls).
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pandas as pd

from ml.pipeline.gold_eval import evaluate
from ml.pipeline.gold_set import GOLD_CSV
from ml.pipeline.silver_labels import BATCH_SIZE, PROCESSED, build_prompt, label_events, load_events, to_prompt_records

RUNS = PROCESSED / "gold_runs"
from ml.pipeline.greenpt import USD_PER_TOKEN, spent_usd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", type=Path)
    ap.add_argument("--split", default="tune", choices=["tune", "test", "test2"])
    ap.add_argument("--final", action="store_true", help="required to touch the test split")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--shuffle", type=int, default=None, help="reorder events (new batches) to measure run-to-run noise")
    args = ap.parse_args()
    if args.split.startswith("test") and not args.final:
        raise SystemExit("test split is held out: pass --final only once the prompt is chosen")

    gold = pd.read_csv(GOLD_CSV, dtype={"event_id": str})
    ids = gold.loc[gold["split"] == args.split, "event_id"]
    events = load_events().set_index("event_id").loc[ids].reset_index()
    if args.shuffle is not None:
        events = events.sample(frac=1, random_state=args.shuffle).reset_index(drop=True)
    template = args.prompt.read_text(encoding="utf-8")
    n_calls = math.ceil(len(events) / BATCH_SIZE)
    est = len(build_prompt(to_prompt_records(events.iloc[:BATCH_SIZE]), template)) / 4 * 1.4 * n_calls
    print(f"{args.prompt.name} on {len(events)} {args.split} events: {n_calls} calls, "
          f"~${est * USD_PER_TOKEN:.3f} (est.)  | spent so far ~${spent_usd():.2f}")
    if args.dry_run:
        return

    from ml.pipeline.greenpt import GreenPT
    before = spent_usd()
    suffix = f"_shuffle{args.shuffle}" if args.shuffle is not None else ""
    out = RUNS / f"{args.prompt.stem}{suffix}__{args.split}.jsonl"
    label_events(GreenPT(), events, out, tag=args.prompt.stem, template=template)
    print(f"this run ~${spent_usd() - before:.3f}  | total spent ~${spent_usd():.2f}\n")
    evaluate(out, args.split)


if __name__ == "__main__":
    main()
