"""Label ALL access events with the frozen prompt (ml/prompts/silver_labels.md).

    python -m ml.pipeline.relabel_all --dry-run                 # cost estimate, no calls
    GREENPT_BUDGET_USD=3.30 python -m ml.pipeline.relabel_all --workers 6
    python -m ml.pipeline.relabel_all --subset killings --workers 6   # only events mentioning deaths
    python -m ml.pipeline.relabel_all --subset killings_aid --tag llm_v7  # + food-aid loss (v7)
    python -m ml.pipeline.relabel_all --export-only                     # rebuild the CSV, no calls

Output: data/processed/llm_labels_all.jsonl (one line per event, resumable: re-running only
labels what is missing). Parallel calls; stops cleanly on the budget cap or if hidden
reasoning tokens appear (see greenpt.py).

`--subset killings` re-labels only the events whose text matches KILL_REGEX (`killings_aid`:
KILL_REGEX or AID_REGEX). The first time for a tag, the labels file is copied to
llm_labels_all_before_<tag>.jsonl; old labels of the subset are then
ignored unless they already carry the current --tag (so the run stays resumable). New labels
are appended; read_labels keeps the last label per event.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from ml.pipeline.greenpt import USD_PER_TOKEN, BudgetExceeded, ThinkingNotDisabled, spent_usd
from ml.pipeline.silver_labels import (BATCH_SIZE, PROCESSED, PROMPT_PATH, build_prompt, label_batch,
                                       load_events, read_labels, to_prompt_records)

OUT = PROCESSED / "llm_labels_all.jsonl"
TAG = "llm_v7"
COST_PER_CALL = 0.004  # observed with thinking off: ~$0.002-0.004 per 20-25-event call
# Events where the v6 killing rule can change the score: any mention of deaths or killings.
KILL_REGEX = re.compile(
    r"\b(?:kill|killed|killing|killings|dead|death|deaths|fatality|fatalities|murder\w*|massacre\w*"
    r"|died|die|slain|executed|lost their lives|casualt\w*)\b|\bclaimed\s+(?:\S+\s+){0,3}lives\b", re.I)
# Events where the v7 food-aid rule can change the score: rations / food assistance lost or looted.
AID_REGEX = re.compile(
    r"\brations?\b"
    r"|\bfood (?:assistance|distributions?|aid|deliveries)\b.{0,80}\b(?:suspend|halt|stop|cut|miss|loot|reduc|block|interrupt)"
    r"|\b(?:suspend|halt|stop|cut|loot|reduc|block|interrupt)\w*\b.{0,80}\bfood (?:assistance|distributions?|aid|deliveries|rations)\b"
    r"|\bwarehouses?\b.{0,60}\bloot|\bloot\w*.{0,60}\bwarehouses?\b", re.I)
SUBSETS = {"killings": [KILL_REGEX], "killings_aid": [KILL_REGEX, AID_REGEX]}


def scored_csv(tag: str):
    return PROCESSED / f"access_events_scored_{tag.removeprefix('llm_')}.csv"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--max-calls", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--subset", choices=list(SUBSETS), default=None,
                    help="re-label only events matching the subset regexes (old labels backed up)")
    ap.add_argument("--tag", default=TAG, help="source tag written with each new label")
    ap.add_argument("--export-only", action="store_true", help="rebuild the scored CSV, no calls")
    args = ap.parse_args()
    if args.export_only:
        export(args.tag)
        return

    events = load_events()
    done = read_labels(OUT)
    if args.subset:
        text = events["description"].fillna("")
        hit = text.str.contains(SUBSETS[args.subset][0])
        for rx in SUBSETS[args.subset][1:]:
            hit |= text.str.contains(rx)
        subset = set(events.loc[hit, "event_id"])
        print(f"subset '{args.subset}': {len(subset):,} of {len(events):,} events match", flush=True)
        backup = PROCESSED / f"llm_labels_all_before_{args.tag}.jsonl"
        if not args.dry_run and not backup.exists():
            shutil.copyfile(OUT, backup)
            print(f"backup: {OUT.name} -> {backup.name}", flush=True)
        tagged = done["source"] == args.tag if "source" in done else False
        done = done[~done["event_id"].isin(subset) | tagged]
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
        export(args.tag)
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
                    f.write(json.dumps({**lab, "model": client.model, "source": args.tag}) + "\n")
            n_ok, n_fail = n_ok + len(labels), n_fail + len(missing)
            if k % 25 == 0 or k == len(futures):
                print(f"{k}/{len(futures)} calls | {n_ok:,} labelled, {n_fail} failed | this run "
                      f"~${spent_usd() - start:.2f}, total ~${spent_usd():.2f} | {time.time() - t0:.0f}s",
                      flush=True)
    print(f"done: {len(read_labels(OUT)):,} events labelled in {OUT.name}")
    export(args.tag)


def export(tag: str = TAG) -> None:
    """Write access_events_scored_<version>.csv (scores + impact, per-event `source`) from the labels file."""
    from ml.pipeline.impact import impact_from_matrix
    labels = read_labels(OUT)
    cols = ["event_id", "country", "iso3", "date", "indicator", "subindicator", "description"]
    df = load_events()[cols].merge(labels, on="event_id")
    imp = [impact_from_matrix(int(e), int(i)) for e, i in zip(df["exposure_score"], df["intensity_score"])]
    df["impact_score"], df["impact_label"] = [a for a, _ in imp], [b for _, b in imp]
    df = df.rename(columns={"explicit_pin_extracted": "explicit_pin"})
    df["source"] = df["source"].fillna("unknown")
    out = scored_csv(tag)
    df.to_csv(out, index=False)
    print(f"wrote {out.name}: {len(df):,} events")


if __name__ == "__main__":
    main()
