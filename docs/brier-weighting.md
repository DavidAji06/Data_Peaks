# Brier-weighted group estimate (moderators only)

The moderator dashboard shows two group estimates for each question:

- **Plain median**: the middle of all experts' latest answers. Every expert counts the same.
- **Weighted by past accuracy (Brier)**: experts with a better track record count for more.

Experts never see the weighted estimate, their own weight or any Brier score. The expert app
shows the plain median and range only.

## How a weight is worked out

1. For every resolved question an expert answered, take their latest answer and compute the
   **Brier score**: (answer − outcome)². The outcome is 1 if it happened and 0 if it didn't.
   0 is perfect. Always answering 50% scores 0.25.
2. Average those scores to get the expert's **mean Brier**. The question being weighted is left
   out, so a resolved question's own outcome never feeds its weights.
3. **Skill** = max(0, 1 − mean Brier ÷ 0.25). Someone who always says 50% has skill 0; a perfect
   record has skill 1; anyone worse than 50% is held at 0.
4. **Weight** = 0.2 + skill. So weights run from 0.2 to 1.2 and nobody is ignored completely.
5. Experts with **fewer than 3 resolved questions** get a neutral weight of **1**: too few
   outcomes to judge.

| Mean Brier | Skill | Weight |
| --- | --- | --- |
| 0.00 (perfect) | 1.0 | 1.2 |
| 0.125 | 0.5 | 0.7 |
| 0.25 (always 50%) | 0.0 | 0.2 |
| 0.40 (worse than 50%) | 0.0 | 0.2 |
| fewer than 3 resolved | – | 1.0 |

## The estimate

- **Weighted mean** = Σ(weight × answer) ÷ Σ weight.
- **Weighted median**: sort the answers, add up their weights, and take the first answer where
  the running total reaches half of all the weight.

Code: `backend/app/services/weighting.py` (`expert_weight`, `weighted_estimate`), used by
`GET /moderator/questions` and `GET /moderator/questions/{id}`. Tests: `backend/tests/test_api.py`.

## Privacy

- Anonymous experts' scores are used privately for weighting. On the question page their
  weight is not shown (`weight: null`), and they stay off the leaderboard.
- Expert endpoints (`/q/{token}/...`) and `/public/questions` return no Brier scores or weights.

## Follow-up: Elo instead of Brier?

`ml/ranking/` has an Elo-style rating with significance checks. It compares experts on the same
questions, so it copes better when experts answered different, easier or harder questions. It
could replace Brier as the weight later. For now we keep Brier: it is simple to explain to
moderators and experts, and the pilot has too few resolved questions for Elo ratings to settle.
