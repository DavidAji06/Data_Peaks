"""Is the Elo ranking real skill, or luck? Two simple checks.

1. Bootstrap (how stable is each rating and rank?)
   Replay the season many times on resampled events: draw the same number of
   events with replacement, in a random order, and recompute every rating.
   Gives each expert a 90% interval for their rating and their rank, and the
   share of replays in which they finish in the top 3. An expert whose rank
   interval is wide (say 2nd to 8th) has not shown much yet.

2. Paired permutation test (is A really better than B?)
   On every event both experts answered, take the difference in their total
   error. If A and B were equally good, each difference would be just as
   likely to be positive as negative. Flip the signs at random many times and
   count how often the mean difference is at least as large as the one we saw:
   that share is the p-value. Small p (< 0.05) = A is better, not just lucky.
   It needs no assumptions about the shape of the errors.

Experts next to each other on the leaderboard that are *not* significantly
different are put in the same tier, so the board reads "tier 1: A, B" instead
of claiming A > B when the data cannot tell them apart.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ml.ranking.elo import EloLeague, FACTORS

ALPHA = 0.05


def _events(forecasts: pd.DataFrame) -> list[tuple[dict, dict]]:
    """forecasts (one row per expert per round) -> [(predictions, actual), ...]."""
    out = []
    for _, g in forecasts.groupby("round", sort=True):
        preds = {r.expert_id: {f: int(getattr(r, f"pred_{f}")) for f in FACTORS}
                 for r in g.itertuples()}
        first = g.iloc[0]
        actual = {f: int(first[f"actual_{f}"]) for f in FACTORS}
        out.append((preds, actual))
    return out


def bootstrap_ratings(forecasts: pd.DataFrame, n_boot: int = 500, seed: int = 0) -> pd.DataFrame:
    events = _events(forecasts)
    experts = sorted(forecasts["expert_id"].unique())
    rng = np.random.default_rng(seed)
    ratings = np.empty((n_boot, len(experts)))

    for b in range(n_boot):
        league = EloLeague()
        for i in rng.integers(0, len(events), size=len(events)):
            league.rate_event(*events[i])
        ratings[b] = [league.players[e].rating for e in experts]

    # rank 1 = highest rating in that replay
    ranks = (-ratings).argsort(axis=1).argsort(axis=1) + 1
    return pd.DataFrame({
        "expert_id": experts,
        "rating_mean": ratings.mean(axis=0).round(1),
        "rating_lo90": np.percentile(ratings, 5, axis=0).round(1),
        "rating_hi90": np.percentile(ratings, 95, axis=0).round(1),
        "rank_lo90": np.percentile(ranks, 5, axis=0).astype(int),
        "rank_hi90": np.percentile(ranks, 95, axis=0).astype(int),
        "p_top3": (ranks <= 3).mean(axis=0).round(3),
    })


def paired_permutation_test(errors_a, errors_b, n_perm: int = 10_000, seed: int = 0) -> float:
    """One-sided p-value that A has lower error than B (A is better)."""
    d = np.asarray(errors_b, float) - np.asarray(errors_a, float)  # > 0 when A is closer
    if len(d) == 0 or not d.any():
        return 1.0
    observed = d.mean()
    rng = np.random.default_rng(seed)
    signs = rng.choice([-1.0, 1.0], size=(n_perm, len(d)))
    null = (signs * d).mean(axis=1)
    # +1 so the p-value is never exactly 0 with a finite number of permutations
    return float((np.sum(null >= observed) + 1) / (n_perm + 1))


def error_matrix(history: pd.DataFrame) -> pd.DataFrame:
    """rounds x experts table of total error."""
    return history.pivot(index="round", columns="expert_id", values="error")


def _p(errs: pd.DataFrame, a: str, b: str) -> float:
    both = errs[[a, b]].dropna()
    return paired_permutation_test(both[a], both[b])


def tiers(leaderboard: pd.DataFrame, history: pd.DataFrame, alpha: float = ALPHA) -> pd.DataFrame:
    """Walk down the leaderboard. Each tier is led by its highest-rated expert;
    an expert joins that tier unless the leader is significantly better than
    them (paired permutation test), in which case they lead a new tier.
    Comparing with the tier leader, not just the neighbour, stops a long chain
    of small gaps from merging the whole board into one tier."""
    errs = error_matrix(history)
    board = leaderboard.sort_values("rank").reset_index(drop=True).copy()
    ids = list(board["expert_id"])
    tier, leader, tiers_, p_leader = 1, ids[0], [], []
    for expert in ids:
        if expert != leader:
            p = _p(errs, leader, expert)
            if p < alpha:
                tier, leader, p = tier + 1, expert, None
        else:
            p = None
        tiers_.append(tier)
        p_leader.append(None if p is None else round(p, 4))
    board["tier"] = tiers_
    board["p_leader_better"] = p_leader
    board["p_vs_next"] = [round(_p(errs, a, b), 4) for a, b in zip(ids, ids[1:])] + [None]
    board["mean_error"] = board["expert_id"].map(errs.mean().round(2))
    return board


def vs_baseline(history: pd.DataFrame, baseline_id: str) -> pd.DataFrame:
    """p-value that each expert beats a baseline (e.g. the random guesser or the
    base-rate forecaster). An expert who cannot beat 'always say the usual'
    is not adding information."""
    errs = error_matrix(history)
    rows = []
    for expert in errs.columns:
        if expert == baseline_id:
            continue
        both = errs[[expert, baseline_id]].dropna()
        rows.append({
            "expert_id": expert,
            "mean_error": round(both[expert].mean(), 2),
            "baseline_error": round(both[baseline_id].mean(), 2),
            "p_beats_baseline": round(paired_permutation_test(both[expert], both[baseline_id]), 4),
        })
    return pd.DataFrame(rows)
