"""Score one event live with the frozen v5 prompt (the "online model").

    python -m ml.pipeline.score_text --event-id 24271                 # re-score an existing event
    python -m ml.pipeline.score_text --country Chad --text "Armed men attacked ..."   # any new text
    python -m ml.pipeline.score_text --country Sudan --country-wide --subindicator "S6.1 - Aid workers killed" --text "..."

Always calls the API (cache skipped), ~$0.0003 per event. Prints intensity, exposure, impact,
the model's reasoning and a review flag (Significant/Major impact -> expert review).
"""
from __future__ import annotations

import argparse
import os
import time

from ml.pipeline.impact import impact_from_matrix
from ml.pipeline.silver_labels import build_prompt, label_batch, load_events

import pandas as pd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--event-id")
    ap.add_argument("--text")
    ap.add_argument("--country", default="")
    ap.add_argument("--adm1", default=None)
    ap.add_argument("--indicator", default=None)
    ap.add_argument("--subindicator", default=None)
    ap.add_argument("--groups", default=None, help="targeting_specific_population_groups")
    ap.add_argument("--country-wide", action="store_true")
    args = ap.parse_args()

    if args.event_id:
        ev = load_events()
        row = ev[ev["event_id"] == str(args.event_id)]
        if row.empty:
            raise SystemExit(f"event {args.event_id} not found")
    elif args.text:
        row = pd.DataFrame([{"event_id": "live-1", "country": args.country, "country_wide": args.country_wide,
                             "adm1_name": args.adm1, "indicator": args.indicator,
                             "subindicator": args.subindicator,
                             "targeting_specific_population_groups": args.groups,
                             "description": args.text}])
    else:
        raise SystemExit("give --event-id or --text")

    os.environ["GREENPT_NO_CACHE"] = "1"  # live call every time
    from ml.pipeline.greenpt import GreenPT, spent_usd
    before, t0 = spent_usd(), time.time()
    labels, missing = label_batch(GreenPT(), row)
    if missing:
        raise SystemExit("the model returned no valid label (try again)")
    lab = labels[0]
    score, label = impact_from_matrix(lab["exposure_score"], lab["intensity_score"])
    print(f"\nevent      {lab['event_id']}  ({row.iloc[0]['country']})")
    print(f"intensity  {lab['intensity_score']}")
    print(f"exposure   {lab['exposure_score']}   (people stated: {lab['explicit_pin_extracted']}, scope: {lab['scope_type']})")
    print(f"impact     {label} ({score})")
    print(f"reasoning  {lab['brief_reasoning']}")
    print(f"review     {'YES - send to expert review' if score >= 4 else 'no'}")
    print(f"\n{time.time() - t0:.1f}s | this call ~${spent_usd() - before:.4f} | total spent ~${spent_usd():.2f}")


if __name__ == "__main__":
    main()
