"""Compare Horizons body elevations to a LOLA-derived terrain horizon.

Visibility states (Phase 4.1)
-----------------------------
* **BLOCKED** — body elevation ≤ known terrain horizon along that azimuth
  (a measured obstacle already occults the body; far-field DEM gaps do not
  overturn this).
* **VISIBLE** — body above the known horizon **and** the ray has complete
  coverage out to the requested ``max_range_m`` (no unknown far terrain).
* **UNKNOWN** — no DEM samples, or body appears clear of known terrain but the
  ray is truncated by the DEM boundary / NoData (far terrain could still block).

UNKNOWN samples are excluded from visibility percentage denominators; callers
must surface unknown duration / fraction so a small known subset is never
presented as a definitive 100% terrain result.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray

from app.science import visibility as vis
from app.science.horizon_profile import HorizonProfile

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]


class TerrainVisState(str, Enum):
    VISIBLE = "VISIBLE"
    BLOCKED = "BLOCKED"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True, slots=True)
class TerrainBodyVisibility:
    visible: BoolArray
    blocked: BoolArray
    unknown: BoolArray
    terrain_horizon_deg: FloatArray
    geometric_visible: BoolArray
    states: NDArray  # dtype=object, TerrainVisState values


def classify_sample(
    body_elevation_deg: float,
    lookup,
) -> TerrainVisState:
    """Classify one body elevation against a horizon lookup."""
    if not lookup.has_any_data or not np.isfinite(lookup.horizon_elevation_deg):
        return TerrainVisState.UNKNOWN
    if not np.isfinite(body_elevation_deg):
        return TerrainVisState.UNKNOWN
    if body_elevation_deg <= lookup.horizon_elevation_deg:
        return TerrainVisState.BLOCKED
    if lookup.complete_coverage:
        return TerrainVisState.VISIBLE
    return TerrainVisState.UNKNOWN


def body_vs_terrain(
    body_azimuth_deg: FloatArray,
    body_elevation_deg: FloatArray,
    profile: HorizonProfile,
    *,
    geometric_horizon_deg: float = 0.0,
) -> TerrainBodyVisibility:
    az = np.asarray(body_azimuth_deg, dtype=float)
    el = np.asarray(body_elevation_deg, dtype=float)
    if az.shape != el.shape:
        raise ValueError("azimuth and elevation series must match")

    n = az.size
    terrain_h = np.full(n, np.nan, dtype=float)
    visible = np.zeros(n, dtype=bool)
    blocked = np.zeros(n, dtype=bool)
    unknown = np.ones(n, dtype=bool)
    states = np.empty(n, dtype=object)

    for i in range(n):
        if np.isnan(az[i]) or np.isnan(el[i]):
            states[i] = TerrainVisState.UNKNOWN
            continue
        lookup = profile.lookup(float(az[i]))
        terrain_h[i] = lookup.horizon_elevation_deg
        state = classify_sample(float(el[i]), lookup)
        states[i] = state
        if state is TerrainVisState.VISIBLE:
            visible[i] = True
            unknown[i] = False
        elif state is TerrainVisState.BLOCKED:
            blocked[i] = True
            unknown[i] = False
        else:
            unknown[i] = True

    geometric = vis.visibility_mask(el, geometric_horizon_deg)
    return TerrainBodyVisibility(
        visible=visible,
        blocked=blocked,
        unknown=unknown,
        terrain_horizon_deg=terrain_h,
        geometric_visible=geometric,
        states=states,
    )


def summarize_terrain_pair(
    sun_az: FloatArray,
    sun_el: FloatArray,
    earth_az: FloatArray,
    earth_el: FloatArray,
    profile: HorizonProfile,
    step_minutes: float,
    *,
    times,
    analysis_end_utc,
) -> tuple[vis.VisibilitySummary, BoolArray, BoolArray, BoolArray, BoolArray, BoolArray, dict]:
    """Build a VisibilitySummary using terrain-adjusted Sun/Earth masks.

    Returns
    -------
    summary, sun_vis, earth_vis, joint, sun_blocked, earth_blocked, meta

    UNKNOWN samples are encoded as NaN so ``summarize`` excludes them from each
    body's denominator. Blocked masks are returned explicitly for darkness /
    communication-gap windows (UNKNOWN must never appear as darkness).
    """
    sun_t = body_vs_terrain(sun_az, sun_el, profile)
    earth_t = body_vs_terrain(earth_az, earth_el, profile)

    # Encode UNKNOWN as NaN so summarize() excludes them from denominators.
    sun_proxy = np.where(sun_t.unknown, np.nan, np.where(sun_t.visible, 1.0, -1.0))
    earth_proxy = np.where(earth_t.unknown, np.nan, np.where(earth_t.visible, 1.0, -1.0))
    summary, sun_vis, earth_vis, joint = vis.summarize(
        sun_proxy,
        earth_proxy,
        step_minutes,
        times=times,
        analysis_end_utc=analysis_end_utc,
    )

    hours = vis.hold_hours_for_samples(times, step_minutes, analysis_end_utc)
    sun_unknown_hours = float(hours[sun_t.unknown].sum()) if hours.size else 0.0
    earth_unknown_hours = float(hours[earth_t.unknown].sum()) if hours.size else 0.0
    either_unknown = sun_t.unknown | earth_t.unknown
    unknown_hours = float(hours[either_unknown].sum()) if hours.size else 0.0
    total_hours = float(hours.sum()) if hours.size else 0.0

    meta = {
        "sun_unknown_fraction": float(np.mean(sun_t.unknown)) if sun_t.unknown.size else 1.0,
        "earth_unknown_fraction": float(np.mean(earth_t.unknown)) if earth_t.unknown.size else 1.0,
        "sun_unknown_hours": sun_unknown_hours,
        "earth_unknown_hours": earth_unknown_hours,
        "unknown_hours": unknown_hours,
        "analysis_window_hours": total_hours,
        "known_sample_fraction": float(np.mean(~either_unknown)) if either_unknown.size else 0.0,
        "horizon_coverage_fraction": profile.complete_coverage_fraction,
        "any_data_fraction": profile.any_data_fraction,
        "complete_coverage_fraction": profile.complete_coverage_fraction,
        "median_valid_range_m": float(np.median(profile.valid_range_m[profile.has_any_data]))
        if np.any(profile.has_any_data)
        else 0.0,
        "min_valid_range_m": float(np.min(profile.valid_range_m[profile.has_any_data]))
        if np.any(profile.has_any_data)
        else 0.0,
        "max_range_m": profile.max_range_m,
        "observer_height_m": profile.observer_height_m,
        "true_north_grid_azimuth_deg": profile.true_north_grid_azimuth_deg,
        "sun_blocked_fraction": float(np.mean(sun_t.blocked)) if sun_t.blocked.size else 0.0,
        "earth_blocked_fraction": float(np.mean(earth_t.blocked)) if earth_t.blocked.size else 0.0,
    }
    return summary, sun_vis, earth_vis, joint, sun_t.blocked, earth_t.blocked, meta
