"""Local terrain horizon profiles from a LOLA DEM window.

Azimuths are **true geographic** (clockwise from local north), matching JPL
Horizons. Rays are cast in polar-stereographic metres after applying meridian
convergence (``true_north_grid_azimuth_deg``).

Coverage model (Phase 4.1)
--------------------------
* ``has_any_data`` — at least one valid DEM sample on the ray.
* ``complete_coverage`` — contiguous valid samples out to ``max_range_m``
  (DEM boundary / NoData truncate the ray → incomplete).
* Horizon elevation is the max elevation angle among **known** samples only.
* Incomplete rays must not be treated as clear sky beyond the last sample.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from app.science.lunar_projection import (
    MOON_RADIUS_M,
    normalize_azimuth_deg,
    stereo_offsets_for_true_azimuth,
    sphere_drop_m,
)

FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]
IntArray = NDArray[np.int_]


@dataclass(frozen=True, slots=True)
class HorizonLookup:
    horizon_elevation_deg: float
    has_any_data: bool
    complete_coverage: bool
    valid_range_m: float
    distance_to_blocker_m: float


@dataclass(frozen=True, slots=True)
class HorizonProfile:
    azimuth_deg: FloatArray  # true geographic azimuths
    horizon_elevation_deg: FloatArray
    has_any_data: BoolArray
    complete_coverage: BoolArray
    valid_range_m: FloatArray
    distance_to_blocker_m: FloatArray
    n_valid_samples: IntArray
    observer_x_m: float
    observer_y_m: float
    observer_z_m: float
    observer_height_m: float
    max_range_m: float
    true_north_grid_azimuth_deg: float
    any_data_fraction: float
    complete_coverage_fraction: float

    # Back-compat alias used by Phase 4 callers / caches.
    @property
    def coverage_ok(self) -> BoolArray:
        return self.has_any_data

    @property
    def coverage_fraction(self) -> float:
        """Fraction of azimuths with *complete* requested-range coverage."""
        return self.complete_coverage_fraction

    def elevation_at_azimuth(self, azimuth_deg: float) -> tuple[float, bool]:
        """Nearest-bin horizon elevation and has_any_data (legacy 2-tuple)."""
        lookup = self.lookup(azimuth_deg)
        return lookup.horizon_elevation_deg, lookup.has_any_data

    def lookup(self, azimuth_deg: float) -> HorizonLookup:
        az = normalize_azimuth_deg(azimuth_deg)
        idx = int(np.argmin(np.abs(((self.azimuth_deg - az + 180.0) % 360.0) - 180.0)))
        return HorizonLookup(
            horizon_elevation_deg=float(self.horizon_elevation_deg[idx]),
            has_any_data=bool(self.has_any_data[idx]),
            complete_coverage=bool(self.complete_coverage[idx]),
            valid_range_m=float(self.valid_range_m[idx]),
            distance_to_blocker_m=float(self.distance_to_blocker_m[idx]),
        )


def _sample_grid(
    dem: FloatArray,
    transform,  # rasterio.Affine
    xs: FloatArray,
    ys: FloatArray,
) -> FloatArray:
    """Nearest sampling via map→pixel; out-of-bounds → NaN."""
    inv = ~transform
    cols, rows = inv @ (xs, ys)
    h, w = dem.shape
    out = np.full(xs.shape, np.nan, dtype=float)
    c0 = np.rint(cols).astype(int)
    r0 = np.rint(rows).astype(int)
    inside = (c0 >= 0) & (c0 < w) & (r0 >= 0) & (r0 < h)
    if not np.any(inside):
        return out
    vals = dem[r0[inside], c0[inside]].astype(float)
    out[inside] = vals
    return out


def _contiguous_prefix_valid(valid: BoolArray) -> int:
    """Count leading True values (contiguous valid samples from the observer)."""
    if valid.size == 0:
        return 0
    miss = np.argmax(~valid)
    if valid[0] and miss == 0 and valid.all():
        return int(valid.size)
    if not valid[0]:
        return 0
    return int(miss)


def compute_horizon_profile(
    *,
    dem: FloatArray,
    transform,
    observer_x_m: float,
    observer_y_m: float,
    observer_z_m: float,
    true_north_grid_azimuth_deg: float,
    observer_height_m: float = 2.0,
    n_azimuth: int = 72,
    max_range_m: float = 12_000.0,
    range_step_m: float = 25.0,
    moon_radius_m: float = MOON_RADIUS_M,
) -> HorizonProfile:
    """Compute a 360° terrain horizon for one observer (true-north azimuths)."""
    if dem.ndim != 2:
        raise ValueError("dem must be 2-D")
    if n_azimuth < 4 or max_range_m <= 0 or range_step_m <= 0:
        raise ValueError("invalid horizon sampling parameters")

    gamma = normalize_azimuth_deg(true_north_grid_azimuth_deg)
    azimuths = np.linspace(0.0, 360.0, n_azimuth, endpoint=False)
    distances = np.arange(range_step_m, max_range_m + range_step_m * 0.5, range_step_m)
    eye_z = float(observer_z_m) + float(observer_height_m)
    complete_tol_m = range_step_m * 0.51

    horizon = np.full(n_azimuth, np.nan, dtype=float)
    has_any = np.zeros(n_azimuth, dtype=bool)
    complete = np.zeros(n_azimuth, dtype=bool)
    valid_range = np.zeros(n_azimuth, dtype=float)
    blocker_d = np.full(n_azimuth, np.nan, dtype=float)
    n_valid = np.zeros(n_azimuth, dtype=int)

    drops = np.array([sphere_drop_m(float(d), moon_radius_m) for d in distances], dtype=float)

    for i, az in enumerate(azimuths):
        xs = np.empty_like(distances)
        ys = np.empty_like(distances)
        for j, d in enumerate(distances):
            dx, dy = stereo_offsets_for_true_azimuth(float(az), float(d), gamma)
            xs[j] = observer_x_m + dx
            ys[j] = observer_y_m + dy
        z = _sample_grid(dem, transform, xs, ys)
        valid = ~np.isnan(z)
        prefix = _contiguous_prefix_valid(valid)
        n_valid[i] = prefix
        if prefix == 0:
            continue
        has_any[i] = True
        last_d = float(distances[prefix - 1])
        valid_range[i] = last_d
        complete[i] = last_d >= (max_range_m - complete_tol_m)

        z_known = z[:prefix]
        d_known = distances[:prefix]
        drop_known = drops[:prefix]
        rel = (z_known - eye_z) - drop_known
        elev = np.degrees(np.arctan2(rel, d_known))
        j = int(np.argmax(elev))
        horizon[i] = float(elev[j])
        blocker_d[i] = float(d_known[j])

    any_frac = float(has_any.mean()) if n_azimuth else 0.0
    complete_frac = float(complete.mean()) if n_azimuth else 0.0
    return HorizonProfile(
        azimuth_deg=azimuths,
        horizon_elevation_deg=horizon,
        has_any_data=has_any,
        complete_coverage=complete,
        valid_range_m=valid_range,
        distance_to_blocker_m=blocker_d,
        n_valid_samples=n_valid,
        observer_x_m=float(observer_x_m),
        observer_y_m=float(observer_y_m),
        observer_z_m=float(observer_z_m),
        observer_height_m=float(observer_height_m),
        max_range_m=float(max_range_m),
        true_north_grid_azimuth_deg=gamma,
        any_data_fraction=any_frac,
        complete_coverage_fraction=complete_frac,
    )
