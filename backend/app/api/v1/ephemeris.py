"""Observer Sun/Earth Az/El series for Explorer / horizon simulator (Phase 5B)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import horizons_client
from app.core.errors import AppError
from app.integrations.nasa.horizons import HorizonsClient, HorizonsError
from app.schemas.common import ApiModel
from app.science.horizon_profile import HorizonProfile
from app.science.terrain_visibility import body_vs_terrain
from app.services import terrain_data_service

router = APIRouter(prefix="/ephemeris", tags=["ephemeris"])

MAX_SPAN_HOURS = 72
MIN_STEP_MINUTES = 30


class SeriesPoint(ApiModel):
    t: datetime
    sun_azimuth_deg: float | None
    sun_elevation_deg: float | None
    earth_azimuth_deg: float | None
    earth_elevation_deg: float | None
    sun_state: str | None = None
    earth_state: str | None = None
    sun_terrain_horizon_deg: float | None = None
    earth_terrain_horizon_deg: float | None = None


class ObserverSeriesResponse(ApiModel):
    latitude_deg: float
    longitude_deg: float
    start_utc: datetime
    end_utc: datetime
    step_minutes: int
    horizon_mode: str
    data_quality: str
    true_north_grid_azimuth_deg: float | None
    terrain_complete_coverage_fraction: float | None
    attribution: list[str]
    limitations: list[str]
    points: list[SeriesPoint]


class SeriesLimitError(AppError):
    status_code = 422
    code = "SERIES_LIMIT"


def _require_tz(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise SeriesLimitError("Timestamps must be timezone-aware (UTC).")
    return dt.astimezone(UTC)


@router.get(
    "/observer-series",
    response_model=ObserverSeriesResponse,
    summary="Sun/Earth Az/El time series (+ optional terrain states)",
)
async def observer_series(
    latitude_deg: Annotated[float, Query(ge=-90, le=90)],
    longitude_deg: Annotated[float, Query(ge=-180, le=180)],
    start_utc: Annotated[datetime, Query()],
    end_utc: Annotated[datetime, Query()],
    step_minutes: Annotated[int, Query(ge=MIN_STEP_MINUTES, le=360)] = 60,
    include_terrain_states: Annotated[bool, Query()] = True,
    client: HorizonsClient = Depends(horizons_client),
) -> ObserverSeriesResponse:
    """Live JPL Horizons observer table for one site.

    Terrain states use the Phase 4.1 VISIBLE/BLOCKED/UNKNOWN policy when local
    DEM coverage exists; otherwise geometric-only series is returned.
    """
    start = _require_tz(start_utc)
    end = _require_tz(end_utc)
    if end <= start:
        raise SeriesLimitError("end_utc must be after start_utc.")
    span_h = (end - start).total_seconds() / 3600.0
    if span_h > MAX_SPAN_HOURS:
        raise SeriesLimitError(f"Series span capped at {MAX_SPAN_HOURS} hours for API safety.")

    try:
        sun = await client.observer_ephemeris(
            target="SUN",
            latitude_deg=latitude_deg,
            longitude_deg=longitude_deg,
            start_utc=start,
            stop_utc=end,
            step_minutes=step_minutes,
        )
        earth = await client.observer_ephemeris(
            target="EARTH",
            latitude_deg=latitude_deg,
            longitude_deg=longitude_deg,
            start_utc=start,
            stop_utc=end,
            step_minutes=step_minutes,
        )
    except HorizonsError:
        raise

    sun_map = {s.time_utc.astimezone(UTC): s for s in sun.samples}
    earth_map = {s.time_utc.astimezone(UTC): s for s in earth.samples}
    times = sorted(set(sun_map) | set(earth_map))

    profile: HorizonProfile | None = None
    gamma = None
    complete_frac = None
    quality = "EPHEMERIS_GEOMETRIC"
    horizon_mode = "GEOMETRIC"
    limitations = [
        "Series from NASA/JPL Horizons QUANTITIES=4 at lunar GEODETIC sites.",
        "Sun centre only (~0.27° disc radius not modelled).",
    ]
    attribution = ["NASA/JPL Horizons"]

    if include_terrain_states:
        try:
            profile, _, meta = terrain_data_service.get_horizon_profile(
                latitude_deg, longitude_deg
            )
            gamma = float(meta["true_north_grid_azimuth_deg"])
            complete_frac = float(profile.complete_coverage_fraction)
            horizon_mode = "TERRAIN"
            quality = (
                "EPHEMERIS_TERRAIN"
                if complete_frac >= 0.99
                else "LOCAL_TERRAIN_PARTIAL"
            )
            attribution.append(terrain_data_service.DATASET_CITATION)
            limitations.append(
                "Terrain states use Phase 4.1 true-north rays and VISIBLE/BLOCKED/UNKNOWN."
            )
            if quality == "LOCAL_TERRAIN_PARTIAL":
                limitations.append(
                    "DEM does not complete the requested horizon range in all azimuths; "
                    "UNKNOWN intervals are expected."
                )
        except FileNotFoundError:
            limitations.append(
                "No local LOLA tile covers this site — terrain states omitted."
            )

    points: list[SeriesPoint] = []
    if profile is not None and times:
        import numpy as np

        sun_az = np.array(
            [sun_map[t].azimuth_deg if t in sun_map else np.nan for t in times], dtype=float
        )
        sun_el = np.array(
            [sun_map[t].elevation_deg if t in sun_map else np.nan for t in times], dtype=float
        )
        earth_az = np.array(
            [earth_map[t].azimuth_deg if t in earth_map else np.nan for t in times], dtype=float
        )
        earth_el = np.array(
            [earth_map[t].elevation_deg if t in earth_map else np.nan for t in times], dtype=float
        )
        sun_t = body_vs_terrain(sun_az, sun_el, profile)
        earth_t = body_vs_terrain(earth_az, earth_el, profile)
        for i, t in enumerate(times):
            points.append(
                SeriesPoint(
                    t=t,
                    sun_azimuth_deg=None if t not in sun_map else sun_map[t].azimuth_deg,
                    sun_elevation_deg=None if t not in sun_map else sun_map[t].elevation_deg,
                    earth_azimuth_deg=None if t not in earth_map else earth_map[t].azimuth_deg,
                    earth_elevation_deg=None if t not in earth_map else earth_map[t].elevation_deg,
                    sun_state=str(sun_t.states[i].value) if sun_t.states[i] else None,
                    earth_state=str(earth_t.states[i].value) if earth_t.states[i] else None,
                    sun_terrain_horizon_deg=(
                        None
                        if np.isnan(sun_t.terrain_horizon_deg[i])
                        else float(sun_t.terrain_horizon_deg[i])
                    ),
                    earth_terrain_horizon_deg=(
                        None
                        if np.isnan(earth_t.terrain_horizon_deg[i])
                        else float(earth_t.terrain_horizon_deg[i])
                    ),
                )
            )
    else:
        for t in times:
            points.append(
                SeriesPoint(
                    t=t,
                    sun_azimuth_deg=None if t not in sun_map else sun_map[t].azimuth_deg,
                    sun_elevation_deg=None if t not in sun_map else sun_map[t].elevation_deg,
                    earth_azimuth_deg=None if t not in earth_map else earth_map[t].azimuth_deg,
                    earth_elevation_deg=None if t not in earth_map else earth_map[t].elevation_deg,
                )
            )

    return ObserverSeriesResponse(
        latitude_deg=latitude_deg,
        longitude_deg=longitude_deg,
        start_utc=start,
        end_utc=end,
        step_minutes=step_minutes,
        horizon_mode=horizon_mode,
        data_quality=quality,
        true_north_grid_azimuth_deg=gamma,
        terrain_complete_coverage_fraction=complete_frac,
        attribution=attribution,
        limitations=limitations,
        points=points,
    )
