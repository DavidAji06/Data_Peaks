"""
Brier-weighted group estimate, for moderators only (see docs/brier-weighting.md).

skill  = max(0, 1 - mean_brier / 0.25)   0.25 (always 50%) gives 0, a perfect record gives 1
weight = 0.2 + skill                     so nobody is ignored completely
Experts with fewer than 3 resolved questions get a neutral weight of 1.
"""

BASELINE_BRIER = 0.25
MIN_WEIGHT = 0.2
NEUTRAL_WEIGHT = 1.0
MIN_RESOLVED = 3
LABEL = "Weighted by past accuracy (Brier)"


def expert_weight(briers: list[float]) -> float:
    """Weight from an expert's Brier scores on resolved questions."""
    if len(briers) < MIN_RESOLVED:
        return NEUTRAL_WEIGHT
    mean_brier = sum(briers) / len(briers)
    skill = max(0.0, 1 - mean_brier / BASELINE_BRIER)
    return round(MIN_WEIGHT + skill, 4)


def weighted_estimate(answers: list[tuple[float, float]]) -> dict | None:
    """answers: (probability, weight) pairs. Returns the weighted mean and weighted median."""
    answers = [(p, w) for p, w in answers if w > 0]
    if not answers:
        return None
    total = sum(w for _, w in answers)
    mean = sum(p * w for p, w in answers) / total

    # Weighted median: the smallest probability where the running weight reaches half the total
    running = 0.0
    median = answers[0][0]
    for p, w in sorted(answers):
        running += w
        if running >= total / 2:
            median = p
            break

    return {"mean": round(mean, 2), "median": round(median, 2), "count": len(answers)}
