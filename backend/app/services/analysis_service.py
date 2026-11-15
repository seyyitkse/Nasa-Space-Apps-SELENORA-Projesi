"""Real ephemeris analysis orchestration (JPL Horizons → visibility → scoring).

Scientific computation is deterministic. AI is never involved here.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import ALGORITHM_VERSION, TERRAIN_ALGORITHM_VERSION
from app.core.errors import NotImplementedYetError, TerrainUnavailableError
from app.integrations.nasa.horizons import (
    EphemerisResult,
    EphemerisSample,
    HorizonsClient,
    HorizonsError,
    TargetBody,
)
from app.models.analysis import (
    AnalysisSite,
    CachedResult,
    DataProvenance,
    MissionAnalysis,
    VisibilityTimeline,
)
from app.schemas.analysis import (
    AnalysisCreate,
    AnalysisResult,
    AnalysisStatus,
    GeometricVsTerrain,
    Provenance,
    SiteResult,
    TerrainSiteMeta,
    TimelineResponse,
    VisibilityMetrics,
)
from app.science import scoring
from app.science import visibility as vis
from app.science.scoring import Contribution
from app.science.terrain_visibility import summarize_terrain_pair
from app.services import terrain_data_service
from app.services.cache_keys import analysis_cache_key
from app.services.result_builder import (
    apply_ranks,
    build_site_result,
    build_site_timeline,
    contributions_to_schema,
    intervals_from_times,
    timeline_stride,
)

logger = logging.getLogger("selenora.analysis")

# Cache-key contract for our observer Az/El query shape (not the live Horizons
# signature/ephemeris file — those are recorded in provenance after fetch).
DATA_SOURCE_CONTRACT = "horizons-observer-azel-v1"
DATA_SOURCE_CONTRACT_TERRAIN = "horizons-observer-azel-v1+lola-5mpp-v2"
HORIZONS_CONCURRENCY = 4
MISSING_FRACTION_PARTIAL = 0.05
# Require DEM samples in most directions; complete 12 km coverage is audited
# separately and typically fails on 16×16 km Site01/04 tiles.
MIN_ANY_DATA_FRACTION = 0.80
COMPLETE_COVERAGE_FOR_FULL_TERRAIN = 0.99

GEOMETRIC_ASSUMPTIONS = [
    "Elevations are apparent azimuth/elevation from NASA/JPL Horizons "
    "(QUANTITIES=4) for a topocentric observer on the Moon (coord@301).",
    "Geometric (smooth-sphere) horizon at 0° elevation; LOLA terrain shadowing is not modelled.",
    "Airless observer — Horizons applies no atmospheric refraction.",
    "Sun visibility is evaluated at the solar disc centre (~0.27° angular radius not modelled).",
    "Earth above the geometric horizon is Direct-to-Earth visibility *potential* only — "
    "not a link budget, antenna mask, or DSN schedule.",
    "Durations use sample-and-hold over [start_utc, end_utc): each sample at t "
    "covers min(step, end - t); a Horizons STOP sample exactly at end contributes 0 h.",
    "Visibility percentages are time-weighted over samples with both Sun and Earth data.",
]

GEOMETRIC_LIMITATIONS = [
    "Results are NOT a NASA-endorsed landing-safety or flight-operations score.",
    "Without LOLA topography, local ridges can hide the Sun or Earth even when "
    "geometric elevation is positive.",
    "Hourly or multi-hour samples are coarse estimates (±1 step); not second-precision event times.",
    "Ties in score produce no single recommendation.",
    "Partial ephemeris coverage downgrades data quality and refuses ranking when "
    f"missing samples exceed {MISSING_FRACTION_PARTIAL:.0%}.",
    "Missing ephemeris samples are excluded from duration/percentage denominators "
    "(neither counted as visible nor invisible).",
]

# Analyses computed before the [start, end) duration clamp must not be treated as current.
DURATION_SEMANTICS_SINCE = "0.3.1-phase3.3"


def analysis_metrics_superseded(algorithm_version: str) -> bool:
    """True when stored metrics predate the current geometric or terrain engine.

    Geometric current: ``0.3.1-phase3.3``. Terrain current: ``0.4.2-phase6c-science-h1``.
    Prior terrain builds (``0.4.0-phase4-terrain``, ``0.4.1-phase4.1-validation``)
    used a joint Sun/Earth denominator and could treat UNKNOWN as darkness —
    treat as superseded.
    """
    if algorithm_version == ALGORITHM_VERSION:
        return False
    if algorithm_version == TERRAIN_ALGORITHM_VERSION:
        return False
    return True


def _algo_for(req: AnalysisCreate) -> str:
    return TERRAIN_ALGORITHM_VERSION if req.horizon_model == "TERRAIN" else ALGORITHM_VERSION


def _cache_key_for(req: AnalysisCreate) -> str:
    return analysis_cache_key(
        sites=[(s.latitude_deg, s.longitude_deg) for s in req.sites],
        start_utc=req.start_utc,
        end_utc=req.end_utc,
        time_step_minutes=req.time_step_minutes,
        horizon_model=req.horizon_model,
        algorithm_version=_algo_for(req),
        data_source_version=(
            DATA_SOURCE_CONTRACT_TERRAIN
            if req.horizon_model == "TERRAIN"
            else DATA_SOURCE_CONTRACT
        ),
        weights=req.weights.model_dump(),
    )


def align_body_series(
    sun: list[EphemerisSample],
    earth: list[EphemerisSample],
) -> tuple[list[datetime], np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Align Sun/Earth samples on a shared UTC grid; missing → NaN (never silent zero)."""
    sun_map = {s.time_utc.astimezone(UTC): s for s in sun}
    earth_map = {s.time_utc.astimezone(UTC): s for s in earth}
    times = sorted(set(sun_map) | set(earth_map))
    if not times:
        raise HorizonsError("No overlapping ephemeris samples for Sun and Earth.")
    sun_el = np.array(
        [sun_map[t].elevation_deg if t in sun_map else np.nan for t in times], dtype=float
    )
    earth_el = np.array(
        [earth_map[t].elevation_deg if t in earth_map else np.nan for t in times], dtype=float
    )
    sun_az = np.array(
        [sun_map[t].azimuth_deg if t in sun_map else np.nan for t in times], dtype=float
    )
    earth_az = np.array(
        [earth_map[t].azimuth_deg if t in earth_map else np.nan for t in times], dtype=float
    )
    return times, sun_el, earth_el, sun_az, earth_az


async def _fetch_site_bodies(
    client: HorizonsClient,
    *,
    latitude_deg: float,
    longitude_deg: float,
    start_utc: datetime,
    end_utc: datetime,
    step_minutes: int,
    semaphore: asyncio.Semaphore,
) -> dict[TargetBody, EphemerisResult]:
    async def one(target: TargetBody) -> tuple[TargetBody, EphemerisResult]:
        async with semaphore:
            result = await client.observer_ephemeris(
                target=target,
                latitude_deg=latitude_deg,
                longitude_deg=longitude_deg,
                start_utc=start_utc,
                stop_utc=end_utc,
                step_minutes=step_minutes,
            )
            return target, result

    pairs = await asyncio.gather(one("SUN"), one("EARTH"))
    return dict(pairs)


def _quality_for_missing(missing_fraction: float, horizon_model: str) -> str:
    if missing_fraction > MISSING_FRACTION_PARTIAL:
        return "PARTIAL"
    if horizon_model == "GEOMETRIC":
        return "EPHEMERIS_GEOMETRIC"
    return "EPHEMERIS_TERRAIN"


def _terrain_data_quality(
    *,
    ephemeris_missing: float,
    complete_coverage_fraction: float,
) -> str:
    """Map DEM completeness to an honest quality label."""
    if ephemeris_missing > MISSING_FRACTION_PARTIAL:
        return "PARTIAL"
    if complete_coverage_fraction >= COMPLETE_COVERAGE_FOR_FULL_TERRAIN:
        return "EPHEMERIS_TERRAIN"
    return "LOCAL_TERRAIN_PARTIAL"


def compute_from_ephemerides(
    req: AnalysisCreate,
    analysis_id: str,
    site_ephems: list[dict[TargetBody, EphemerisResult]],
    *,
    created_at: datetime | None = None,
) -> tuple[AnalysisResult, TimelineResponse, list[dict[str, Any]]]:
    """Pure computation over already-fetched ephemerides (unit-testable without network)."""
    step = req.time_step_minutes
    weights = req.weights.model_dump()
    now = created_at or datetime.now(UTC)

    site_results = []
    scores: list[float | None] = []
    timeline_sites = []
    persist_rows: list[dict[str, Any]] = []
    max_missing = 0.0
    api_versions: set[str] = set()
    retrieved_ats: list[datetime] = []
    site_qualities: list[str] = []

    # Determine preliminary quality; may downgrade to PARTIAL per-site then globally.
    for site, bodies in zip(req.sites, site_ephems, strict=True):
        times, sun_el, earth_el, sun_az, earth_az = align_body_series(
            bodies["SUN"].samples, bodies["EARTH"].samples
        )
        missing = float((np.isnan(sun_el) | np.isnan(earth_el)).mean()) if len(times) else 1.0
        max_missing = max(max_missing, missing)
        for body in bodies.values():
            if body.api_version:
                api_versions.add(body.api_version)
            retrieved_ats.append(body.retrieved_at)

        site_quality = _quality_for_missing(missing, req.horizon_model)
        terrain_meta: dict[str, Any] | None = None
        if req.horizon_model == "TERRAIN":
            try:
                profile, _cov, tmeta = terrain_data_service.get_horizon_profile(
                    site.latitude_deg, site.longitude_deg
                )
            except FileNotFoundError as exc:
                raise TerrainUnavailableError(
                    str(exc),
                    details={
                        "site": site.label,
                        "latitude_deg": site.latitude_deg,
                        "longitude_deg": site.longitude_deg,
                        "hint": "Use horizon_model=GEOMETRIC or provide covering LOLA DEM tiles.",
                    },
                ) from exc
            if profile.any_data_fraction < MIN_ANY_DATA_FRACTION:
                raise TerrainUnavailableError(
                    f"Terrain any-data fraction {profile.any_data_fraction:.0%} "
                    f"below minimum {MIN_ANY_DATA_FRACTION:.0%} for site '{site.label}'.",
                    details={
                        "site": site.label,
                        "any_data_fraction": profile.any_data_fraction,
                        "complete_coverage_fraction": profile.complete_coverage_fraction,
                    },
                )
            summary, sun_vis, earth_vis, joint, sun_blocked, earth_blocked, vmeta = (
                summarize_terrain_pair(
                    sun_az,
                    sun_el,
                    earth_az,
                    earth_el,
                    profile,
                    step,
                    times=times,
                    analysis_end_utc=req.end_utc,
                )
            )
            terrain_meta = {**tmeta, **vmeta}
            # Ephemeris gaps drive PARTIAL; terrain UNKNOWN is reported separately and
            # must not be conflated with missing Horizons samples.
            max_missing = max(max_missing, missing)
            site_quality = _terrain_data_quality(
                ephemeris_missing=missing,
                complete_coverage_fraction=profile.complete_coverage_fraction,
            )
            metrics = summary.as_metrics()
            # Partial DEM coverage / unavailable percentages: refuse ranking.
            scorable = scoring.is_scorable(site_quality, missing) and scoring.metrics_are_scorable(
                metrics
            )
            score = None
            contribs: list[Contribution] = []
            if scorable:
                score, contribs = scoring.score_site(metrics, weights)
            # Geometric twin for side-by-side comparison (same ephemeris, 0° sphere).
            geo_summary, _, _, _ = vis.summarize(
                sun_el,
                earth_el,
                step,
                times=times,
                analysis_end_utc=req.end_utc,
            )
            geo_metrics = VisibilityMetrics(**geo_summary.as_metrics())
            terrain_metrics = VisibilityMetrics(**metrics)

            def _pct_delta(a: float | None, b: float | None) -> float | None:
                if a is None or b is None:
                    return None
                return a - b

            # Darkness / gaps: BLOCKED only (UNKNOWN never counted as darkness).
            site_result = SiteResult(
                label=site.label,
                latitude_deg=site.latitude_deg,
                longitude_deg=site.longitude_deg,
                landing_site_id=site.landing_site_id,
                metrics=terrain_metrics,
                score=score,
                rank=None,
                contributions=contributions_to_schema(contribs),
                darkness_windows=intervals_from_times(
                    times, sun_blocked, step, True, analysis_end_utc=req.end_utc
                ),
                communication_gaps=intervals_from_times(
                    times, earth_blocked, step, True, analysis_end_utc=req.end_utc
                ),
                joint_windows=intervals_from_times(
                    times, joint, step, True, analysis_end_utc=req.end_utc
                ),
                terrain=TerrainSiteMeta(
                    dem_file=tmeta.get("dem_file"),
                    dem_site_id=tmeta.get("dem_site_id"),
                    resolution_m=tmeta.get("resolution_m"),
                    horizon_coverage_fraction=float(profile.complete_coverage_fraction),
                    any_data_fraction=float(profile.any_data_fraction),
                    complete_coverage_fraction=float(profile.complete_coverage_fraction),
                    median_valid_range_m=vmeta.get("median_valid_range_m"),
                    min_valid_range_m=vmeta.get("min_valid_range_m"),
                    max_range_m=float(profile.max_range_m),
                    true_north_grid_azimuth_deg=float(profile.true_north_grid_azimuth_deg),
                    observer_height_m=float(profile.observer_height_m),
                    surface_z_m=tmeta.get("surface_z_m"),
                    dataset_version=tmeta.get("dataset_version"),
                    sun_unknown_fraction=vmeta.get("sun_unknown_fraction"),
                    earth_unknown_fraction=vmeta.get("earth_unknown_fraction"),
                    unknown_hours=vmeta.get("unknown_hours"),
                    known_sample_fraction=vmeta.get("known_sample_fraction"),
                ),
                geometric_comparison=GeometricVsTerrain(
                    geometric=geo_metrics,
                    longest_darkness_hours_delta=(
                        terrain_metrics.longest_darkness_hours - geo_metrics.longest_darkness_hours
                    ),
                    longest_communication_gap_hours_delta=(
                        terrain_metrics.longest_communication_gap_hours
                        - geo_metrics.longest_communication_gap_hours
                    ),
                    sun_visibility_pct_delta=_pct_delta(
                        terrain_metrics.sun_visibility_pct, geo_metrics.sun_visibility_pct
                    ),
                    earth_visibility_pct_delta=_pct_delta(
                        terrain_metrics.earth_visibility_pct, geo_metrics.earth_visibility_pct
                    ),
                    joint_visibility_pct_delta=_pct_delta(
                        terrain_metrics.joint_visibility_pct, geo_metrics.joint_visibility_pct
                    ),
                ),
            )
        else:
            site_result, score, _sun_vis, _earth_vis, _joint = build_site_result(
                label=site.label,
                latitude_deg=site.latitude_deg,
                longitude_deg=site.longitude_deg,
                landing_site_id=site.landing_site_id,
                times=times,
                sun_elevation=sun_el,
                earth_elevation=earth_el,
                step_minutes=step,
                weights=weights,
                data_quality=site_quality,
                analysis_end_utc=req.end_utc,
            )
        site_qualities.append(site_quality)
        site_results.append(site_result)
        scores.append(score)
        stride = timeline_stride(len(times))
        timeline_sites.append(
            build_site_timeline(site.label, times, sun_el, earth_el, stride)
        )
        persist_rows.append(
            {
                "label": site.label,
                "latitude_deg": site.latitude_deg,
                "longitude_deg": site.longitude_deg,
                "landing_site_id": site.landing_site_id,
                "times": [t.isoformat() for t in times],
                "sun_az": [None if np.isnan(v) else float(v) for v in sun_az],
                "sun_el": [None if np.isnan(v) else float(v) for v in sun_el],
                "earth_az": [None if np.isnan(v) else float(v) for v in earth_az],
                "earth_el": [None if np.isnan(v) else float(v) for v in earth_el],
                "site_result": site_result,
                "terrain_meta": terrain_meta,
            }
        )

    if max_missing > MISSING_FRACTION_PARTIAL:
        data_quality = "PARTIAL"
    elif req.horizon_model == "TERRAIN":
        if any(q == "PARTIAL" for q in site_qualities):
            data_quality = "PARTIAL"
        elif any(q == "LOCAL_TERRAIN_PARTIAL" for q in site_qualities):
            data_quality = "LOCAL_TERRAIN_PARTIAL"
        else:
            data_quality = "EPHEMERIS_TERRAIN"
    else:
        data_quality = _quality_for_missing(max_missing, req.horizon_model)

    # Refuse ranking when quality is not scorable (PARTIAL / LOCAL_TERRAIN_PARTIAL).
    if data_quality not in scoring.SCORABLE_QUALITIES:
        for site_result in site_results:
            site_result.score = None
            site_result.rank = None
            site_result.contributions = []
        scores = [None] * len(scores)
        recommended = None
    else:
        recommended = apply_ranks(site_results, scores)

    version_note = ", ".join(sorted(api_versions)) if api_versions else "unreported"
    retrieved = max(retrieved_ats) if retrieved_ats else now
    provenance = [
        Provenance(
            source_id="jpl-horizons",
            description=(
                "NASA/JPL Horizons observer table (Sun COMMAND=10, Earth COMMAND=399) "
                f"at lunar GEODETIC sites (coord@301). API signature version(s): {version_note}. "
                "Frame/ephemeris identifiers are taken from the live response header when present."
            ),
            retrieved_at=retrieved,
            version=version_note if api_versions else None,
        )
    ]
    assumptions = list(GEOMETRIC_ASSUMPTIONS)
    limitations = list(GEOMETRIC_LIMITATIONS)
    algo = _algo_for(req)
    if req.horizon_model == "TERRAIN":
        assumptions = [
            "Sun/Earth Az/El from NASA/JPL Horizons QUANTITIES=4 at lunar GEODETIC sites (coord@301).",
            "Local horizon from NASA PGDA LOLA 5 m/pix polar stereographic DEMs (MOON_ME / DE421 sphere).",
            "Horizon rays use true geographic azimuth (Horizons convention) after meridian "
            "convergence into south-polar stereo (Phase 4.1).",
            "Observer eye height defaults to 2 m above the DEM surface; Sun centre (no disc radius).",
            "Lunar sphere curvature drop R(1-cos(d/R)) is applied along ground range.",
            "VISIBLE requires body above known terrain AND complete DEM coverage to the "
            "requested ray range; BLOCKED if known terrain occults; otherwise UNKNOWN.",
            "DE421 LOLA vs DE441 Horizons ephemeris labels are not fused with a surface shift.",
            "Durations use sample-and-hold over [start_utc, end_utc).",
        ]
        limitations = [
            "Results are NOT a NASA-endorsed landing-safety or flight-operations score.",
            "Site01/Site04 5 m tiles are ~16×16 km; a 12 km ray request cannot have complete "
            "coverage in all directions — expect LOCAL_TERRAIN_PARTIAL.",
            "UNKNOWN samples are excluded from visibility % denominators; percentages over the "
            "remaining known subset are comparative only, not a full-sky guarantee.",
            "Deterministic ranking is refused under LOCAL_TERRAIN_PARTIAL.",
            "Earth above the terrain horizon is Direct-to-Earth visibility potential only.",
            "Coarse ephemeris steps (±1 step) remain estimates — not second-precision events.",
            terrain_data_service.DATASET_CITATION,
        ]
        provenance.append(
            Provenance(
                source_id="lro-lola",
                description=terrain_data_service.DATASET_CITATION,
                retrieved_at=now,
                version=terrain_data_service.DATASET_VERSION,
            )
        )

    stride = timeline_stride(max((len(p["times"]) for p in persist_rows), default=1))
    result = AnalysisResult(
        id=analysis_id,
        mission_name=req.mission_name,
        status="COMPLETED",
        data_quality=data_quality,  # type: ignore[arg-type]
        algorithm_version=algo,
        start_utc=req.start_utc,
        end_utc=req.end_utc,
        time_step_minutes=step,
        horizon_model=req.horizon_model,
        weights=req.weights,
        sites=site_results,
        recommended_site_label=recommended,
        assumptions=assumptions,
        limitations=limitations,
        provenance=provenance,
        created_at=now,
    )
    timeline = TimelineResponse(
        analysis_id=analysis_id,
        data_quality=data_quality,  # type: ignore[arg-type]
        downsampled=stride > 1,
        step_minutes=step * stride,
        sites=timeline_sites,
    )
    return result, timeline, persist_rows


def _persist(
    session: Session,
    *,
    analysis_id: str,
    req: AnalysisCreate,
    cache_key: str,
    result: AnalysisResult,
    timeline: TimelineResponse,
    persist_rows: list[dict[str, Any]],
    status: str = "COMPLETED",
    error_message: str | None = None,
) -> MissionAnalysis:
    row = session.get(MissionAnalysis, analysis_id)
    if row is None:
        row = MissionAnalysis(
            id=analysis_id,
            mission_name=req.mission_name,
            status=status,
            start_utc=req.start_utc,
            end_utc=req.end_utc,
            time_step_minutes=req.time_step_minutes,
            horizon_model=req.horizon_model,
            weights=req.weights.model_dump(),
            data_quality=result.data_quality,
            algorithm_version=result.algorithm_version,
            cache_key=cache_key,
        )
        session.add(row)
    else:
        row.status = status
        row.data_quality = result.data_quality
        row.algorithm_version = result.algorithm_version
        row.error_message = error_message

    row.result_json = result.model_dump(mode="json")
    row.timeline_json = timeline.model_dump(mode="json")
    row.completed_at = datetime.now(UTC) if status == "COMPLETED" else None
    row.error_message = error_message

    # Replace child rows on re-run of same id (should not happen for new UUIDs).
    row.sites.clear()
    row.provenance.clear()
    session.flush()

    for item in persist_rows:
        site_row = AnalysisSite(
            analysis_id=analysis_id,
            label=item["label"],
            latitude_deg=item["latitude_deg"],
            longitude_deg=item["longitude_deg"],
            landing_site_id=item["landing_site_id"],
            metrics=item["site_result"].metrics.model_dump(),
            score=item["site_result"].score,
            rank=item["site_result"].rank,
            details={
                "contributions": [c.model_dump() for c in item["site_result"].contributions],
                "darkness_windows": [
                    w.model_dump(mode="json") for w in item["site_result"].darkness_windows
                ],
                "communication_gaps": [
                    w.model_dump(mode="json") for w in item["site_result"].communication_gaps
                ],
                "joint_windows": [
                    w.model_dump(mode="json") for w in item["site_result"].joint_windows
                ],
                "terrain": (
                    item["site_result"].terrain.model_dump()
                    if item["site_result"].terrain
                    else None
                ),
                "geometric_comparison": (
                    item["site_result"].geometric_comparison.model_dump()
                    if item["site_result"].geometric_comparison
                    else None
                ),
                "terrain_meta": item.get("terrain_meta"),
            },
        )
        session.add(site_row)
        session.flush()
        session.add(
            VisibilityTimeline(
                analysis_site_id=site_row.id,
                body="SUN",
                times_utc=item["times"],
                azimuth_deg=item["sun_az"],
                elevation_deg=item["sun_el"],
            )
        )
        session.add(
            VisibilityTimeline(
                analysis_site_id=site_row.id,
                body="EARTH",
                times_utc=item["times"],
                azimuth_deg=item["earth_az"],
                elevation_deg=item["earth_el"],
            )
        )

    for prov in result.provenance:
        session.add(
            DataProvenance(
                analysis_id=analysis_id,
                source_id=prov.source_id,
                source_version=prov.version,
                retrieved_at=prov.retrieved_at or datetime.now(UTC),
                request_summary={
                    "sites": len(req.sites),
                    "start_utc": req.start_utc.isoformat(),
                    "end_utc": req.end_utc.isoformat(),
                    "step_minutes": req.time_step_minutes,
                    "horizon_model": req.horizon_model,
                    "data_source_contract": (
                        DATA_SOURCE_CONTRACT_TERRAIN
                        if req.horizon_model == "TERRAIN"
                        else DATA_SOURCE_CONTRACT
                    ),
                    "algorithm_version": result.algorithm_version,
                },
            )
        )

    if status == "COMPLETED":
        session.merge(
            CachedResult(
                cache_key=cache_key,
                kind="analysis",
                payload={"analysis_id": analysis_id},
                created_at=datetime.now(UTC),
                expires_at=None,
            )
        )
    session.commit()
    session.refresh(row)
    return row


def find_cached_analysis(session: Session, cache_key: str) -> MissionAnalysis | None:
    cached = session.get(CachedResult, cache_key)
    if cached and cached.kind == "analysis":
        analysis_id = (cached.payload or {}).get("analysis_id")
        if analysis_id:
            row = session.get(MissionAnalysis, analysis_id)
            if row and row.status == "COMPLETED" and row.result_json:
                return row
    row = session.scalars(
        select(MissionAnalysis)
        .where(
            MissionAnalysis.cache_key == cache_key,
            MissionAnalysis.status == "COMPLETED",
        )
        .order_by(MissionAnalysis.created_at.desc())
    ).first()
    return row if row and row.result_json else None


def load_result(row: MissionAnalysis) -> AnalysisResult:
    if not row.result_json:
        raise NotImplementedYetError("Analysis result payload is missing.")
    result = AnalysisResult.model_validate(row.result_json)
    # Do not mutate the database row — surface a read-time warning for old metrics.
    if analysis_metrics_superseded(row.algorithm_version or result.algorithm_version):
        stored = row.algorithm_version or result.algorithm_version
        if stored.startswith("0.4."):
            note = (
                f"SUPERSEDED terrain metrics: stored algorithm_version={stored} predates "
                f"{TERRAIN_ALGORITHM_VERSION} (true-north convergence / coverage audit). "
                "Re-run TERRAIN analysis; do not treat prior terrain rankings as current."
            )
        else:
            note = (
                f"SUPERSEDED metrics: stored algorithm_version={stored} predates "
                f"{DURATION_SEMANTICS_SINCE}. Longest visibility/gap hours may exceed "
                "the analysis window; re-run the analysis for corrected durations."
            )
        if note not in result.limitations:
            result.limitations = [*result.limitations, note]
    return result


def load_timeline(row: MissionAnalysis) -> TimelineResponse:
    if not row.timeline_json:
        raise NotImplementedYetError("Analysis timeline payload is missing.")
    return TimelineResponse.model_validate(row.timeline_json)


async def create_analysis(
    session: Session,
    client: HorizonsClient,
    req: AnalysisCreate,
) -> AnalysisStatus:
    cache_key = _cache_key_for(req)
    existing = find_cached_analysis(session, cache_key)
    if existing is not None:
        logger.info("analysis_cache_hit", extra={"cache_key": cache_key[:16], "id": existing.id})
        return AnalysisStatus(
            id=existing.id,
            status="COMPLETED",  # type: ignore[arg-type]
            data_quality=existing.data_quality,  # type: ignore[arg-type]
        )

    analysis_id = str(uuid.uuid4())
    pending = MissionAnalysis(
        id=analysis_id,
        mission_name=req.mission_name,
        status="RUNNING",
        start_utc=req.start_utc,
        end_utc=req.end_utc,
        time_step_minutes=req.time_step_minutes,
        horizon_model=req.horizon_model,
        weights=req.weights.model_dump(),
        data_quality="UNAVAILABLE",
        algorithm_version=_algo_for(req),
        cache_key=cache_key,
    )
    session.add(pending)
    session.commit()

    semaphore = asyncio.Semaphore(HORIZONS_CONCURRENCY)
    try:
        site_ephems: list[dict[TargetBody, EphemerisResult]] = []
        # Bounded parallelism across sites; each site fetches Sun+Earth concurrently.
        async def site_job(site: Any) -> dict[TargetBody, EphemerisResult]:
            return await _fetch_site_bodies(
                client,
                latitude_deg=site.latitude_deg,
                longitude_deg=site.longitude_deg,
                start_utc=req.start_utc,
                end_utc=req.end_utc,
                step_minutes=req.time_step_minutes,
                semaphore=semaphore,
            )

        site_ephems = list(await asyncio.gather(*(site_job(s) for s in req.sites)))
        result, timeline, persist_rows = compute_from_ephemerides(
            req, analysis_id, site_ephems
        )
        _persist(
            session,
            analysis_id=analysis_id,
            req=req,
            cache_key=cache_key,
            result=result,
            timeline=timeline,
            persist_rows=persist_rows,
            status="COMPLETED",
        )
        return AnalysisStatus(
            id=analysis_id,
            status="COMPLETED",
            data_quality=result.data_quality,
        )
    except TerrainUnavailableError as exc:
        pending = session.get(MissionAnalysis, analysis_id)
        if pending is not None:
            pending.status = "FAILED"
            pending.data_quality = "UNAVAILABLE"
            pending.error_message = exc.message
            pending.completed_at = datetime.now(UTC)
            session.commit()
        raise
    except HorizonsError as exc:
        pending = session.get(MissionAnalysis, analysis_id)
        if pending is not None:
            pending.status = "FAILED"
            pending.data_quality = "UNAVAILABLE"
            pending.error_message = str(exc.message)
            pending.completed_at = datetime.now(UTC)
            session.commit()
        raise
    except Exception as exc:
        pending = session.get(MissionAnalysis, analysis_id)
        if pending is not None:
            pending.status = "FAILED"
            pending.data_quality = "UNAVAILABLE"
            pending.error_message = f"{type(exc).__name__}: {exc}"
            pending.completed_at = datetime.now(UTC)
            session.commit()
        raise
