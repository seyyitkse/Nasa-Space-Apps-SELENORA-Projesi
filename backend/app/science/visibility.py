"""Visibility metrics from sampled elevation series (vectorised with NumPy).

Conventions
-----------
* A body is "visible" at a sample when its elevation is strictly greater than
  the horizon elevation at that azimuth (0° for the geometric horizon).
* The Sun is evaluated at its disc *centre*; partial-disc illumination is not
  modelled (the Sun's angular radius is ~0.27°).
* **Window semantics:** analysis covers the half-open interval ``[start, end)``.
  Sample-and-hold assigns each sample at ``t`` the duration
  ``min(step, end - t)`` hours (0 if ``t >= end``). Therefore an inclusive
  Horizons STOP sample that lands exactly on ``end`` contributes **zero**
  duration and cannot inflate gap/visibility lengths past the analysis window.
* Missing elevations (NaN) are **neither** visible nor invisible: they are
  excluded from duration and percentage denominators and reported via
  ``missing_fraction``.
* Coarse steps (e.g. 60–360 min) are estimates only — resolution is on the
  order of one step; do not claim second-precision event times.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def visibility_mask(elevation_deg: FloatArray, horizon_deg: FloatArray | float = 0.0) -> BoolArray:
    """True where elevation is strictly above the horizon. NaN → False."""
    elev = np.asarray(elevation_deg, dtype=float)
    with np.errstate(invalid="ignore"):
        return np.nan_to_num(elev, nan=-np.inf) > np.asarray(horizon_deg, dtype=float)


def valid_mask(elevation_deg: FloatArray) -> BoolArray:
    return ~np.isnan(np.asarray(elevation_deg, dtype=float))


def classify_visibility(
    elevation_deg: FloatArray, horizon_deg: FloatArray | float = 0.0
) -> tuple[BoolArray, BoolArray, BoolArray]:
    """Return ``(visible, invisible, valid)``; missing samples are in neither class."""
    elev = np.asarray(elevation_deg, dtype=float)
    valid = valid_mask(elev)
    above = visibility_mask(elev, horizon_deg)
    visible = valid & above
    invisible = valid & ~above
    return visible, invisible, valid


def hold_hours_for_samples(
    times: Sequence[datetime],
    step_minutes: float,
    analysis_end_utc: datetime,
) -> FloatArray:
    """Per-sample sample-and-hold duration clamped to ``[t, analysis_end)``."""
    if step_minutes <= 0:
        raise ValueError("step_minutes must be positive")
    end = _as_utc(analysis_end_utc)
    step = timedelta(minutes=float(step_minutes))
    out = np.zeros(len(times), dtype=float)
    for i, t in enumerate(times):
        tt = _as_utc(t)
        if tt >= end:
            out[i] = 0.0
        else:
            out[i] = min(step, end - tt).total_seconds() / 3600.0
    return out


def runs(mask: BoolArray, value: bool = True) -> list[tuple[int, int]]:
    """Return ``(start_idx, end_idx_exclusive)`` for each run of ``value``."""
    m = np.asarray(mask, dtype=bool) == value
    if m.size == 0:
        return []
    padded = np.concatenate(([False], m, [False]))
    edges = np.flatnonzero(np.diff(padded.astype(np.int8)))
    return [(int(s), int(e)) for s, e in zip(edges[0::2], edges[1::2], strict=True)]


def run_hours(mask: BoolArray, hold_hours: FloatArray, value: bool = True) -> list[float]:
    """Duration (hours) of each contiguous run of ``value``, using hold hours."""
    hours = np.asarray(hold_hours, dtype=float)
    if hours.shape != np.asarray(mask).shape:
        raise ValueError("hold_hours must match mask length")
    return [float(hours[s:e].sum()) for s, e in runs(mask, value)]


def longest_run_hours(
    mask: BoolArray,
    step_minutes: float | None = None,
    value: bool = True,
    *,
    hold_hours: FloatArray | None = None,
) -> float:
    """Longest contiguous run duration in hours.

    Prefer ``hold_hours`` (window-clamped). If omitted, falls back to uniform
    ``step_minutes`` per sample (legacy / simple unit tests only).
    """
    if hold_hours is None:
        if step_minutes is None or step_minutes <= 0:
            raise ValueError("step_minutes or hold_hours is required")
        hold_hours = np.full(len(mask), float(step_minutes) / 60.0)
    spans = run_hours(mask, hold_hours, value)
    return max(spans) if spans else 0.0


def percent(mask: BoolArray, hold_hours: FloatArray | None = None) -> float:
    """Fraction of time (or samples) where mask is True, as a percentage."""
    m = np.asarray(mask, dtype=bool)
    if m.size == 0:
        return 0.0
    if hold_hours is None:
        return float(m.mean() * 100.0)
    h = np.asarray(hold_hours, dtype=float)
    total = float(h.sum())
    if total <= 0:
        return 0.0
    return float(h[m].sum() / total * 100.0)


def time_weighted_percent(state: BoolArray, valid: BoolArray, hold_hours: FloatArray) -> float:
    """``state`` hours / ``valid`` hours × 100 (missing samples excluded)."""
    h = np.asarray(hold_hours, dtype=float)
    denom = float(h[np.asarray(valid, dtype=bool)].sum())
    if denom <= 0:
        return 0.0
    return float(h[np.asarray(state, dtype=bool)].sum() / denom * 100.0)


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
    covered_hours: float = 0.0

    def as_metrics(self) -> dict[str, float]:
        d = {k: round(getattr(self, k), 3) for k in self.__dataclass_fields__}
        d.pop("missing_fraction")
        d.pop("covered_hours")
        return d


def summarize(
    sun_elevation_deg: FloatArray,
    earth_elevation_deg: FloatArray,
    step_minutes: float,
    *,
    times: Sequence[datetime] | None = None,
    analysis_end_utc: datetime | None = None,
    sun_horizon_deg: FloatArray | float = 0.0,
    earth_horizon_deg: FloatArray | float = 0.0,
) -> tuple[VisibilitySummary, BoolArray, BoolArray, BoolArray]:
    sun = np.asarray(sun_elevation_deg, dtype=float)
    earth = np.asarray(earth_elevation_deg, dtype=float)
    if sun.shape != earth.shape:
        raise ValueError("Sun and Earth series must have identical sampling.")
    if step_minutes <= 0:
        raise ValueError("step_minutes must be positive")

    n = int(sun.size)
    if times is not None and analysis_end_utc is not None:
        if len(times) != n:
            raise ValueError("times length must match elevation series")
        hold = hold_hours_for_samples(times, step_minutes, analysis_end_utc)
    else:
        hold = np.full(n, float(step_minutes) / 60.0)

    sun_vis, sun_dark, sun_valid = classify_visibility(sun, sun_horizon_deg)
    earth_vis, earth_dark, earth_valid = classify_visibility(earth, earth_horizon_deg)
    valid = sun_valid & earth_valid
    # Joint requires both bodies measured and both above horizon.
    joint = valid & sun_vis & earth_vis

    # Missing if either body lacks a sample at that epoch.
    missing_mask = ~(sun_valid & earth_valid)
    if n == 0:
        missing_fraction = 1.0
    elif float(hold.sum()) > 0:
        missing_fraction = float(hold[missing_mask].sum() / hold.sum())
    else:
        missing_fraction = float(missing_mask.mean())

    covered = float(hold[valid].sum())
    summary = VisibilitySummary(
        sun_visibility_pct=time_weighted_percent(sun_vis & valid, valid, hold),
        earth_visibility_pct=time_weighted_percent(earth_vis & valid, valid, hold),
        joint_visibility_pct=time_weighted_percent(joint, valid, hold),
        longest_sunlight_hours=longest_run_hours(sun_vis & valid, hold_hours=hold, value=True),
        longest_darkness_hours=longest_run_hours(sun_dark & valid, hold_hours=hold, value=True),
        longest_earth_visibility_hours=longest_run_hours(
            earth_vis & valid, hold_hours=hold, value=True
        ),
        longest_communication_gap_hours=longest_run_hours(
            earth_dark & valid, hold_hours=hold, value=True
        ),
        longest_joint_visibility_hours=longest_run_hours(joint, hold_hours=hold, value=True),
        missing_fraction=missing_fraction,
        covered_hours=covered,
    )
    return summary, sun_vis & valid, earth_vis & valid, joint
