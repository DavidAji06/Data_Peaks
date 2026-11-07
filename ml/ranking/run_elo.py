"""Run a mock season: 10 synthetic experts score a country's access events in date
order, and their Elo rating is updated after each event resolves.

    venv/Scripts/python.exe -m ml.ranking.run_elo                      # Chad, last 40 events
    venv/Scripts/python.exe -m ml.ranking.run_elo --country Sudan --events 60 --show-round 5

Writes to data/processed/elo/:
    mock_expert_forecasts.csv  every expert's answer for every event + the true scores
    elo_history.csv            per event, per expert: place, error, rating before/after
    leaderboard.csv            final ranking
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from ml.ranking.elo import EloLeague
from ml.ranking.mock_experts import PANEL, predict
from ml.ranking.significance import bootstrap_ratings, tiers, vs_baseline

ROOT = Path(__file__).resolve().parents[2]
EVENTS_CSV = ROOT / "data" / "processed" / "access_events_scored_v7.csv"
OUT_DIR = ROOT / "data" / "processed" / "elo"


def load_events(country: str, n_events: int) -> pd.DataFrame:
    df = pd.read_csv(EVENTS_CSV, usecols=[
        "event_id", "country", "date", "subindicator", "description",
        "intensity_score", "exposure_score", "impact_score", "impact_label",
    ])
    df = df[df["country"].str.lower() == country.lower()]
    df = df.dropna(subset=["intensity_score", "exposure_score", "impact_score"])
    if df.empty:
        raise SystemExit(f"No scored events for country {country!r}")
    df = df.sort_values(["date", "event_id"])
    return df.tail(n_events).reset_index(drop=True)


def run_season(events: pd.DataFrame, seed: int = 8):
    rng = np.random.default_rng(seed)
    league = EloLeague()
    names = {p.expert_id: p.pseudonym for p in PANEL}
    forecasts, history_rows, seen = [], [], []

    for i, ev in events.iterrows():
        actual = {
            "intensity": int(ev.intensity_score),
            "exposure": int(ev.exposure_score),
            "impact": int(ev.impact_score),
        }
        progress = i / max(1, len(events) - 1)
        preds = {p.expert_id: predict(p, actual, seen, progress, rng) for p in PANEL}

        for expert_id, pred in preds.items():
            forecasts.append({
                "round": i + 1, "event_id": ev.event_id, "date": ev.date,
                "expert_id": expert_id, "pseudonym": names[expert_id],
                **{f"pred_{k}": v for k, v in pred.items()},
                **{f"actual_{k}": v for k, v in actual.items()},
            })

        for row in league.rate_event(preds, actual):
            history_rows.append({"round": i + 1, "event_id": ev.event_id, "date": ev.date,
                                 "pseudonym": names[row["expert_id"]], **row})
        seen.append(actual)

    board = league.leaderboard()
    for row in board:
        row["pseudonym"] = names[row["expert_id"]]
        row["style"] = next(p.style for p in PANEL if p.expert_id == row["expert_id"])
    return pd.DataFrame(forecasts), pd.DataFrame(history_rows), pd.DataFrame(board)


def significance_report(forecasts, history, board, n_boot, seed) -> pd.DataFrame:
    names = dict(zip(board["expert_id"], board["pseudonym"]))
    boot = bootstrap_ratings(forecasts, n_boot=n_boot, seed=seed)
    tiered = tiers(board, history)
    rand = vs_baseline(history, "EXP-10").rename(columns={"p_beats_baseline": "p_beats_random"})
    base = vs_baseline(history, "EXP-09").rename(columns={"p_beats_baseline": "p_beats_base_rate"})
    out = (tiered[["rank", "tier", "expert_id", "rating", "mean_error", "p_leader_better",
                   "p_vs_next"]]
           .merge(boot, on="expert_id")
           .merge(rand[["expert_id", "p_beats_random"]], on="expert_id", how="left")
           .merge(base[["expert_id", "p_beats_base_rate"]], on="expert_id", how="left"))
    out.insert(3, "pseudonym", out["expert_id"].map(names))
    out["rating_90ci"] = out.apply(lambda r: f"{r.rating_lo90:.0f}-{r.rating_hi90:.0f}", axis=1)
    out["rank_90ci"] = out.apply(lambda r: f"{r.rank_lo90}-{r.rank_hi90}", axis=1)

    print(f"\n=== Is the ranking skill or luck? ({n_boot} bootstrap replays, "
          f"paired permutation tests, alpha 0.05) ===")
    print(out[["rank", "tier", "pseudonym", "rating", "rating_90ci", "rank_90ci", "p_top3",
               "mean_error", "p_leader_better", "p_beats_random", "p_beats_base_rate"]]
          .to_string(index=False, na_rep="-"))
    print("tier: cannot be told apart from the tier's top expert yet. "
          "p_*: chance of a gap this big by luck alone (< 0.05 = real difference).")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--country", default="Chad")
    ap.add_argument("--events", type=int, default=40)
    ap.add_argument("--seed", type=int, default=8)
    ap.add_argument("--show-round", type=int, default=None,
                    help="print the full ranking of this round (default: last round)")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--significance", action="store_true",
                    help="bootstrap rating intervals, tiers and tests vs baselines")
    ap.add_argument("--n-boot", type=int, default=500)
    args = ap.parse_args(argv)

    events = load_events(args.country, args.events)
    forecasts, history, board = run_season(events, seed=args.seed)

    pd.set_option("display.width", 160)
    rnd = args.show_round or int(history["round"].max())
    ev = events.iloc[rnd - 1]
    print(f"\n=== Round {rnd}: event {ev.event_id} ({ev.date}, {ev.country}) ===")
    print(f"{ev.subindicator}")
    print(f"{str(ev.description)[:300]}...")
    print(f"Actual: intensity {ev.intensity_score}, exposure {ev.exposure_score}, "
          f"impact {ev.impact_score} ({ev.impact_label})\n")
    cols = ["place", "pseudonym", "pred_intensity", "pred_exposure", "pred_impact",
            "error", "rating_before", "delta", "rating_after"]
    print(history[history["round"] == rnd][cols].to_string(index=False))

    print(f"\n=== Leaderboard after {len(events)} {args.country} events ===")
    print(board[["rank", "pseudonym", "style", "rating", "peak", "hit_rate",
                 "miss_rate", "events"]].to_string(index=False))

    sig = None
    if args.significance:
        sig = significance_report(forecasts, history, board, args.n_boot, args.seed)

    if not args.no_write:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        forecasts.to_csv(OUT_DIR / "mock_expert_forecasts.csv", index=False)
        history.to_csv(OUT_DIR / "elo_history.csv", index=False)
        board.to_csv(OUT_DIR / "leaderboard.csv", index=False)
        if sig is not None:
            sig.to_csv(OUT_DIR / "leaderboard_significance.csv", index=False)
        print(f"\nWrote {OUT_DIR.relative_to(ROOT)}/*.csv")


if __name__ == "__main__":
    main()
