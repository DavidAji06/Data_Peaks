"""Tests for the skill-vs-luck checks on the expert Elo ranking."""
import numpy as np
import pandas as pd

from ml.ranking.elo import EloLeague
from ml.ranking.significance import bootstrap_ratings, paired_permutation_test, tiers


def test_clearly_better_expert_is_significant():
    rng = np.random.default_rng(1)
    good = rng.integers(0, 2, size=40)       # error 0-1
    bad = good + rng.integers(1, 3, size=40)  # always worse
    assert paired_permutation_test(good, bad) < 0.01
    assert paired_permutation_test(bad, good) > 0.99


def test_equal_experts_are_not_significant():
    same = [1, 2, 0, 1, 3]
    assert paired_permutation_test(same, same) == 1.0
    rng = np.random.default_rng(2)
    a, b = rng.integers(0, 4, size=30), rng.integers(0, 4, size=30)
    assert paired_permutation_test(a, b) > 0.05 or paired_permutation_test(b, a) > 0.05


def _season(n_rounds=30, seed=3):
    """Three experts: exact, off by one on one factor, random."""
    rng = np.random.default_rng(seed)
    rows = []
    for r in range(1, n_rounds + 1):
        actual = {f: int(rng.integers(1, 6)) for f in ("intensity", "exposure", "impact")}
        preds = {
            "ace": dict(actual),
            "ok": {**actual, "intensity": min(5, actual["intensity"] + 1)},
            "rnd": {f: int(rng.integers(1, 6)) for f in actual},
        }
        for e, p in preds.items():
            rows.append({"round": r, "expert_id": e,
                         **{f"pred_{k}": v for k, v in p.items()},
                         **{f"actual_{k}": v for k, v in actual.items()}})
    return pd.DataFrame(rows)


def test_bootstrap_and_tiers_separate_skill_levels():
    forecasts = _season()
    league, hist = EloLeague(), []
    for r, g in forecasts.groupby("round"):
        preds = {x.expert_id: {f: getattr(x, f"pred_{f}") for f in ("intensity", "exposure", "impact")}
                 for x in g.itertuples()}
        actual = {f: g.iloc[0][f"actual_{f}"] for f in ("intensity", "exposure", "impact")}
        hist += [{"round": r, **row} for row in league.rate_event(preds, actual)]
    history = pd.DataFrame(hist)

    boot = bootstrap_ratings(forecasts, n_boot=100).set_index("expert_id")
    assert boot.loc["ace", "rank_hi90"] == 1
    assert boot.loc["ace", "rating_lo90"] > boot.loc["rnd", "rating_hi90"]

    board = pd.DataFrame(league.leaderboard())
    t = tiers(board, history).set_index("expert_id")["tier"]
    assert t["ace"] < t["rnd"]
