# Expert Elo ranking

Ranks experts by how close their scores were to what actually happened, like a chess
rating. Code: `ml/ranking/`. Branch: `expert-elo`.

## How a rating changes

Everyone starts at **1000**. The rating can never go below **0**.
After each resolved event, every expert on the panel plays two kinds of "games":

| Game | Opponent | Win (1) | Draw (0.5) | Loss (0) |
|---|---|---|---|---|
| Expert vs event, one per factor (intensity, exposure, impact) | the event, fixed "par" rating 1000 | exact score | off by one | off by two or more |
| Expert vs each other panelist | that panelist's rating | smaller total error | same error | bigger error |

```
E(a, b)    = 1 / (1 + 10^((R_b - R_a) / 400))           standard Elo expectation
delta      = K * ( 0.5 * mean_factors(S - E(R, par))
                 + 0.5 * mean_peers(S - E(R, R_peer)) )
new rating = max(0, R + delta)
K          = 40 for an expert's first 10 events, then 20
```

So a right answer always gains points and a wrong one always loses points, and the
amount depends on the rating, as in chess: a top-rated expert gains little for an
expected hit and loses more for a miss. Beating a stronger panelist is worth more
than beating a weaker one. All updates in one event use the ratings from before that
event, so the order of answers does not matter.

"Risk" here is the ACAPS **impact** level (1-5, Very Low to Major). For an event that
has already happened, the probability is 1, so its risk level equals its impact.

## Mock data

There are no real experts. `ml/ranking/mock_experts.py` defines 10 synthetic experts,
each with a style (sharp, alarmist, plays things down, base-rate, random, improving
newcomer, ...). They "score" real ACAPS humanitarian access events. Each answer is the
event's real score (`data/processed/access_events_scored_v7.csv`, ACAPS methodology)
plus that expert's bias and noise. The base-rate expert only sees earlier events.

```bash
venv/Scripts/python.exe -m ml.ranking.run_elo                                  # Chad, last 40 events
venv/Scripts/python.exe -m ml.ranking.run_elo --country Sudan --events 80 --show-round 12
venv/Scripts/python.exe -m pytest ml/tests/test_expert_elo.py
```

Outputs in `data/processed/elo/`: `mock_expert_forecasts.csv` (every answer and the
true scores), `elo_history.csv` (per round: place, error, rating before, change, rating
after) and `leaderboard.csv`.

Result for Chad, 40 events, seed 8: the sharp analyst comes first (1215, 87% exact
hits), the strong alarmist (955) and the random guesser (889) come last, and the
improving newcomer keeps climbing (1012 after round 1, 1109 after round 40, 5th place).

## Using it in the app

`EloLeague.rate_event(predictions, actual)` takes plain dicts, so the backend can call
it when a moderator resolves a question. It can also replace or sit next to the Brier
score in `backend/app/services/scoring.py`. To score yes/no probability questions,
use the Brier score as the per-question result (S = 1 - Brier) in the same formula.
