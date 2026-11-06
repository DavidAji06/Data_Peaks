"""ACAPS impact = chart[exposure, intensity].

Source: ACAPS "Introduction to Risk Analysis Methodology" (May 2019), pp. 9-10.
Rows = exposure 1..5, columns = intensity 1..6 (the 6th column has no level on the
1-5 intensity scale; it is kept as published but never reached from a 1-5 score).
"""
from __future__ import annotations

IMPACT_LABELS = ["Very Low", "Low", "Moderate", "Significant", "Major"]
LABEL_TO_SCORE = {lbl: i + 1 for i, lbl in enumerate(IMPACT_LABELS)}

_VL, _L, _M, _S, _MJ = IMPACT_LABELS
IMPACT_MATRIX: dict[int, list[str]] = {
    5: [_VL, _L, _M, _S, _MJ, _MJ],
    4: [_VL, _L, _M, _S, _MJ, _MJ],
    3: [_VL, _L, _L, _M, _S, _MJ],
    2: [_VL, _VL, _L, _M, _S, _S],
    1: [_VL, _VL, _L, _L, _M, _S],
}

# Exposure bands (p.9): upper bounds (exclusive) for scores 1..4, anything above is 5
PIN_BANDS = [10_000, 50_000, 100_000, 250_000]
SHARE_BANDS = [0.05, 0.15, 0.30, 0.50]


def impact_from_matrix(exposure: int, intensity: int) -> tuple[int, str]:
    label = IMPACT_MATRIX[int(exposure)][int(intensity) - 1]
    return LABEL_TO_SCORE[label], label


def band(value: float, bounds: list[float] = PIN_BANDS) -> int:
    return 1 + sum(value >= b for b in bounds)
