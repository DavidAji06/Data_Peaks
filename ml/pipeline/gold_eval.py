"""Compare LLM labels with the human gold labels.

    python -m ml.pipeline.gold_eval                                  # current silver labels, tune split
    python -m ml.pipeline.gold_eval --labels data/processed/gold_runs/v2.jsonl
    python -m ml.pipeline.gold_eval --split test                     # ONLY after the final prompt is chosen

Metrics per dimension: exact agreement, within-1, quadratic-weighted kappa, mean signed
difference (LLM - human), plus the list of disagreements (|diff| >= 1).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from sklearn.metrics import cohen_kappa_score

from ml.pipeline.silver_labels import LABELS_JSONL, read_labels
from ml.pipeline.gold_set import GOLD_CSV

DIMS = {"intensity": ("my_intensity", "intensity_score"), "exposure": ("my_exposure", "exposure_score")}


def load_gold(split: str) -> pd.DataFrame:
    gold = pd.read_csv(GOLD_CSV, dtype={"event_id": str})
    gold = gold[gold["split"] == split] if split != "all" else gold
    for h, _ in DIMS.values():
        gold[h] = pd.to_numeric(gold[h], errors="coerce")
    return gold.dropna(subset=[h for h, _ in DIMS.values()])


def metrics(h: pd.Series, m: pd.Series) -> dict:
    h, m = h.astype(int), m.astype(int)
    qwk = cohen_kappa_score(h, m, weights="quadratic", labels=[1, 2, 3, 4, 5]) if h.nunique() > 1 or m.nunique() > 1 else float("nan")
    return {"n": len(h), "exact": (h == m).mean(), "within1": ((h - m).abs() <= 1).mean(),
            "qwk": qwk, "bias": (m - h).mean()}


def evaluate(labels_path: Path, split: str = "tune", show: bool = True) -> dict:
    gold = load_gold(split)
    if gold.empty:
        raise SystemExit(f"no human scores yet in {GOLD_CSV} ({split} split)")
    labs = read_labels(labels_path)
    df = gold.merge(labs, on="event_id", how="inner")
    out = {d: metrics(df[h], df[m]) for d, (h, m) in DIMS.items()}
    if show:
        print(f"{labels_path.name} vs gold ({split}, {len(df)}/{len(gold)} scored events)")
        print(pd.DataFrame(out).T.round(2).to_string())
        df["dI"] = df["intensity_score"] - df["my_intensity"]
        df["dE"] = df["exposure_score"] - df["my_exposure"]
        bad = df[(df["dI"] != 0) | (df["dE"] != 0)].sort_values(["dI", "dE"], key=abs, ascending=False)
        pd.set_option("display.width", 250, "display.max_colwidth", 90)
        print("\nDisagreements (human -> LLM):")
        for r in bad.itertuples():
            print(f"{r.gold_id} {r.event_id} {r.country[:14]:14} {r.subindicator[:4]} cw={r.country_wide!s:5} "
                  f"I {int(r.my_intensity)}->{r.intensity_score}  E {int(r.my_exposure)}->{r.exposure_score}"
                  f" | {r.brief_reasoning[:110]}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", type=Path, default=LABELS_JSONL)
    ap.add_argument("--split", default="tune", choices=["tune", "test", "test2", "all"])
    args = ap.parse_args()
    evaluate(args.labels, args.split)


if __name__ == "__main__":
    main()
