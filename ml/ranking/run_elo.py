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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--country", default="Chad")
    ap.add_argument("--events", type=int, default=40)
    ap.add_argument("--seed", type=int, default=8)
    ap.add_argument("--show-round", type=int, default=None,
                    help="print the full ranking of this round (default: last round)")
    ap.add_argument("--no-write", action="store_true")
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

    if not args.no_write:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        forecasts.to_csv(OUT_DIR / "mock_expert_forecasts.csv", index=False)
        history.to_csv(OUT_DIR / "elo_history.csv", index=False)
        board.to_csv(OUT_DIR / "leaderboard.csv", index=False)
        print(f"\nWrote {OUT_DIR.relative_to(ROOT)}/*.csv")


if __name__ == "__main__":
    main()
