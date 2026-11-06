"""Score every access event with exposure, intensity and ACAPS impact.

    python -m ml.pipeline.score_events                      # student only, low-confidence flagged
    python -m ml.pipeline.score_events --llm-fallback --max-llm-calls 40

Per event:
  * events in the silver sample keep their LLM labels           (source = llm_silver)
  * otherwise the student predicts both scores                  (source = student)
  * if either prediction fails the confidence rule it is flagged (needs_llm = True) and,
    with --llm-fallback, sent to the LLM in batches               (source = llm_fallback)
  * impact = ACAPS chart[exposure, intensity]  (deterministic lookup, never predicted)

Output: data/processed/access_events_scored.csv
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from ml.pipeline.impact import impact_from_matrix
from ml.pipeline.silver_labels import (LABELS_JSONL, PROCESSED, label_events, load_events,
                                       read_labels)
from ml.pipeline.student import Student, accept, regex_pin

FALLBACK_JSONL = PROCESSED / "llm_fallback_labels.jsonl"
OUT_CSV = PROCESSED / "access_events_scored.csv"


def score(events: pd.DataFrame, student: Student, silver: pd.DataFrame,
          fallback: pd.DataFrame) -> pd.DataFrame:
    probs = student.predict(events)
    out = events[["event_id", "country", "iso3", "date", "indicator", "subindicator",
                  "description"]].copy().reset_index(drop=True)
    for t in ("exposure", "intensity"):
        out[f"{t}_score"] = probs[t].argmax(1) + 1
        out[f"{t}_proba"] = [json.dumps(np.round(r, 3).tolist()) for r in probs[t]]
        out[f"{t}_accepted"] = accept(probs[t])
    out["needs_llm"] = ~(out["exposure_accepted"] & out["intensity_accepted"])
    out["source"] = "student"
    out["explicit_pin"] = out["description"].map(regex_pin)
    out["brief_reasoning"] = None

    # LLM labels override the student: fallback first, silver last (silver wins)
    for labels, tag in ((fallback, "llm_fallback"), (silver, "llm_silver")):
        if labels.empty:
            continue
        lab = labels.set_index("event_id")
        hit = out["event_id"].isin(lab.index)
        ids = out.loc[hit, "event_id"]
        out.loc[hit, "exposure_score"] = lab.loc[ids, "exposure_score"].to_numpy()
        out.loc[hit, "intensity_score"] = lab.loc[ids, "intensity_score"].to_numpy()
        out.loc[hit, "explicit_pin"] = lab.loc[ids, "explicit_pin_extracted"].to_numpy()
        out.loc[hit, "brief_reasoning"] = lab.loc[ids, "brief_reasoning"].to_numpy()
        out.loc[hit, "source"] = tag
        out.loc[hit, "needs_llm"] = False

    imp = [impact_from_matrix(e, i) for e, i in zip(out["exposure_score"], out["intensity_score"])]
    out["impact_score"] = [s for s, _ in imp]
    out["impact_label"] = [lbl for _, lbl in imp]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--llm-fallback", action="store_true",
                    help="send low-confidence events to the LLM")
    ap.add_argument("--max-llm-calls", type=int, default=40,
                    help="cap on fallback API calls (25 events each)")
    args = ap.parse_args()

    events = load_events()
    student = Student.load()
    silver = read_labels(LABELS_JSONL)
    scored = score(events, student, silver, read_labels(FALLBACK_JSONL))

    if args.llm_fallback and scored["needs_llm"].any():
        from ml.pipeline.greenpt import GreenPT, usage_summary
        routed = events[events["event_id"].isin(scored.loc[scored["needs_llm"], "event_id"])]
        label_events(GreenPT(), routed, FALLBACK_JSONL, args.max_llm_calls, tag="llm_fallback")
        scored = score(events, student, silver, read_labels(FALLBACK_JSONL))
        print(f"usage so far: {usage_summary()}")

    scored.to_csv(OUT_CSV, index=False, encoding="utf-8")
    print(json.dumps({
        "events": len(scored),
        "source": scored["source"].value_counts().to_dict(),
        "still_needs_llm": int(scored["needs_llm"].sum()),
        "exposure": scored["exposure_score"].value_counts().sort_index().to_dict(),
        "intensity": scored["intensity_score"].value_counts().sort_index().to_dict(),
        "impact": scored["impact_label"].value_counts().to_dict(),
    }, indent=2, default=int))


if __name__ == "__main__":
    main()
