"""Time-split evaluation of the student, with a confidence rule tuned on validation only.

    python -m ml.pipeline.student_timesplit

Data: LLM labels (silver + fallback, deduped; silver wins) joined to events, gold-set events
excluded. Ordered by event `date`: oldest 80% = train, newest 20% = test (untouched until the
end). Inside train, the newest 20% is a validation slice used for every choice:
  1. model variant per target (best validation quadratic kappa):
       clf_bal   LightGBM classifier, class_weight=balanced (current student)
       clf       same, no class weights
       ev_bal    clf_bal, prediction = round(expected value of the probabilities)
       ordinal   cumulative binary models P(y > k), k = 1..4  (Frank & Hall)
  2. routing rule (best accepted-only accuracy on validation at the default routing rate):
       old       current fixed rule (max >= .55, or adjacent top-two >= .85)
       pmax      route the least confident events, confidence = min over targets of max proba
       severe    like pmax but confidence = max proba - P(score above prediction): also routes
                 events the student may be under-rating (the known failure on intensity 4/5)
     thresholds are quantiles of validation confidence for routing 10/20/30/40%.
Then the chosen variants are refit on all training rows and applied, with the frozen thresholds,
to test. Report: data/processed/student_timesplit_report.json.

Labels are the old-prompt LLM labels (stratified silver sample + hard-case fallback), so the
numbers are provisional until the relabel with the chosen prompt.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import confusion_matrix

from ml.pipeline.silver_labels import LABELS_JSONL, PROCESSED, load_events, read_labels
from ml.pipeline.student import TARGETS, Featurizer, accept, make_model, metrics, proba5

FALLBACK_JSONL = PROCESSED / "llm_fallback_labels.jsonl"
ALL_V5_JSONL = PROCESSED / "llm_labels_all.jsonl"  # full relabel with the frozen v5 prompt
GOLD_CSV = PROCESSED / "gold_labels.csv"
REPORT = PROCESSED / "student_timesplit_report.json"
TEST_FRAC, VAL_FRAC = 0.2, 0.2
RATES = [0.1, 0.2, 0.3, 0.4]
DEFAULT_RATE = 0.2
VARIANTS = ["clf_bal", "clf", "ev_bal", "ordinal"]


def labelled_frame(labels_paths=(FALLBACK_JSONL, LABELS_JSONL)) -> pd.DataFrame:
    labs = pd.concat([read_labels(p) for p in labels_paths]).drop_duplicates("event_id", keep="last")
    df = load_events().merge(labs[["event_id", *TARGETS.values()]], on="event_id")
    gold = set(pd.read_csv(GOLD_CSV, dtype=str)["event_id"]) if GOLD_CSV.exists() else set()
    df = df[~df["event_id"].isin(gold)].copy()
    df["_date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["_date"])
    df["_eid"] = pd.to_numeric(df["event_id"], errors="coerce")
    return df.sort_values(["_date", "_eid"]).reset_index(drop=True)


def time_split(df: pd.DataFrame, frac: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    k = int(round(len(df) * (1 - frac)))
    return df.iloc[:k], df.iloc[k:]


# --------------------------------------------------------------------------- #
# Model variants: each returns (n, 5) probabilities and a prediction 1..5
# --------------------------------------------------------------------------- #
class Variant:
    def __init__(self, name: str):
        self.name = name

    def fit(self, X, y):
        y = np.asarray(y, int)
        if self.name == "ordinal":
            self.models = {}
            for k in range(1, 5):
                yk = (y > k).astype(int)
                self.models[k] = (make_model().set_params(class_weight=None).fit(X, yk)
                                  if 0 < yk.sum() < len(yk) else float(yk.mean()))
        else:
            m = make_model()
            if self.name == "clf":
                m.set_params(class_weight=None)
            self.model = m.fit(X, y)
        return self

    def proba(self, X) -> np.ndarray:
        if self.name != "ordinal":
            return proba5(self.model, X)
        gt = np.column_stack([m.predict_proba(X)[:, 1] if isinstance(m, LGBMClassifier)
                              else np.full(X.shape[0], m) for m in self.models.values()])
        gt = np.minimum.accumulate(gt, axis=1)  # enforce P(y>1) >= P(y>2) >= ...
        cum = np.column_stack([np.ones(len(gt)), gt, np.zeros(len(gt))])
        return np.clip(cum[:, :-1] - cum[:, 1:], 0, 1)

    def predict(self, p: np.ndarray) -> np.ndarray:
        if self.name == "ev_bal":
            return np.clip(np.rint(p @ np.arange(1, 6) / p.sum(1)), 1, 5).astype(int)
        return p.argmax(1) + 1


def fit_predict(train, other, variants: dict[str, str]) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    fz = Featurizer().fit(train)
    out = {}
    for t, col in TARGETS.items():
        v = Variant(variants[t]).fit(fz.transform(train, t), train[col])
        p = v.proba(fz.transform(other, t))
        out[t] = (p, v.predict(p))
    return out


# --------------------------------------------------------------------------- #
# Routing rules
# --------------------------------------------------------------------------- #
def confidence(p: np.ndarray, pred: np.ndarray, rule: str) -> np.ndarray:
    pmax = p.max(1)
    if rule == "pmax":
        return pmax
    above = np.array([p[i, pred[i]:].sum() for i in range(len(p))])  # P(score > prediction)
    return pmax - above


def event_conf(res: dict, rule, ref: dict | None = None) -> np.ndarray:
    """Event confidence = min over targets. rule is one rule name or {target: rule}.
    With ref (validation confidences per target), each target's confidence is first turned into
    its percentile among the validation events, so per-target rules are on the same scale."""
    rules = rule if isinstance(rule, dict) else {t: rule for t in res}
    out = []
    for t, (p, pred) in res.items():
        c = confidence(p, pred, rules[t])
        if ref is not None:
            c = np.searchsorted(np.sort(ref[t]), c, side="right") / len(ref[t])
        out.append(c)
    return np.minimum(*out)


def evaluate(res: dict, frame: pd.DataFrame, accepted: np.ndarray | None) -> dict:
    out = {}
    for t, col in TARGETS.items():
        y, pred = frame[col].astype(int).to_numpy(), res[t][1]
        out[t] = {"all": metrics(y, pred),
                  "confusion_true_x_pred": confusion_matrix(y, pred, labels=[1, 2, 3, 4, 5]).tolist()}
        if accepted is not None:
            out[t]["accepted"] = metrics(y[accepted], pred[accepted])
            out[t]["routed"] = metrics(y[~accepted], pred[~accepted])
    if accepted is not None:
        out["routing_rate"] = round(float(1 - accepted.mean()), 3)
    return out


def acc_accepted(res, frame, ok) -> float:
    return float(np.mean([(frame[c].astype(int).to_numpy()[ok] == res[t][1][ok]).mean()
                          for t, c in TARGETS.items()]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", type=Path, nargs="*", default=None,
                    help="label files (default: old silver + fallback)")
    args = ap.parse_args()
    df = labelled_frame(tuple(args.labels)) if args.labels else labelled_frame()
    train, test = time_split(df, TEST_FRAC)
    core, val = time_split(train, VAL_FRAC)
    rep: dict = {
        "labels": [str(x) for x in (args.labels or [FALLBACK_JSONL, LABELS_JSONL])],
        "n": {"labelled_non_gold": len(df), "train": len(train), "train_core": len(core),
              "validation": len(val), "test": len(test)},
        "dates": {"train": [str(train["_date"].min().date()), str(train["_date"].max().date())],
                  "validation_from": str(val["_date"].min().date()),
                  "test": [str(test["_date"].min().date()), str(test["_date"].max().date())]},
        "label_dist_test": {t: test[c].value_counts().sort_index().to_dict() for t, c in TARGETS.items()},
    }

    # 1. variant choice on validation
    by_variant = {v: fit_predict(core, val, {t: v for t in TARGETS}) for v in VARIANTS}
    rep["validation_variants"] = {
        v: {t: metrics(val[c].astype(int), r[t][1]) for t, c in TARGETS.items()}
        for v, r in by_variant.items()}
    chosen = {t: max(VARIANTS, key=lambda v: rep["validation_variants"][v][t]["quadratic_kappa"])
              for t in TARGETS}
    rep["chosen_variant"] = chosen
    val_res = {t: by_variant[chosen[t]][t] for t in TARGETS}

    # 2. routing rule + thresholds on validation
    old_ok = accept(val_res["intensity"][0]) & accept(val_res["exposure"][0])
    grid = {"old": {"routing_rate": round(float(1 - old_ok.mean()), 3),
                    "acc_accepted_mean": round(acc_accepted(val_res, val, old_ok), 3)}}
    thresholds = {}
    for rule in ("pmax", "severe"):
        c = event_conf(val_res, rule)
        for r in RATES:
            thr = float(np.quantile(c, r))
            ok = c > thr
            thresholds[(rule, r)] = thr
            grid[f"{rule}@{int(r * 100)}%"] = {
                "threshold": round(thr, 4), "routing_rate": round(float(1 - ok.mean()), 3),
                "acc_accepted_mean": round(acc_accepted(val_res, val, ok), 3),
                **{f"{t}_acc_accepted": metrics(val[col].astype(int).to_numpy()[ok], val_res[t][1][ok])["accuracy"]
                   for t, col in TARGETS.items()}}
    # per-target rule: for each target the rule with the best accepted accuracy on that target
    per_target = {t: max(("pmax", "severe"), key=lambda r: grid[f"{r}@{int(DEFAULT_RATE * 100)}%"][f"{t}_acc_accepted"])
                  for t in TARGETS}
    ref = {t: confidence(*val_res[t], per_target[t]) for t in TARGETS}
    c = event_conf(val_res, per_target, ref)
    for r in RATES:
        thr = float(np.quantile(c, r))
        ok = c > thr
        thresholds[("per_target", r)] = thr
        grid[f"per_target@{int(r * 100)}%"] = {
            "threshold": round(thr, 4), "routing_rate": round(float(1 - ok.mean()), 3),
            "acc_accepted_mean": round(acc_accepted(val_res, val, ok), 3),
            **{f"{t}_acc_accepted": metrics(val[col].astype(int).to_numpy()[ok], val_res[t][1][ok])["accuracy"]
               for t, col in TARGETS.items()}}
    rep["validation_routing_grid"] = grid
    best_rule = max(("pmax", "severe", "per_target"), key=lambda r: grid[f"{r}@{int(DEFAULT_RATE * 100)}%"]["acc_accepted_mean"])
    rep["per_target_rules"] = per_target
    rep["chosen_rule"] = {"rule": best_rule, "default_rate": DEFAULT_RATE,
                          "thresholds": {f"{int(r * 100)}%": round(thresholds[(best_rule, r)], 4) for r in RATES}}

    # 3. refit on all training rows, apply frozen choices to test
    test_res = fit_predict(train, test, chosen)
    c_test = (event_conf(test_res, per_target, ref) if best_rule == "per_target"
              else event_conf(test_res, best_rule))
    rep["test"] = {"no_routing": evaluate(test_res, test, None)}
    for r in RATES:
        rep["test"][f"{best_rule}@{int(r * 100)}%"] = evaluate(test_res, test, c_test > thresholds[(best_rule, r)])
    old_test = accept(test_res["intensity"][0]) & accept(test_res["exposure"][0])
    rep["test"]["old_rule"] = evaluate(test_res, test, old_test)

    REPORT.write_text(json.dumps(rep, indent=2, default=str), encoding="utf-8")
    t = rep["test"]
    print(json.dumps({k: rep[k] for k in ("n", "dates", "chosen_variant", "chosen_rule")}, indent=1))
    print("validation variants (qwk I/E):", {v: (m["intensity"]["quadratic_kappa"], m["exposure"]["quadratic_kappa"])
                                             for v, m in rep["validation_variants"].items()})
    print("validation routing:", json.dumps(grid))
    for k, v in t.items():
        print(f"TEST {k:14} route={v.get('routing_rate', 0)}",
              {tt: {s: v[tt][s] for s in ("all", "accepted") if s in v[tt]} for tt in TARGETS})


if __name__ == "__main__":
    main()
