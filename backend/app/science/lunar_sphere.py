"""Planetocentric lunar sphere helpers for 3D globe marker placement.

SELENORA stores site coordinates as:

* planetocentric latitude (deg, −90…+90)
* east-positive longitude (deg, stored −180…+180)

These match the LRO / LGCWG Mean-Earth / Polar Axis (MOON_ME) *spherical*
convention and the JPL Horizons ``SITE_COORD`` GEODETIC inputs used by the
Mission Planner. Conversion to Cartesian uses the right-handed ME body frame:

* +Z → mean north rotation pole (lat = +90°)
* +X → mean Earth / prime meridian (lon = 0°, lat = 0°)
* +Y → completes the right-handed triad (lon = +90° E, lat = 0°)

Reference sphere radius: 1 737 400 m (IAU/IAG / LRO white paper).

IMPORTANT — NASA SVS GLB mesh axes
----------------------------------
This module defines the *scientific* conversion for marker lon/lat. The
downloaded NASA SVS #14959 GLB asset may apply an authoring / glTF transform
on top of (or instead of) this ME frame. Claude MUST validate markers against
the inspected mesh (or document residual uncertainty) before asserting GLB
axis alignment. Do not treat these helpers as proof of SVS mesh orientation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.science.lunar_projection import MOON_RADIUS_M

SOUTH_POLAR_LAT_MAX_DEG = -80.0
"""Sites at or south of this latitude are classified south-polar for globe UX."""


@dataclass(frozen=True, slots=True)
class CartesianPoint:
    """Unitless position on/near the reference sphere (metres from COM)."""

    x_m: float
    y_m: float
    z_m: float

    @property
    def radius_m(self) -> float:
        return math.sqrt(self.x_m * self.x_m + self.y_m * self.y_m + self.z_m * self.z_m)


def normalize_longitude_deg(longitude_deg: float) -> float:
    """Normalize longitude to (−180, 180] degrees, east-positive.

    180° and −180° both represent the antimeridian; this helper returns +180
    for exact ±180 inputs (and for values that wrap to ±180).
    """
    lon = float(longitude_deg)
    # Map into (−180, 180]
    lon = ((lon + 180.0) % 360.0) - 180.0
    if lon == -180.0:
        return 180.0
    return lon


def clamp_latitude_deg(latitude_deg: float) -> float:
    """Clamp planetocentric latitude to [−90, 90]."""
    return max(-90.0, min(90.0, float(latitude_deg)))


def is_south_polar(latitude_deg: float, *, threshold_deg: float = SOUTH_POLAR_LAT_MAX_DEG) -> bool:
    """True when latitude is at or south of the south-polar UX threshold."""
    return float(latitude_deg) <= float(threshold_deg)


def lonlat_to_cartesian(
    longitude_deg: float,
    latitude_deg: float,
    *,
    radius_m: float = MOON_RADIUS_M,
    height_m: float = 0.0,
) -> CartesianPoint:
    """Convert planetocentric lon/lat to ME-frame Cartesian metres.

    ``height_m`` is radial height above the reference sphere (positive outward).
    Longitude is normalized before conversion.
    """
    if radius_m <= 0:
        raise ValueError("radius_m must be positive")
    lat = clamp_latitude_deg(latitude_deg)
    lon = normalize_longitude_deg(longitude_deg)
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    r = float(radius_m) + float(height_m)
    cos_lat = math.cos(lat_r)
    return CartesianPoint(
        x_m=r * cos_lat * math.cos(lon_r),
        y_m=r * cos_lat * math.sin(lon_r),
        z_m=r * math.sin(lat_r),
    )


def cartesian_to_lonlat(
    x_m: float,
    y_m: float,
    z_m: float,
) -> tuple[float, float, float]:
    """Inverse of :func:`lonlat_to_cartesian`.

    Returns ``(longitude_deg, latitude_deg, radius_m)`` with longitude in
    (−180, 180] and latitude in [−90, 90].
    """
    r = math.sqrt(float(x_m) ** 2 + float(y_m) ** 2 + float(z_m) ** 2)
    if r == 0.0:
        raise ValueError("null vector has undefined lon/lat")
    lat = math.degrees(math.asin(max(-1.0, min(1.0, float(z_m) / r))))
    lon = normalize_longitude_deg(math.degrees(math.atan2(float(y_m), float(x_m))))
    return lon, lat, r


def unit_normal(longitude_deg: float, latitude_deg: float) -> CartesianPoint:
    """Unit radial outward normal at lon/lat (ME frame)."""
    p = lonlat_to_cartesian(longitude_deg, latitude_deg, radius_m=1.0)
    return p
