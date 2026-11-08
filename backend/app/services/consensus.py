"""Delphi consensus statistics and convergence analysis."""
from __future__ import annotations

import statistics
from typing import Any


def calculate_iqr(values: list[float]) -> float:
    """Interquartile range (Q3 - Q1)."""
    if len(values) < 2:
        return 0.0
    sorted_vals = sorted(values)
    # Using quantiles (available in Python 3.8+)
    try:
        q1, _, q3 = statistics.quantiles(sorted_vals, n=4, method="inclusive")
        return round(q3 - q1, 4)
    except Exception:
        # Fallback to simple split
        n = len(sorted_vals)
        mid = n // 2
        lower = sorted_vals[:mid]
        upper = sorted_vals[mid + 1:] if n % 2 != 0 else sorted_vals[mid:]
        if not lower or not upper:
            return round(sorted_vals[-1] - sorted_vals[0], 4)
        return round(statistics.median(upper) - statistics.median(lower), 4)


def summarise_round(values: list[float]) -> dict[str, Any] | None:
    """Computes distribution statistics for a round of forecasts."""
    if not values:
        return None

    count = len(values)
    med = round(statistics.median(values), 4)
    mean_val = round(statistics.mean(values), 4)
    min_val = round(min(values), 4)
    max_val = round(max(values), 4)
    spread = round(max_val - min_val, 4)
    iqr = calculate_iqr(values)
    std_dev = round(statistics.stdev(values), 4) if count >= 2 else 0.0

    return {
        "count": count,
        "median": med,
        "mean": mean_val,
        "min": min_val,
        "max": max_val,
        "spread": spread,
        "iqr": iqr,
        "std_dev": std_dev,
    }


def compute_delphi_metrics(
    round_1_dict: dict[str, float],
    round_2_dict: dict[str, float],
    latest_dict: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Computes consensus metrics comparing Round 1 (tentative) with Round 2 (finalised)
    or latest estimates.
    """
    r1_values = list(round_1_dict.values())
    r2_values = list(round_2_dict.values())
    latest_values = list(latest_dict.values()) if latest_dict else r2_values

    r1_summary = summarise_round(r1_values)
    r2_summary = summarise_round(r2_values)
    latest_summary = summarise_round(latest_values)

    # Compare experts who participated in both rounds
    common_experts = set(round_1_dict.keys()).intersection(round_2_dict.keys())
    retained_count = 0
    adjusted_count = 0
    shifts = []

    for expert_id in common_experts:
        p1 = round_1_dict[expert_id]
        p2 = round_2_dict[expert_id]
        shift = round(p2 - p1, 4)
        shifts.append(shift)
        if abs(shift) < 0.001:
            retained_count += 1
        else:
            adjusted_count += 1

    median_shift = None
    if r1_summary and latest_summary:
        median_shift = round(latest_summary["median"] - r1_summary["median"], 4)

    # Spread reduction (convergence)
    spread_reduction = None
    convergence_rate = None
    if r1_summary and latest_summary:
        r1_spread = r1_summary["spread"]
        latest_spread = latest_summary["spread"]
        spread_reduction = round(r1_spread - latest_spread, 4)
        if r1_spread > 0:
            convergence_rate = round(spread_reduction / r1_spread, 4)
        else:
            convergence_rate = 0.0

    # Qualitative consensus status
    consensus_status = "undetermined"
    if latest_summary:
        current_spread = latest_summary["spread"]
        current_iqr = latest_summary["iqr"]
        if current_spread <= 0.15 or current_iqr <= 0.08:
            consensus_status = "strong_consensus"
        elif current_spread <= 0.30 or current_iqr <= 0.15:
            consensus_status = "moderate_consensus"
        else:
            consensus_status = "divergent"

    return {
        "round_1": r1_summary,
        "round_2": r2_summary,
        "latest": latest_summary,
        "median_shift": median_shift,
        "spread_reduction": spread_reduction,
        "convergence_rate": convergence_rate,
        "retained_count": retained_count,
        "adjusted_count": adjusted_count,
        "consensus_status": consensus_status,
        "mean_shift": round(statistics.mean(shifts), 4) if shifts else 0.0,
    }
