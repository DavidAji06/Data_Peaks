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
venv/Scripts/python.exe -m ml.ranking.run_elo --significance                   # + skill-vs-luck checks
venv/Scripts/python.exe -m pytest ml/tests/test_expert_elo.py ml/tests/test_elo_significance.py
```

Outputs in `data/processed/elo/`: `mock_expert_forecasts.csv` (every answer and the
true scores), `elo_history.csv` (per round: place, error, rating before, change, rating
after) and `leaderboard.csv`.

Result for Chad, 40 events, seed 8: the sharp analyst comes first (1215, 87% exact
hits), the strong alarmist (955) and the random guesser (889) come last, and the
improving newcomer keeps climbing (1012 after round 1, 1109 after round 40, 5th place).

## Skill or luck? (statistical significance)

A rating gap can come from a few lucky events. `ml/ranking/significance.py` runs two
simple checks. Turn them on with `--significance`, which also writes
`leaderboard_significance.csv`.

1. **Bootstrap intervals.** The season is replayed 500 times. Each replay draws the
   same number of events with replacement, in a random order, and recomputes every
   rating. The result is a 90% interval for each expert's rating and rank, plus how
   often they finish in the top 3 (`p_top3`). A rank interval of "3-7" means the data
   cannot yet place that expert.
2. **Paired permutation test.** For two experts, take the difference in total error on
   each event. If they were equally good, each difference would be as likely to be
   positive as negative. Flipping the signs at random 10,000 times gives the chance
   that a gap this big appears by luck (the p-value). It makes no assumption about the
   shape of the errors.

These feed into:

- **Tiers.** Walk down the board. An expert joins the current tier unless the tier's
  top expert is significantly better (p < 0.05). Experts in one tier should be shown as
  equal. Comparing with the tier's top expert, not the neighbour, stops many small gaps
  from merging the whole board into one tier.
- **Beats baseline.** Is each expert better than the random guesser and better than
  "always say the usual" (the base-rate expert)? An expert who can't beat the base rate
  is adding no information, however high their rating.

Chad, 40 events: the sharp analyst is alone in tier 1 (rank interval 1-1). Ranks 2-4
form tier 2 and ranks 5-8 form tier 3. The improving newcomer and the expert who plays
things down are not yet significantly better than the base rate (p = 0.10 and 0.16).
With only 10 events the top 6 share tier 1, so the ranking needs time to mean
something.

Limits, kept simple on purpose:

- The bootstrap shuffles event order, so it ignores trends such as an expert who
  improves.
- The tests use raw error, not rating.
- Running many pairwise tests turns up some false "differences" by chance. Treat
  p-values near 0.05 as weak, or use a Holm correction if you test every pair.
- Show "provisional" until an expert has about 20 resolved events.

## Using it in the app

`EloLeague.rate_event(predictions, actual)` takes plain dicts, so the backend can call
it when a moderator resolves a question. It can also replace or sit next to the Brier
score in `backend/app/services/scoring.py`. To score yes/no probability questions,
use the Brier score as the per-question result (S = 1 - Brier) in the same formula.
