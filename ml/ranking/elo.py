"""Elo-style rating for experts, based on how close their scores were to what happened.

Each resolved event is treated as a small chess tournament, played in two parts:

1. Expert vs the event ("did you get it right?")
   Every factor the expert scored (intensity, exposure, impact) is one game against
   the event, which has a fixed "par" rating (default 1000):
       exact hit      -> win  (1.0)
       off by one     -> draw (0.5)
       off by two+    -> loss (0.0)
   So a right answer always earns points and a wrong answer always costs points;
   how many depends on the expert's rating, like in chess (a 1400 expert gains
   little for an expected hit, a 700 expert gains a lot).

2. Expert vs the other experts on the panel ("who was closest?")
   Every pair of experts plays one game. The one with the smaller total error
   (sum of absolute differences across factors) wins, equal error is a draw.
   Beating a higher-rated peer is worth more than beating a lower-rated one.

    delta = K * ( W_EVENT * mean_f(S_f - E_par) + W_PEER * mean_j(S_ij - E_ij) )
    E(a, b) = 1 / (1 + 10 ** ((R_b - R_a) / 400))      (standard Elo expectation)
    new rating = max(FLOOR, old rating + delta)        (floor is 0)

K is larger for an expert's first PROVISIONAL_EVENTS events so new experts settle
quickly (FIDE does the same), then drops to K_ESTABLISHED.

All updates within one event use the ratings from *before* the event, so the
order in which experts are listed does not matter.
"""
from __future__ import annotations

from dataclasses import dataclass, field

START_RATING = 1000.0
FLOOR = 0.0
PAR_RATING = 1000.0  # rating of "the event" in the expert-vs-event games
K_PROVISIONAL = 40.0
K_ESTABLISHED = 20.0
PROVISIONAL_EVENTS = 10
W_EVENT = 0.5
W_PEER = 0.5

FACTORS = ("intensity", "exposure", "impact")


def expected(rating_a: float, rating_b: float) -> float:
    """Chance that A beats B under the Elo model."""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def factor_result(predicted: int, actual: int) -> float:
    """1 = right (exact), 0.5 = close (off by one), 0 = wrong (off by two or more)."""
    diff = abs(int(predicted) - int(actual))
    if diff == 0:
        return 1.0
    if diff == 1:
        return 0.5
    return 0.0


def total_error(prediction: dict, actual: dict, factors=FACTORS) -> int:
    return sum(abs(int(prediction[f]) - int(actual[f])) for f in factors)


@dataclass
class ExpertRating:
    rating: float = START_RATING
    events: int = 0
    hits: int = 0      # factors exactly right
    misses: int = 0    # factors off by two or more
    peak: float = START_RATING
    history: list[float] = field(default_factory=list)

    @property
    def k(self) -> float:
        return K_PROVISIONAL if self.events < PROVISIONAL_EVENTS else K_ESTABLISHED


class EloLeague:
    """Keeps every expert's rating and updates them one resolved event at a time."""

    def __init__(self, par_rating: float = PAR_RATING, factors=FACTORS,
                 w_event: float = W_EVENT, w_peer: float = W_PEER):
        self.par_rating = par_rating
        self.factors = tuple(factors)
        self.w_event = w_event
        self.w_peer = w_peer
        self.players: dict[str, ExpertRating] = {}

    def player(self, expert_id: str) -> ExpertRating:
        if expert_id not in self.players:
            self.players[expert_id] = ExpertRating()
        return self.players[expert_id]

    def rate_event(self, predictions: dict[str, dict], actual: dict) -> list[dict]:
        """Score one resolved event.

        predictions: {expert_id: {"intensity": 3, "exposure": 2, "impact": 2}}
        actual:      {"intensity": 3, "exposure": 3, "impact": 3}
        Returns one row per expert, sorted from closest to furthest.
        """
        before = {e: self.player(e).rating for e in predictions}
        errors = {e: total_error(p, actual, self.factors) for e, p in predictions.items()}

        rows = []
        for expert, pred in predictions.items():
            me = self.player(expert)
            r = before[expert]

            # 1. expert vs event, one game per factor
            results = {f: factor_result(pred[f], actual[f]) for f in self.factors}
            e_par = expected(r, self.par_rating)
            event_score = sum(s - e_par for s in results.values()) / len(results)

            # 2. expert vs every other panelist
            peers = [o for o in predictions if o != expert]
            peer_score = 0.0
            wins = 0.0
            for other in peers:
                if errors[expert] < errors[other]:
                    s = 1.0
                elif errors[expert] == errors[other]:
                    s = 0.5
                else:
                    s = 0.0
                wins += s
                peer_score += s - expected(r, before[other])
            if peers:
                peer_score /= len(peers)

            w_event, w_peer = (self.w_event, self.w_peer) if peers else (1.0, 0.0)
            delta = me.k * (w_event * event_score + w_peer * peer_score)
            new = max(FLOOR, r + delta)

            me.rating = new
            me.events += 1
            me.hits += sum(1 for s in results.values() if s == 1.0)
            me.misses += sum(1 for s in results.values() if s == 0.0)
            me.peak = max(me.peak, new)
            me.history.append(new)

            rows.append({
                "expert_id": expert,
                **{f"pred_{f}": int(pred[f]) for f in self.factors},
                **{f"result_{f}": results[f] for f in self.factors},
                "error": errors[expert],
                "peer_wins": wins,
                "rating_before": round(r, 1),
                "delta": round(new - r, 1),
                "rating_after": round(new, 1),
            })

        rows.sort(key=lambda row: (row["error"], -row["rating_before"]))
        # competition ranking: equal error -> equal place
        place = 0
        last_error = None
        for i, row in enumerate(rows, start=1):
            if row["error"] != last_error:
                place, last_error = i, row["error"]
            row["place"] = place
        return rows

    def leaderboard(self) -> list[dict]:
        board = []
        for expert, p in self.players.items():
            games = p.events * len(self.factors)
            board.append({
                "expert_id": expert,
                "rating": round(p.rating, 1),
                "peak": round(p.peak, 1),
                "events": p.events,
                "hit_rate": round(p.hits / games, 3) if games else None,
                "miss_rate": round(p.misses / games, 3) if games else None,
                "provisional": p.events < PROVISIONAL_EVENTS,
            })
        board.sort(key=lambda row: -row["rating"])
        for i, row in enumerate(board, start=1):
            row["rank"] = i
        return board
