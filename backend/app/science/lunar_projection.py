"""Lunar coordinate helpers for LOLA south-polar stereographic DEMs.

PGDA Site01/Site04 GeoTIFFs use a spherical Moon (a=b=1737.4 km) with south
polar stereographic projection (lat_0=-90, lon_0=0), MOON_ME / DE421 product
frame. SELENORA stores lon/lat east-positive in the same spherical lon/lat
convention used for Horizons ``SITE_COORD`` (GEODETIC on the sphere).

We do **not** apply a DE421↔DE441 surface shift in Phase 4: residual frame
mismatch is treated as a documented scientific limitation (metre-scale for
local horizon work at ~10–20 km) rather than silently "corrected".

Azimuth note (Phase 4.1)
------------------------
Horizons azimuth is clockwise from **local geographic north**. In this CRS,
grid north (+Y) is **not** geographic north except on the lon_0=0 meridian.
The grid azimuth of true north equals ``longitude_deg % 360`` (verified by
finite-difference lon/lat→stereo and against PyProj; ``Proj.get_factors``
meridian_convergence is **not** trustworthy for this custom sphere CRS).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import CRS, Transformer

MOON_RADIUS_M = 1_737_400.0

# Explicit PROJ strings — match the GeoTIFF CRS spheroid (1737400, 0).
MOON_LONLAT = CRS.from_proj4(
    f"+proj=lonlat +a={MOON_RADIUS_M} +b={MOON_RADIUS_M} +no_defs"
)
MOON_POLAR_STEREO_S = CRS.from_proj4(
    f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 "
    f"+a={MOON_RADIUS_M} +b={MOON_RADIUS_M} +units=m +no_defs"
)


@dataclass(frozen=True, slots=True)
class StereoPoint:
    x_m: float
    y_m: float


_TO_STEREO = Transformer.from_crs(MOON_LONLAT, MOON_POLAR_STEREO_S, always_xy=True)
_TO_LONLAT = Transformer.from_crs(MOON_POLAR_STEREO_S, MOON_LONLAT, always_xy=True)


def lonlat_to_stereo(longitude_deg: float, latitude_deg: float) -> StereoPoint:
    """East-positive longitude (deg), latitude (deg) → polar stereographic metres."""
    x, y = _TO_STEREO.transform(longitude_deg, latitude_deg)
    return StereoPoint(float(x), float(y))


def stereo_to_lonlat(x_m: float, y_m: float) -> tuple[float, float]:
    """Polar stereographic metres → (longitude_deg east-positive, latitude_deg)."""
    lon, lat = _TO_LONLAT.transform(x_m, y_m)
    return float(lon), float(lat)


def great_circle_arc_m(ground_range_m: float, radius_m: float = MOON_RADIUS_M) -> float:
    """Central angle (radians) for a surface arc of length ``ground_range_m``."""
    return float(ground_range_m) / float(radius_m)


def sphere_drop_m(ground_range_m: float, radius_m: float = MOON_RADIUS_M) -> float:
    """Height drop of the sphere below the local tangent plane at range ``d``.

    ``drop = R (1 - cos(d/R))``. For d ≪ R this is ≈ d²/(2R).
    """
    theta = great_circle_arc_m(ground_range_m, radius_m)
    return float(radius_m * (1.0 - math.cos(theta)))


def normalize_azimuth_deg(azimuth_deg: float) -> float:
    return float(azimuth_deg) % 360.0


def true_north_grid_azimuth_deg(
    longitude_deg: float,
    latitude_deg: float,
    *,
    dlat_deg: float = 1e-5,
) -> float:
    """Grid azimuth (clockwise from +Y) of local geographic north.

    Computed by projecting the site and a point slightly farther from the south
    pole along the same meridian, then taking ``atan2(Δx, Δy)``.

    For this south-polar stereographic CRS (``lon_0=0``), the result equals
    ``longitude_deg % 360`` to numerical precision; the finite-difference form
    is retained as the definition so tests catch CRS changes.
    """
    if not (-90.0 < latitude_deg <= 90.0):
        raise ValueError("latitude must be in (-90, 90] for a local north vector")
    # Stay on the southern hemisphere step when near the equator edge case.
    step = abs(float(dlat_deg))
    lat1 = min(latitude_deg + step, 90.0)
    if lat1 <= latitude_deg:
        lat1 = latitude_deg - step  # northern-hemisphere fallback (unused for SP sites)
    p0 = lonlat_to_stereo(longitude_deg, latitude_deg)
    p1 = lonlat_to_stereo(longitude_deg, lat1)
    dx = p1.x_m - p0.x_m
    dy = p1.y_m - p0.y_m
    if abs(dx) < 1e-12 and abs(dy) < 1e-12:
        raise ValueError("degenerate north vector")
    return normalize_azimuth_deg(math.degrees(math.atan2(dx, dy)))


def grid_bearing_for_true_azimuth(
    true_azimuth_deg: float,
    true_north_grid_azimuth_deg: float,
) -> float:
    """Convert Horizons/geographic azimuth → clockwise-from-+Y grid bearing."""
    return normalize_azimuth_deg(true_azimuth_deg + true_north_grid_azimuth_deg)


def stereo_offsets_for_true_azimuth(
    true_azimuth_deg: float,
    distance_m: float,
    true_north_grid_azimuth_deg: float,
) -> tuple[float, float]:
    """Δx, Δy in stereo metres for a ground range at a true (geographic) azimuth."""
    bearing = grid_bearing_for_true_azimuth(true_azimuth_deg, true_north_grid_azimuth_deg)
    rad = math.radians(bearing)
    return distance_m * math.sin(rad), distance_m * math.cos(rad)
