"""Score one event live with the frozen prompt, ml/prompts/silver_labels.md (v7; the "online model").

    python -m ml.pipeline.score_text --event-id 24271                 # re-score an existing event
    python -m ml.pipeline.score_text --country Chad --text "Armed men attacked ..."   # any new text
    python -m ml.pipeline.score_text --country Sudan --country-wide --subindicator "S6.1 - Aid workers killed" --text "..."
    python -m ml.pipeline.score_text --csv data/processed/handcheck_v6.csv    # every row, one live call each

--csv needs columns id, country, country_wide, subindicator, text; it adds llm_intensity,
llm_exposure, llm_impact, llm_reasoning (and compares with vlad_intensity/vlad_exposure if filled).

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
    ap.add_argument("--csv", help="score every row of this CSV and write the results back")
    args = ap.parse_args()
    if args.csv:
        score_csv(args.csv)
        return

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


def score_csv(path: str) -> None:
    os.environ["GREENPT_NO_CACHE"] = "1"
    from ml.pipeline.greenpt import GreenPT, spent_usd
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    client, before = GreenPT(), spent_usd()
    for i, r in df.iterrows():
        row = pd.DataFrame([{"event_id": r["id"], "country": r["country"],
                             "country_wide": str(r["country_wide"]).lower() == "true", "adm1_name": None,
                             "indicator": None, "subindicator": r["subindicator"],
                             "targeting_specific_population_groups": None, "description": r["text"]}])
        labels, _ = label_batch(client, row)
        if not labels:
            print(f"{r['id']}: no valid label")
            continue
        lab = labels[0]
        _, label = impact_from_matrix(lab["exposure_score"], lab["intensity_score"])
        df.loc[i, ["llm_intensity", "llm_exposure", "llm_impact", "llm_reasoning"]] = [
            str(lab["intensity_score"]), str(lab["exposure_score"]), label, lab["brief_reasoning"]]
        human = ""
        if r.get("vlad_intensity") and r.get("vlad_exposure"):
            _, hl = impact_from_matrix(int(r["vlad_exposure"]), int(r["vlad_intensity"]))
            human = f" | Vlad I {r['vlad_intensity']} E {r['vlad_exposure']} {hl}"
        print(f"{r['id']}: LLM I {lab['intensity_score']} E {lab['exposure_score']} {label}{human} | {lab['brief_reasoning']}")
    df.to_csv(path, index=False, encoding="utf-8-sig")
    print(f"\n{len(df)} rows -> {path} | this run ~${spent_usd() - before:.4f} | total spent ~${spent_usd():.2f}")


if __name__ == "__main__":
    main()
