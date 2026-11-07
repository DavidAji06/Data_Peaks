"""Label ALL access events with the frozen prompt (ml/prompts/silver_labels.md).

    python -m ml.pipeline.relabel_all --dry-run                 # cost estimate, no calls
    GREENPT_BUDGET_USD=3.30 python -m ml.pipeline.relabel_all --workers 6

Output: data/processed/llm_labels_all.jsonl (one line per event, resumable: re-running only
labels what is missing). Parallel calls; stops cleanly on the budget cap or if hidden
reasoning tokens appear (see greenpt.py).
"""
from __future__ import annotations

import argparse
import json
import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from ml.pipeline.greenpt import USD_PER_TOKEN, BudgetExceeded, ThinkingNotDisabled, spent_usd
from ml.pipeline.silver_labels import (BATCH_SIZE, PROCESSED, PROMPT_PATH, build_prompt, label_batch,
                                       load_events, read_labels, to_prompt_records)

OUT = PROCESSED / "llm_labels_all.jsonl"
SCORED_CSV = PROCESSED / "access_events_scored_v5.csv"
COST_PER_CALL = 0.004  # observed with thinking off: ~$0.002-0.004 per 20-25-event call


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--max-calls", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    events = load_events()
    done = read_labels(OUT)
    todo = events[~events["event_id"].isin(done["event_id"])] if len(done) else events
    batches = [todo.iloc[i:i + BATCH_SIZE] for i in range(0, len(todo), BATCH_SIZE)]
    if args.max_calls:
        batches = batches[:args.max_calls]
    template = PROMPT_PATH.read_text(encoding="utf-8")
    print(f"{len(todo):,} events to label in {len(batches)} calls, ~${len(batches) * COST_PER_CALL:.2f} "
          f"(est.) | spent so far ~${spent_usd():.2f}", flush=True)
    if args.dry_run:
        return
    if not batches:
        export()
        return

    from ml.pipeline.greenpt import GreenPT
    client, lock, start = GreenPT(), threading.Lock(), spent_usd()
    stop = threading.Event()
    n_ok = n_fail = 0

    def run(batch):
        if stop.is_set():
            return [], []
        return label_batch(client, batch, template=template)

    t0 = time.time()
    with ThreadPoolExecutor(args.workers) as pool:
        futures = [pool.submit(run, b) for b in batches]
        for k, fut in enumerate(as_completed(futures), 1):
            try:
                labels, missing = fut.result()
            except (BudgetExceeded, ThinkingNotDisabled) as exc:
                stop.set()
                print(f"STOPPED: {exc}", flush=True)
                continue
            with lock, OUT.open("a", encoding="utf-8") as f:
                for lab in labels:
                    f.write(json.dumps({**lab, "model": client.model, "source": "llm_v5"}) + "\n")
            n_ok, n_fail = n_ok + len(labels), n_fail + len(missing)
            if k % 25 == 0 or k == len(futures):
                print(f"{k}/{len(futures)} calls | {n_ok:,} labelled, {n_fail} failed | this run "
                      f"~${spent_usd() - start:.2f}, total ~${spent_usd():.2f} | {time.time() - t0:.0f}s",
                      flush=True)
    print(f"done: {len(read_labels(OUT)):,} events labelled in {OUT.name}")
    export()


def export() -> None:
    """Write access_events_scored_v5.csv (scores + impact) from the labels file."""
    from ml.pipeline.impact import impact_from_matrix
    labels = read_labels(OUT)
    cols = ["event_id", "country", "iso3", "date", "indicator", "subindicator", "description"]
    df = load_events()[cols].merge(labels, on="event_id")
    imp = [impact_from_matrix(int(e), int(i)) for e, i in zip(df["exposure_score"], df["intensity_score"])]
    df["impact_score"], df["impact_label"] = [a for a, _ in imp], [b for _, b in imp]
    df = df.rename(columns={"explicit_pin_extracted": "explicit_pin"})
    df["source"] = "llm_v5"
    df.to_csv(SCORED_CSV, index=False)
    print(f"wrote {SCORED_CSV.name}: {len(df):,} events")


if __name__ == "__main__":
    main()
