"""Relative solar-incidence potential over sampled Sun geometry (Phase 7B).

Pure NumPy. No I/O, no ephemeris request, no terrain engine call: every input
is an already-classified per-epoch series (the ``/epochs`` contract).

What is computed
----------------
A dimensionless **relative index**::

    index = Σ f · cos θ · hold_hours  /  Σ hold_hours

* ``f`` — fraction of the solar disc above the horizon (0…1), first-order
  circular-segment model with the horizon treated as a straight line across
  the 0.53° disc.
* ``cos θ`` — cosine of the angle between the panel normal and the Sun
  direction (0 when the Sun is behind the panel).
* The reference (index = 1) is a dual-axis tracking panel in continuous,
  unobstructed sunlight for the whole analysis window.

What is NOT computed
--------------------
Irradiance, watts, kWh or any electrical quantity. Those need hardware
(cell efficiency, area, temperature, dust, degradation, storage) and an
irradiance model (Sun distance), none of which exist here.

Conventions
-----------
* Azimuth: degrees clockwise from local true north (JPL Horizons convention,
  same as the stored series). East = 90°.
* Elevation: degrees above the local horizontal plane.
* Panel tilt β: angle between the panel normal and the local vertical
  (0° = horizontal, face up; 90° = vertical).
* Panel azimuth A₀: azimuth of the horizontal projection of the panel normal.

Three-valued visibility
-----------------------
Every sample carries a lower and an upper bound of ``f · cos θ``. A known
sample has equal bounds. UNKNOWN is never coerced to visible or blocked: it
contributes 0 to the lower bound and the largest value the available data
allow to the upper bound.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]

# Nominal apparent solar angular radius at 1 AU (deg). Varies ±1.7 % with the
# Sun–Moon distance; only used for the partial-disc factor near the horizon.
SUN_NOMINAL_ANGULAR_RADIUS_DEG = 0.2666

# Bounds closer than this (in index units, 0…1) are reported as one value.
DETERMINED_TOLERANCE = 1e-9


class PanelKind(str, Enum):
    HORIZONTAL = "HORIZONTAL"
    FIXED = "FIXED"
    AZIMUTH_TRACKING = "AZIMUTH_TRACKING"
    DUAL_AXIS = "DUAL_AXIS"


class SunState(str, Enum):
    VISIBLE = "VISIBLE"
    BLOCKED = "BLOCKED"
    UNKNOWN = "UNKNOWN"


class PanelConfigurationError(ValueError):
    """Panel parameters outside the supported, physically meaningful range."""


@dataclass(frozen=True, slots=True)
class PanelSpec:
    kind: PanelKind
    tilt_deg: float | None = None
    azimuth_deg: float | None = None

    def __post_init__(self) -> None:
        tilt, az = self.tilt_deg, self.azimuth_deg
        if tilt is not None and not (np.isfinite(tilt) and 0.0 <= tilt <= 90.0):
            raise PanelConfigurationError("tilt_deg must be within [0, 90].")
        if az is not None and not (np.isfinite(az) and 0.0 <= az < 360.0):
            raise PanelConfigurationError("azimuth_deg must be within [0, 360).")
        if self.kind is PanelKind.FIXED and (tilt is None or az is None):
            raise PanelConfigurationError("A fixed panel needs both tilt_deg and azimuth_deg.")
        if self.kind is PanelKind.AZIMUTH_TRACKING and tilt is None:
            raise PanelConfigurationError("An azimuth-tracking panel needs tilt_deg.")
        if self.kind is PanelKind.AZIMUTH_TRACKING and az is not None:
            raise PanelConfigurationError("An azimuth-tracking panel has no fixed azimuth.")
        if self.kind in (PanelKind.HORIZONTAL, PanelKind.DUAL_AXIS) and (
            tilt is not None or az is not None
        ):
            raise PanelConfigurationError(f"{self.kind.value} takes no tilt or azimuth.")


def disc_fraction(
    margin_deg: FloatArray | float, radius_deg: float = SUN_NOMINAL_ANGULAR_RADIUS_DEG
) -> FloatArray:
    """Fraction of a circular disc above a straight horizon.

    ``margin_deg`` is disc-centre elevation minus horizon elevation. Returns 0
    at ``margin ≤ −ρ``, 0.5 at 0 and 1 at ``margin ≥ +ρ``. NaN propagates.
    """
    if radius_deg <= 0:
        raise ValueError("radius_deg must be positive")
    m = np.asarray(margin_deg, dtype=float)
    x = np.clip(m / radius_deg, -1.0, 1.0)
    return (np.arccos(-x) + x * np.sqrt(1.0 - x * x)) / np.pi


def incidence_cosine(
    panel: PanelSpec, sun_azimuth_deg: FloatArray, sun_elevation_deg: FloatArray
) -> FloatArray:
    """cos θ between the panel normal and the Sun direction, clamped at 0.

    NaN where the Sun direction is missing (a fixed panel needs azimuth too).
    """
    az = np.radians(np.asarray(sun_azimuth_deg, dtype=float))
    el = np.radians(np.asarray(sun_elevation_deg, dtype=float))
    if az.shape != el.shape:
        raise ValueError("azimuth and elevation series must match")
    if panel.kind is PanelKind.DUAL_AXIS:
        cos = np.where(np.isnan(el), np.nan, 1.0)
    elif panel.kind is PanelKind.HORIZONTAL:
        cos = np.sin(el)
    elif panel.kind is PanelKind.AZIMUTH_TRACKING:
        # Normal azimuth always equals the Sun azimuth → sin e cos β + cos e sin β.
        cos = np.sin(el + np.radians(float(panel.tilt_deg)))  # type: ignore[arg-type]
    else:
        beta = np.radians(float(panel.tilt_deg))  # type: ignore[arg-type]
        a0 = np.radians(float(panel.azimuth_deg))  # type: ignore[arg-type]
        cos = np.sin(el) * np.cos(beta) + np.cos(el) * np.sin(beta) * np.cos(az - a0)
    with np.errstate(invalid="ignore"):
        return np.where(np.isnan(cos), np.nan, np.clip(cos, 0.0, 1.0))


@dataclass(frozen=True, slots=True)
class SunFactor:
    """Per-sample bounds of the visible disc fraction ``f``."""

    lower: FloatArray
    upper: FloatArray
    ephemeris_missing: BoolArray
    """No Sun direction at all: nothing about incidence is known."""
    state_unknown: BoolArray
    """Visibility state is UNKNOWN (includes ``ephemeris_missing``)."""
    edge_uncertain: BoolArray
    """Known-BLOCKED sample whose upper limb may still clear the known horizon."""


def geometric_sun_factor(
    sun_elevation_deg: FloatArray, radius_deg: float = SUN_NOMINAL_ANGULAR_RADIUS_DEG
) -> SunFactor:
    """Disc fraction above the 0° smooth-sphere horizon. Exact where the Sun is known."""
    el = np.asarray(sun_elevation_deg, dtype=float)
    missing = np.isnan(el)
    f = disc_fraction(np.where(missing, 0.0, el), radius_deg)
    return SunFactor(
        lower=np.where(missing, 0.0, f),
        upper=np.where(missing, 1.0, f),
        ephemeris_missing=missing,
        state_unknown=missing.copy(),
        edge_uncertain=np.zeros(el.shape, dtype=bool),
    )


def terrain_sun_factor(
    sun_elevation_deg: FloatArray,
    terrain_horizon_deg: FloatArray,
    states: list[SunState],
    radius_deg: float = SUN_NOMINAL_ANGULAR_RADIUS_DEG,
) -> SunFactor:
    """Disc-fraction bounds against the terrain-aware three-valued state.

    * VISIBLE (engine: above the known horizon **and** complete ray coverage):
      ``f`` against the terrain horizon, lower = upper.
    * BLOCKED (engine: disc centre at or below a *known* obstacle): lower 0.
      The engine does not say whether the ray is completely covered, so a
      partial disc above the known horizon is only an upper bound.
    * UNKNOWN with a known horizon: lower 0; upper = ``f`` against the known
      horizon (unseen farther terrain can only raise the horizon).
    * UNKNOWN without any horizon value: lower 0; upper = ``f`` against the 0°
      sphere — an assumption (terrain not below the sphere horizon), not a
      measurement.
    * Missing ephemeris: lower 0, upper 1.
    """
    el = np.asarray(sun_elevation_deg, dtype=float)
    hz = np.asarray(terrain_horizon_deg, dtype=float)
    if el.shape != hz.shape or len(states) != el.size:
        raise ValueError("elevation, horizon and state series must match")
    visible = np.array([s is SunState.VISIBLE for s in states], dtype=bool)
    blocked = np.array([s is SunState.BLOCKED for s in states], dtype=bool)
    missing = np.isnan(el)
    has_hz = ~np.isnan(hz)

    safe_el = np.where(missing, 0.0, el)
    f_terrain = disc_fraction(safe_el - np.where(has_hz, hz, 0.0), radius_deg)
    f_sphere = disc_fraction(safe_el, radius_deg)
    f_best = np.where(has_hz, f_terrain, f_sphere)

    known_visible = visible & ~missing & has_hz
    lower = np.where(known_visible, f_terrain, 0.0)
    upper = np.where(missing, 1.0, f_best)
    upper = np.where(known_visible, f_terrain, upper)
    known_blocked = blocked & ~missing
    return SunFactor(
        lower=lower,
        upper=upper,
        ephemeris_missing=missing,
        state_unknown=~(known_visible | known_blocked),
        edge_uncertain=known_blocked & (upper > 0.0),
    )


class IndexStatus(str, Enum):
    DETERMINED = "DETERMINED"  # lower == upper
    RANGE = "RANGE"  # some samples undecided: only bounds are defensible
    UNAVAILABLE = "UNAVAILABLE"  # nothing known to build a quantity from


@dataclass(frozen=True, slots=True)
class IndexBounds:
    status: IndexStatus
    lower: float | None
    upper: float | None
    value: float | None
    """Only when ``lower == upper``; never a midpoint of a range."""
    window_hours: float
    known_hours: float
    unknown_hours: float
    edge_uncertain_hours: float
    unavailable_reason: str | None = None

    @property
    def unknown_fraction(self) -> float | None:
        return None if self.window_hours <= 0 else self.unknown_hours / self.window_hours


def integrate_index(
    factor: SunFactor, cos_theta: FloatArray, hold_hours: FloatArray
) -> IndexBounds:
    """Time-weighted bounds of ``f · cos θ`` over the window (sample-and-hold).

    UNKNOWN hours stay in the denominator: the index is always relative to the
    whole window, so an unknown hour can never raise the lower bound.
    """
    hours = np.asarray(hold_hours, dtype=float)
    cos = np.asarray(cos_theta, dtype=float)
    if hours.shape != cos.shape or hours.shape != factor.lower.shape:
        raise ValueError("series lengths must match")
    if np.any(hours < 0) or not np.all(np.isfinite(hours)):
        raise ValueError("hold_hours must be finite and non-negative")
    total = float(hours.sum())
    unknown_hours = float(hours[factor.state_unknown].sum())
    edge_hours = float(hours[factor.edge_uncertain].sum())
    known_hours = total - unknown_hours
    if total <= 0.0:
        return IndexBounds(
            IndexStatus.UNAVAILABLE, None, None, None, total, 0.0, 0.0, 0.0, "NO_DURATION"
        )
    if known_hours <= 0.0:
        reason = (
            "NO_EPHEMERIS"
            if bool(np.all(factor.ephemeris_missing[hours > 0]))
            else "NO_KNOWN_VISIBILITY"
        )
        return IndexBounds(
            IndexStatus.UNAVAILABLE, None, None, None, total, 0.0, unknown_hours, edge_hours, reason
        )
    # A sample with no usable Sun direction for this panel is bounded by [0, 1].
    cos_known = ~np.isnan(cos)
    lo = np.where(cos_known, factor.lower * np.where(cos_known, cos, 0.0), 0.0)
    hi = np.where(cos_known, factor.upper * np.where(cos_known, cos, 0.0), factor.upper)
    lower = float((lo * hours).sum() / total)
    upper = float((hi * hours).sum() / total)
    upper = max(upper, lower)
    determined = upper - lower <= DETERMINED_TOLERANCE
    return IndexBounds(
        status=IndexStatus.DETERMINED if determined else IndexStatus.RANGE,
        lower=lower,
        upper=upper,
        value=lower if determined else None,
        window_hours=total,
        known_hours=known_hours,
        unknown_hours=unknown_hours,
        edge_uncertain_hours=edge_hours,
    )


def optimise_fixed_azimuth(
    sun_azimuth_deg: FloatArray,
    sun_elevation_deg: FloatArray,
    hold_hours: FloatArray,
    tilt_deg: float,
    *,
    step_deg: float = 1.0,
) -> float | None:
    """Azimuth maximising the **geometric-horizon** index of a fixed panel.

    Hindsight over the analysed window, on a ``step_deg`` grid, lowest azimuth
    on ties. Uses only samples with a known Sun direction. Returns ``None``
    when no sample contributes (nothing to optimise against).
    """
    az = np.asarray(sun_azimuth_deg, dtype=float)
    el = np.asarray(sun_elevation_deg, dtype=float)
    hours = np.asarray(hold_hours, dtype=float)
    ok = ~np.isnan(az) & ~np.isnan(el) & (hours > 0)
    if not np.any(ok):
        return None
    weight = hours[ok] * disc_fraction(el[ok])
    if not np.any(weight > 0):
        return None
    az_r, el_r = np.radians(az[ok]), np.radians(el[ok])
    beta = np.radians(float(tilt_deg))
    grid = np.arange(0.0, 360.0, step_deg)
    cos = np.sin(el_r)[None, :] * np.cos(beta) + np.cos(el_r)[None, :] * np.sin(beta) * np.cos(
        az_r[None, :] - np.radians(grid)[:, None]
    )
    score = (np.clip(cos, 0.0, 1.0) * weight[None, :]).sum(axis=1)
    if float(score.max()) <= 0.0:
        return None
    # Round away float noise so exact ties resolve to the lowest azimuth.
    return float(grid[int(np.argmax(np.round(score, 12)))])


def compare_bounds(
    bounds: list[tuple[float, float] | None],
    *,
    minimum_gap: float = DETERMINED_TOLERANCE,
) -> int | None:
    """Index of the entry whose lower bound exceeds every other upper bound.

    ``None`` when any entry is unavailable, the ranges overlap, or the
    separation is no larger than ``minimum_gap``.  The gap lets callers
    avoid presenting numerically different but scientifically indistinguishable
    values as a site recommendation.
    """
    if minimum_gap < 0:
        raise ValueError("minimum_gap must be non-negative")
    if len(bounds) < 2 or any(b is None for b in bounds):
        return None
    known = [b for b in bounds if b is not None]
    for i, (lower, _upper) in enumerate(known):
        if all(
            lower > other[1] + minimum_gap
            for j, other in enumerate(known)
            if j != i
        ):
            return i
    return None
