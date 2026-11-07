"""Synthetic expert panel that "scores" real ACAPS access events.

No real people: every expert is a made-up pseudonym with a made-up forecasting
style. Each expert reads an event and gives intensity (1-5), exposure (1-5) and
impact (1-5, the ACAPS risk/impact level). Their answer is the real ACAPS-method
score (from data/processed/access_events_scored_v7.csv) distorted by the expert's
own bias and noise, so we know which styles *should* end up on top.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ml.pipeline.impact import impact_from_matrix


@dataclass(frozen=True)
class ExpertProfile:
    expert_id: str
    pseudonym: str
    style: str
    noise: float                 # std dev of the error on each factor (score points)
    bias_intensity: float = 0.0  # + = alarmist, - = plays things down
    bias_exposure: float = 0.0
    impact_from_chart: bool = True   # derives impact from own I/E via the ACAPS chart
    impact_noise: float = 0.0        # extra noise when guessing impact directly
    learning: float = 0.0            # noise shrinks by this share over the season
    mode: str = "noisy"              # noisy | base_rate | random


PANEL: list[ExpertProfile] = [
    ExpertProfile("EXP-01", "Sahel Owl", "Sharp field analyst", noise=0.35),
    ExpertProfile("EXP-02", "Lake Heron", "Solid generalist", noise=0.55),
    ExpertProfile("EXP-03", "Desert Kite", "Good but a bit alarmist", noise=0.45,
                  bias_intensity=0.45, bias_exposure=0.3),
    ExpertProfile("EXP-04", "Red Siren", "Strongly alarmist", noise=0.6,
                  bias_intensity=1.0, bias_exposure=0.9),
    ExpertProfile("EXP-05", "Calm Tortoise", "Plays things down", noise=0.55,
                  bias_intensity=-0.8, bias_exposure=-0.7),
    ExpertProfile("EXP-06", "Narrow Lens", "Knows violence, not numbers", noise=0.4,
                  impact_from_chart=False, impact_noise=1.0),
    ExpertProfile("EXP-07", "Steady Camel", "Average", noise=0.85),
    ExpertProfile("EXP-08", "Rising Falcon", "Newcomer who improves fast", noise=1.3,
                  learning=0.75),
    ExpertProfile("EXP-09", "Old Baobab", "Always predicts the usual (base rate)",
                  noise=0.0, mode="base_rate"),
    ExpertProfile("EXP-10", "Wild Card", "Guesses at random", noise=0.0, mode="random"),
]


def _clip(x: float) -> int:
    return int(min(5, max(1, round(x))))


def predict(profile: ExpertProfile, actual: dict, history: list[dict],
            progress: float, rng: np.random.Generator) -> dict:
    """One expert's scores for one event.

    actual:   true scores of this event (used to simulate what the expert reads)
    history:  true scores of the *earlier* events (what a base-rate expert knows)
    progress: 0 at the first event of the season, 1 at the last
    """
    if profile.mode == "random":
        return {f: int(rng.integers(1, 6)) for f in ("intensity", "exposure", "impact")}

    if profile.mode == "base_rate":
        if not history:
            return {"intensity": 3, "exposure": 2, "impact": 2}
        return {f: _clip(float(np.median([h[f] for h in history])))
                for f in ("intensity", "exposure", "impact")}

    noise = profile.noise * (1.0 - profile.learning * progress)
    intensity = _clip(actual["intensity"] + profile.bias_intensity + rng.normal(0, noise))
    exposure = _clip(actual["exposure"] + profile.bias_exposure + rng.normal(0, noise))
    if profile.impact_from_chart:
        impact, _ = impact_from_matrix(exposure, intensity)
    else:
        impact = _clip(actual["impact"] + rng.normal(0, profile.impact_noise))
    return {"intensity": intensity, "exposure": exposure, "impact": impact}
