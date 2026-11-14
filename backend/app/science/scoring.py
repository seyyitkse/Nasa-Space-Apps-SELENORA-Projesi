"""Deterministic, explainable decision-support score.

    Score = w_sun * SunVisibility% + w_earth * EarthVisibility% + w_joint * JointVisibility%

with weights expressed in percent and summing to 100, so Score is in [0, 100].
This is a comparative planning heuristic — NOT a NASA-endorsed landing-safety score.
"""

from __future__ import annotations

from dataclasses import dataclass

SCORABLE_QUALITIES = {"EPHEMERIS_GEOMETRIC", "EPHEMERIS_TERRAIN", "SYNTHETIC_DEMO"}
METRIC_KEYS = {
    "sun_visibility": "sun_visibility_pct",
    "earth_visibility": "earth_visibility_pct",
    "joint_visibility": "joint_visibility_pct",
}


@dataclass(frozen=True, slots=True)
class Contribution:
    metric: str
    weight_pct: float
    value_pct: float
    contribution: float


def validate_weights(weights: dict[str, float]) -> None:
    if set(weights) != set(METRIC_KEYS):
        raise ValueError(f"weights must have keys {sorted(METRIC_KEYS)}")
    if any(w < 0 for w in weights.values()):
        raise ValueError("weights must be non-negative")
    if abs(sum(weights.values()) - 100.0) > 0.01:
        raise ValueError("weights must sum to 100")


def score_site(
    metrics: dict[str, float], weights: dict[str, float]
) -> tuple[float, list[Contribution]]:
    validate_weights(weights)
    contributions = []
    for name, metric_key in METRIC_KEYS.items():
        value = float(metrics[metric_key])
        if not 0.0 <= value <= 100.0:
            raise ValueError(f"{metric_key} must be a percentage in [0, 100]")
        contributions.append(
            Contribution(
                metric=name,
                weight_pct=weights[name],
                value_pct=round(value, 3),
                contribution=round(weights[name] / 100.0 * value, 3),
            )
        )
    return round(sum(c.contribution for c in contributions), 3), contributions


def rank(scores: list[float | None]) -> list[int | None]:
    """Dense ranking, 1 = best. Ties share a rank. ``None`` scores are unranked."""
    distinct = sorted({s for s in scores if s is not None}, reverse=True)
    return [None if s is None else distinct.index(s) + 1 for s in scores]


def is_scorable(data_quality: str, missing_fraction: float, max_missing: float = 0.05) -> bool:
    """Refuse to produce a ranking from unreliable inputs."""
    return data_quality in SCORABLE_QUALITIES and missing_fraction <= max_missing
