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

from app.core.config import ALGORITHM_VERSION
from app.core.errors import NotImplementedYetError
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
    Provenance,
    TimelineResponse,
)
from app.services.cache_keys import analysis_cache_key
from app.services.result_builder import (
    apply_ranks,
    build_site_result,
    build_site_timeline,
    timeline_stride,
)

logger = logging.getLogger("selenora.analysis")

# Cache-key contract for our observer Az/El query shape (not the live Horizons
# signature/ephemeris file — those are recorded in provenance after fetch).
DATA_SOURCE_CONTRACT = "horizons-observer-azel-v1"
HORIZONS_CONCURRENCY = 4
MISSING_FRACTION_PARTIAL = 0.05

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
    """True when stored metrics may predate the Phase 3.3 duration clamp."""
    return algorithm_version != ALGORITHM_VERSION


def _cache_key_for(req: AnalysisCreate) -> str:
    return analysis_cache_key(
        sites=[(s.latitude_deg, s.longitude_deg) for s in req.sites],
        start_utc=req.start_utc,
        end_utc=req.end_utc,
        time_step_minutes=req.time_step_minutes,
        horizon_model=req.horizon_model,
        algorithm_version=ALGORITHM_VERSION,
        data_source_version=DATA_SOURCE_CONTRACT,
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
            }
        )

    data_quality = _quality_for_missing(max_missing, req.horizon_model)
    # Re-score if global quality is PARTIAL (refuse ranking).
    if data_quality == "PARTIAL":
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

    stride = timeline_stride(max((len(p["times"]) for p in persist_rows), default=1))
    result = AnalysisResult(
        id=analysis_id,
        mission_name=req.mission_name,
        status="COMPLETED",
        data_quality=data_quality,  # type: ignore[arg-type]
        algorithm_version=ALGORITHM_VERSION,
        start_utc=req.start_utc,
        end_utc=req.end_utc,
        time_step_minutes=step,
        horizon_model=req.horizon_model,
        weights=req.weights,
        sites=site_results,
        recommended_site_label=recommended,
        assumptions=list(GEOMETRIC_ASSUMPTIONS),
        limitations=list(GEOMETRIC_LIMITATIONS),
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
            algorithm_version=ALGORITHM_VERSION,
            cache_key=cache_key,
        )
        session.add(row)
    else:
        row.status = status
        row.data_quality = result.data_quality
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
                    "data_source_contract": DATA_SOURCE_CONTRACT,
                    "algorithm_version": ALGORITHM_VERSION,
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
        note = (
            f"SUPERSEDED metrics: stored algorithm_version="
            f"{row.algorithm_version or result.algorithm_version} predates "
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
    if req.horizon_model == "TERRAIN":
        raise NotImplementedYetError(
            "Terrain-horizon analyses require LOLA integration (Phase 4). "
            "Use horizon_model=GEOMETRIC for Phase 2 ephemeris analyses.",
            details={"horizon_model": req.horizon_model, "phase": 4},
        )

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
        algorithm_version=ALGORITHM_VERSION,
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
