"""Rebuild authoritative per-epoch states from stored analysis timelines (Phase 5E)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import numpy as np
from sqlalchemy.orm import Session, selectinload

from app.core.errors import NotFoundError, NotImplementedYetError
from app.models.analysis import AnalysisSite, MissionAnalysis, VisibilityTimeline
from app.schemas.epochs import (
    BodyState,
    EpochSample,
    EpochsProvenance,
    EpochsResponse,
    JointState,
    SiteEpochs,
)
from app.science.terrain_visibility import body_vs_terrain
from app.science.visibility import hold_hours_for_samples
from app.services import terrain_data_service

logger = logging.getLogger("selenora.epochs")


def _as_utc(value: datetime | str) -> datetime:
    if isinstance(value, str):
        raw = value.replace("Z", "+00:00")
        value = datetime.fromisoformat(raw)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _geometric_state(elevation_deg: float | None) -> BodyState:
    if elevation_deg is None or not np.isfinite(elevation_deg):
        return "UNKNOWN"
    return "VISIBLE" if elevation_deg > 0.0 else "BLOCKED"


def _joint(sun: BodyState, earth: BodyState) -> JointState:
    if sun == "UNKNOWN" or earth == "UNKNOWN":
        return "UNKNOWN"
    if sun == "VISIBLE" and earth == "VISIBLE":
        return "VISIBLE"
    return "NOT_VISIBLE"


def _series_from_timelines(
    timelines: list[VisibilityTimeline],
) -> tuple[list[datetime], np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    by_body = {t.body.upper(): t for t in timelines}
    sun = by_body.get("SUN")
    earth = by_body.get("EARTH")
    if sun is None or earth is None:
        raise NotImplementedYetError("Stored visibility timelines are incomplete (need SUN and EARTH).")
    times = [_as_utc(t) for t in sun.times_utc]
    if len(earth.times_utc) != len(times):
        raise NotImplementedYetError("SUN/EARTH timeline lengths differ; cannot build epochs.")
    sun_az = np.array([np.nan if v is None else float(v) for v in sun.azimuth_deg], dtype=float)
    sun_el = np.array([np.nan if v is None else float(v) for v in sun.elevation_deg], dtype=float)
    earth_az = np.array([np.nan if v is None else float(v) for v in earth.azimuth_deg], dtype=float)
    earth_el = np.array([np.nan if v is None else float(v) for v in earth.elevation_deg], dtype=float)
    return times, sun_az, sun_el, earth_az, earth_el


def _terrain_bundle(
    latitude_deg: float,
    longitude_deg: float,
    sun_az: np.ndarray,
    sun_el: np.ndarray,
    earth_az: np.ndarray,
    earth_el: np.ndarray,
) -> tuple[Any, Any, dict[str, Any] | None, list[str]]:
    limitations: list[str] = []
    try:
        profile, _cov, meta = terrain_data_service.get_horizon_profile(latitude_deg, longitude_deg)
    except FileNotFoundError as exc:
        limitations.append(f"No local LOLA DEM for terrain reclassification: {exc}")
        return None, None, None, limitations
    sun_t = body_vs_terrain(sun_az, sun_el, profile)
    earth_t = body_vs_terrain(earth_az, earth_el, profile)
    return sun_t, earth_t, meta, limitations


def _build_site_epochs(
    site: AnalysisSite,
    *,
    horizon_model: str,
    end_utc: datetime,
    step_minutes: int,
) -> tuple[SiteEpochs, list[str]]:
    times, sun_az, sun_el, earth_az, earth_el = _series_from_timelines(list(site.timelines))
    holds = hold_hours_for_samples(times, step_minutes, end_utc)
    limitations: list[str] = []
    sun_t = earth_t = meta = None
    if horizon_model == "TERRAIN":
        sun_t, earth_t, meta, limitations = _terrain_bundle(
            site.latitude_deg,
            site.longitude_deg,
            sun_az,
            sun_el,
            earth_az,
            earth_el,
        )

    samples: list[EpochSample] = []
    for i, t in enumerate(times):
        s_el = None if np.isnan(sun_el[i]) else float(sun_el[i])
        e_el = None if np.isnan(earth_el[i]) else float(earth_el[i])
        s_az = None if np.isnan(sun_az[i]) else float(sun_az[i])
        e_az = None if np.isnan(earth_az[i]) else float(earth_az[i])
        geo_sun = _geometric_state(s_el)
        geo_earth = _geometric_state(e_el)

        sun_horizon = earth_horizon = None
        if horizon_model == "TERRAIN" and sun_t is not None and earth_t is not None:
            sun_state = str(sun_t.states[i].value)  # type: ignore[union-attr]
            earth_state = str(earth_t.states[i].value)  # type: ignore[union-attr]
            if np.isfinite(sun_t.terrain_horizon_deg[i]):
                sun_horizon = float(sun_t.terrain_horizon_deg[i])
            if np.isfinite(earth_t.terrain_horizon_deg[i]):
                earth_horizon = float(earth_t.terrain_horizon_deg[i])
        elif horizon_model == "TERRAIN":
            # DEM missing — never invent clear sky.
            sun_state = "UNKNOWN"
            earth_state = "UNKNOWN"
        else:
            sun_state = geo_sun
            earth_state = geo_earth

        samples.append(
            EpochSample(
                t=t,
                sun_azimuth_deg=s_az,
                sun_elevation_deg=s_el,
                earth_azimuth_deg=e_az,
                earth_elevation_deg=e_el,
                sun_state=sun_state,  # type: ignore[arg-type]
                earth_state=earth_state,  # type: ignore[arg-type]
                joint_state=_joint(sun_state, earth_state),  # type: ignore[arg-type]
                sun_terrain_horizon_deg=sun_horizon,
                earth_terrain_horizon_deg=earth_horizon,
                sun_geometric_state=geo_sun,
                earth_geometric_state=geo_earth,
                hold_hours=float(holds[i]),
                contributes_duration=bool(holds[i] > 0.0),
            )
        )

    dem_site_id = None
    complete_frac = None
    gamma = None
    if meta is not None:
        dem_site_id = meta.get("dem_site_id")
        complete_frac = meta.get("complete_coverage_fraction")
        if complete_frac is None:
            complete_frac = meta.get("horizon_coverage_fraction")
        gamma = meta.get("true_north_grid_azimuth_deg")

    return (
        SiteEpochs(
            label=site.label,
            latitude_deg=site.latitude_deg,
            longitude_deg=site.longitude_deg,
            landing_site_id=site.landing_site_id,
            dem_site_id=dem_site_id,
            terrain_complete_coverage_fraction=(
                None if complete_frac is None else float(complete_frac)
            ),
            true_north_grid_azimuth_deg=None if gamma is None else float(gamma),
            samples=samples,
        ),
        limitations,
    )


def load_epochs(session: Session, analysis_id: str) -> EpochsResponse:
    analysis = session.get(
        MissionAnalysis,
        analysis_id,
        options=(selectinload(MissionAnalysis.sites).selectinload(AnalysisSite.timelines),),
    )
    if analysis is None:
        raise NotFoundError(f"Analysis '{analysis_id}' not found.")
    if analysis.status != "COMPLETED":
        raise NotFoundError(f"Epochs for analysis '{analysis_id}' are not available yet.")
    if not analysis.sites:
        raise NotImplementedYetError("Analysis has no persisted sites.")

    site_payloads: list[SiteEpochs] = []
    limitations: list[str] = [
        "States reconstructed from stored VisibilityTimeline Az/El (no new Horizons request).",
        "Duration uses sample-and-hold over [start_utc, end_utc); samples at/after end contribute 0 h.",
    ]
    if analysis.horizon_model == "TERRAIN":
        limitations.append(
            "VISIBLE requires body above known terrain AND complete DEM ray coverage; "
            "incomplete DEM coverage yields UNKNOWN (never inferred clear sky)."
        )
        limitations.append(
            "Terrain horizon angles are recomputed from the current local LOLA cache/engine; "
            "re-run the analysis if DEM tiles or algorithm_version changed."
        )
    else:
        limitations.append(
            "GEOMETRIC mode: VISIBLE iff elevation > 0° (smooth sphere); BLOCKED otherwise; "
            "UNKNOWN for missing samples."
        )

    for site in analysis.sites:
        if not site.timelines:
            raise NotImplementedYetError(
                f"Site '{site.label}' has no stored VisibilityTimeline rows."
            )
        payload, site_limits = _build_site_epochs(
            site,
            horizon_model=analysis.horizon_model,
            end_utc=_as_utc(analysis.end_utc),
            step_minutes=analysis.time_step_minutes,
        )
        site_payloads.append(payload)
        for note in site_limits:
            if note not in limitations:
                limitations.append(note)

    n = len(site_payloads[0].samples) if site_payloads else 0
    provenance = [
        EpochsProvenance(
            source_id="stored-visibility-timelines",
            description=(
                "Per-body Az/El arrays persisted at analysis time in visibility_timelines "
                "(SUN + EARTH)."
            ),
            version=analysis.algorithm_version,
        ),
        EpochsProvenance(
            source_id="jpl-horizons",
            description="Original Az/El source for the stored analysis (not re-fetched).",
            version=None,
        ),
    ]
    if analysis.horizon_model == "TERRAIN":
        provenance.append(
            EpochsProvenance(
                source_id="lro-lola",
                description=terrain_data_service.DATASET_CITATION,
                version=terrain_data_service.DATASET_VERSION,
            )
        )

    return EpochsResponse(
        analysis_id=analysis.id,
        mission_name=analysis.mission_name,
        horizon_model=analysis.horizon_model,  # type: ignore[arg-type]
        data_quality=analysis.data_quality,  # type: ignore[arg-type]
        algorithm_version=analysis.algorithm_version,
        start_utc=_as_utc(analysis.start_utc),
        end_utc=_as_utc(analysis.end_utc),
        time_step_minutes=analysis.time_step_minutes,
        sample_count_per_site=n,
        duration_semantics="[start_utc, end_utc)",
        sites=site_payloads,
        provenance=provenance,
        limitations=limitations,
    )
