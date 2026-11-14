"""Visibility metrics from sampled elevation series (vectorised with NumPy).

Conventions
-----------
* A body is "visible" at a sample when its elevation is strictly greater than
  the horizon elevation at that azimuth (0° for the geometric horizon).
* The Sun is evaluated at its disc *centre*; partial-disc illumination is not
  modelled (the Sun's angular radius is ~0.27°).
* Sample-and-hold: each sample represents one ``step_minutes`` interval, so
  every duration has a resolution of ±1 step.
* NaN elevations (missing data) are treated as NOT visible and reported via
  ``missing_fraction`` so callers can downgrade data quality.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]


def visibility_mask(elevation_deg: FloatArray, horizon_deg: FloatArray | float = 0.0) -> BoolArray:
    elev = np.asarray(elevation_deg, dtype=float)
    with np.errstate(invalid="ignore"):
        return np.nan_to_num(elev, nan=-np.inf) > np.asarray(horizon_deg, dtype=float)


def runs(mask: BoolArray, value: bool = True) -> list[tuple[int, int]]:
    """Return ``(start_idx, end_idx_exclusive)`` for each run of ``value``."""
    m = np.asarray(mask, dtype=bool) == value
    if m.size == 0:
        return []
    padded = np.concatenate(([False], m, [False]))
    edges = np.flatnonzero(np.diff(padded.astype(np.int8)))
    return [(int(s), int(e)) for s, e in zip(edges[0::2], edges[1::2], strict=True)]


def longest_run_hours(mask: BoolArray, step_minutes: float, value: bool = True) -> float:
    spans = runs(mask, value)
    if not spans:
        return 0.0
    return max(e - s for s, e in spans) * step_minutes / 60.0


def percent(mask: BoolArray) -> float:
    m = np.asarray(mask, dtype=bool)
    return float(m.mean() * 100.0) if m.size else 0.0


@dataclass(frozen=True, slots=True)
class VisibilitySummary:
    sun_visibility_pct: float
    earth_visibility_pct: float
    joint_visibility_pct: float
    longest_sunlight_hours: float
    longest_darkness_hours: float
    longest_earth_visibility_hours: float
    longest_communication_gap_hours: float
    longest_joint_visibility_hours: float
    missing_fraction: float

    def as_metrics(self) -> dict[str, float]:
        d = {k: round(getattr(self, k), 3) for k in self.__dataclass_fields__}
        d.pop("missing_fraction")
        return d


def summarize(
    sun_elevation_deg: FloatArray,
    earth_elevation_deg: FloatArray,
    step_minutes: float,
    sun_horizon_deg: FloatArray | float = 0.0,
    earth_horizon_deg: FloatArray | float = 0.0,
) -> tuple[VisibilitySummary, BoolArray, BoolArray, BoolArray]:
    sun = np.asarray(sun_elevation_deg, dtype=float)
    earth = np.asarray(earth_elevation_deg, dtype=float)
    if sun.shape != earth.shape:
        raise ValueError("Sun and Earth series must have identical sampling.")
    if step_minutes <= 0:
        raise ValueError("step_minutes must be positive")
    sun_vis = visibility_mask(sun, sun_horizon_deg)
    earth_vis = visibility_mask(earth, earth_horizon_deg)
    joint = sun_vis & earth_vis
    missing = float((np.isnan(sun) | np.isnan(earth)).mean()) if sun.size else 1.0
    summary = VisibilitySummary(
        sun_visibility_pct=percent(sun_vis),
        earth_visibility_pct=percent(earth_vis),
        joint_visibility_pct=percent(joint),
        longest_sunlight_hours=longest_run_hours(sun_vis, step_minutes, True),
        longest_darkness_hours=longest_run_hours(sun_vis, step_minutes, False),
        longest_earth_visibility_hours=longest_run_hours(earth_vis, step_minutes, True),
        longest_communication_gap_hours=longest_run_hours(earth_vis, step_minutes, False),
        longest_joint_visibility_hours=longest_run_hours(joint, step_minutes, True),
        missing_fraction=missing,
    )
    return summary, sun_vis, earth_vis, joint
