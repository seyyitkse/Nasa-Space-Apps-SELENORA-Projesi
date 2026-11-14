"""SYNTHETIC_DEMO elevation model — clearly NOT real ephemeris data.

Purpose: let the UI and the deterministic visibility/scoring pipeline be
exercised end-to-end before the JPL Horizons pipeline lands (Phase 2).

Model (spherical, geometric horizon, anchored latitude phases):
* Sun: sub-solar latitude oscillates ±1.54° (lunar obliquity to the ecliptic)
  over ~346.6 d; sub-solar longitude sweeps 360° per synodic month (29.53 d).
* Earth: sub-Earth latitude oscillates ±6.7° (latitude libration, 27.21 d) and
  sub-Earth longitude ±7.9° (longitude libration, 27.55 d) about 0°E.
* Elevation of a body with sub-point (lat_b, lon_b) seen from (lat, lon):
  asin(sin(lat) sin(lat_b) + cos(lat) cos(lat_b) cos(lon - lon_b)).

Amplitudes/periods are textbook approximations. The latitude phases are
loosely anchored to two real JPL Horizons samples (Sun and Earth elevation at
89.68°S 166.0°W on 2026-12-01 00:00 UT, see tests/fixtures) so the demo is
plausible around Dec 2026; away from that date — and for longitude-dependent
effects — the model drifts from reality. It is NEVER a substitute for ephemeris.
"""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
from numpy.typing import NDArray

SYNODIC_DAYS = 29.530589
DRACONIC_DAYS = 27.212221
ANOMALISTIC_DAYS = 27.554550
SUN_LAT_PERIOD_DAYS = 346.62
SUN_LAT_AMPLITUDE = 1.54
EARTH_LAT_AMPLITUDE = 6.7
EARTH_LON_AMPLITUDE = 7.9
_EPOCH = datetime(2000, 1, 1, 12, tzinfo=UTC)
# Phase anchor (see module docstring): at 2026-12-01 00:00 UT the Horizons
# fixtures give Sun elev ≈ +1.49° (rising) and Earth elev ≈ -1.93° (falling)
# for a site at 89.68° S, i.e. sub-solar lat ≈ -1.49° (decreasing) and
# sub-Earth lat ≈ +1.93° (increasing).
_ANCHOR = datetime(2026, 12, 1, tzinfo=UTC)
_SUN_PHASE = np.pi + np.arcsin(1.49 / SUN_LAT_AMPLITUDE)
_EARTH_PHASE = float(np.arcsin(1.93 / EARTH_LAT_AMPLITUDE))


def _elevation(lat, lon, sub_lat, sub_lon) -> NDArray[np.float64]:  # type: ignore[no-untyped-def]
    lat, lon, sub_lat, sub_lon = (np.radians(x) for x in (lat, lon, sub_lat, sub_lon))
    s = np.sin(lat) * np.sin(sub_lat) + np.cos(lat) * np.cos(sub_lat) * np.cos(lon - sub_lon)
    return np.degrees(np.arcsin(np.clip(s, -1.0, 1.0)))


def time_grid(start: datetime, end: datetime, step_minutes: int) -> NDArray[np.datetime64]:
    start64 = np.datetime64(start.astimezone(UTC).replace(tzinfo=None), "m")
    end64 = np.datetime64(end.astimezone(UTC).replace(tzinfo=None), "m")
    return np.arange(start64, end64 + np.timedelta64(1, "m"), np.timedelta64(step_minutes, "m"))


def synthetic_elevations(
    latitude_deg: float, longitude_deg: float, times: NDArray[np.datetime64]
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    epoch64 = np.datetime64(_EPOCH.replace(tzinfo=None), "m")
    anchor64 = np.datetime64(_ANCHOR.replace(tzinfo=None), "m")
    days = (times - epoch64).astype("timedelta64[m]").astype(float) / 1440.0
    since_anchor = (times - anchor64).astype("timedelta64[m]").astype(float) / 1440.0

    sun_lat = SUN_LAT_AMPLITUDE * np.sin(2 * np.pi * since_anchor / SUN_LAT_PERIOD_DAYS + _SUN_PHASE)
    sun_lon = (180.0 - 360.0 * days / SYNODIC_DAYS) % 360.0
    earth_lat = EARTH_LAT_AMPLITUDE * np.sin(2 * np.pi * since_anchor / DRACONIC_DAYS + _EARTH_PHASE)
    earth_lon = EARTH_LON_AMPLITUDE * np.sin(2 * np.pi * days / ANOMALISTIC_DAYS)

    sun = _elevation(latitude_deg, longitude_deg, sun_lat, sun_lon)
    earth = _elevation(latitude_deg, longitude_deg, earth_lat, earth_lon)
    return sun, earth
