"""Phase 7C orchestration for same-site, different-date comparisons."""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import ALGORITHM_VERSION, TERRAIN_ALGORITHM_VERSION
from app.core.errors import NotFoundError, TerrainUnavailableError
from app.integrations.nasa.horizons import HorizonsClient, HorizonsError
from app.models.analysis import ScenarioComparison
from app.schemas.analysis import DecisionWeights, SiteInput
from app.schemas.scenarios import (
    ScenarioComparisonCreate,
    ScenarioComparisonResult,
    ScenarioComparisonStatus,
    ScenarioEvidence,
    ScenarioWindowInput,
)
from app.science import scoring
from app.services import analysis_service

SCENARIO_CACHE_VERSION = "phase7c-scenarios-v1"


@dataclass(frozen=True, slots=True)
class _SingleSiteComputation:
    mission_name: str
    sites: list[SiteInput]
    start_utc: datetime
    end_utc: datetime
    time_step_minutes: int
    horizon_model: str
    weights: DecisionWeights


def _algorithm_version(body: ScenarioComparisonCreate) -> str:
    return (
        TERRAIN_ALGORITHM_VERSION
        if body.horizon_model == "TERRAIN"
        else ALGORITHM_VERSION
    )


def scenario_cache_key(body: ScenarioComparisonCreate) -> str:
    """Identity for all scientific and response metadata inputs.

    Dates are part of every scenario entry, so unchanged coordinates alone can
    never reuse ephemeris from a different mission window. H2 decision weights
    and the current H1 algorithm version are explicitly included.
    """

    canonical = {
        "version": SCENARIO_CACHE_VERSION,
        "name": body.name.strip(),
        "site": {
            "site_id": body.site.site_id,
            "label": body.site.label,
            "lat": round(body.site.latitude_deg, 6),
            "lon": round(body.site.longitude_deg, 6),
            "landing_site_id": body.site.landing_site_id,
        },
        "scenarios": [
            {
                "scenario_id": item.scenario_id,
                "label": item.label,
                "start": item.start_utc.astimezone(UTC).isoformat(),
                "end": item.end_utc.astimezone(UTC).isoformat(),
            }
            for item in body.scenarios
        ],
        "step": body.time_step_minutes,
        "horizon": body.horizon_model,
        "weights": {
            key: round(float(value), 6)
            for key, value in sorted(body.weights.model_dump().items())
        },
        "algorithm": _algorithm_version(body),
        "data_source": (
            analysis_service.DATA_SOURCE_CONTRACT_TERRAIN
            if body.horizon_model == "TERRAIN"
            else analysis_service.DATA_SOURCE_CONTRACT
        ),
    }
    blob = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(blob).hexdigest()


def _cached(session: Session, key: str) -> ScenarioComparison | None:
    return session.scalars(
        select(ScenarioComparison)
        .where(
            ScenarioComparison.cache_key == key,
            ScenarioComparison.status == "COMPLETED",
        )
        .order_by(ScenarioComparison.created_at.desc())
    ).first()


def _load_row(
    row: ScenarioComparison, cache_status: str = "STORED"
) -> ScenarioComparisonResult:
    if row.status != "COMPLETED" or not row.result_json:
        raise NotFoundError(
            f"Scenario comparison '{row.id}' is not available as a completed result."
        )
    result = ScenarioComparisonResult.model_validate(row.result_json)
    return result.model_copy(update={"cache_status": cache_status})  # type: ignore[arg-type]


def load_comparison(session: Session, comparison_id: str) -> ScenarioComparisonResult:
    row = session.get(ScenarioComparison, comparison_id)
    if row is None:
        raise NotFoundError(f"Scenario comparison '{comparison_id}' not found.")
    return _load_row(row)


def list_comparisons(session: Session) -> list[ScenarioComparisonStatus]:
    rows = session.scalars(
        select(ScenarioComparison).order_by(ScenarioComparison.created_at.desc())
    ).all()
    return [
        ScenarioComparisonStatus(
            id=row.id,
            name=row.name,
            status=row.status,  # type: ignore[arg-type]
            site_id=row.site_id,
            scenario_count=row.scenario_count,
            horizon_model=row.horizon_model,  # type: ignore[arg-type]
            created_at=row.created_at,
            error_message=row.error_message,
        )
        for row in rows
    ]


def _mark_failed(session: Session, row: ScenarioComparison, exc: Exception) -> None:
    row.status = "FAILED"
    row.error_message = f"{type(exc).__name__}: {exc}"
    row.completed_at = datetime.now(UTC)
    session.commit()


async def _compute_one(
    client: HorizonsClient,
    body: ScenarioComparisonCreate,
    item: ScenarioWindowInput,
    comparison_id: str,
    semaphore: asyncio.Semaphore,
) -> ScenarioEvidence:
    site = SiteInput(
        label=body.site.label,
        latitude_deg=body.site.latitude_deg,
        longitude_deg=body.site.longitude_deg,
        landing_site_id=body.site.landing_site_id,
    )
    request = _SingleSiteComputation(
        mission_name=f"{body.name} · {item.label}",
        sites=[site],
        start_utc=item.start_utc,
        end_utc=item.end_utc,
        time_step_minutes=body.time_step_minutes,
        horizon_model=body.horizon_model,
        weights=body.weights,
    )
    ephemerides = await analysis_service.fetch_site_ephemerides(
        client,
        latitude_deg=site.latitude_deg,
        longitude_deg=site.longitude_deg,
        start_utc=item.start_utc,
        end_utc=item.end_utc,
        step_minutes=body.time_step_minutes,
        semaphore=semaphore,
    )
    analysis, _timeline, _rows = analysis_service.compute_from_ephemerides(
        request,  # type: ignore[arg-type]
        f"{comparison_id}-{item.scenario_id}",
        [ephemerides],
    )
    return ScenarioEvidence(
        scenario_id=item.scenario_id,
        label=item.label,
        start_utc=item.start_utc,
        end_utc=item.end_utc,
        sample_count=item.sample_count(body.time_step_minutes),
        data_quality=analysis.data_quality,
        algorithm_version=analysis.algorithm_version,
        site=analysis.sites[0],
        assumptions=analysis.assumptions,
        limitations=analysis.limitations,
        provenance=analysis.provenance,
    )


def _rank_evidence(
    items: list[ScenarioEvidence],
) -> tuple[list[ScenarioEvidence], str | None, str]:
    scores = [item.site.score for item in items]
    all_scorable = all(
        score is not None and item.data_quality in scoring.SCORABLE_QUALITIES
        for item, score in zip(items, scores, strict=True)
    )
    ranks = scoring.rank(scores) if all_scorable else [None] * len(items)
    ranked = [
        item.model_copy(update={"site": item.site.model_copy(update={"rank": rank})})
        for item, rank in zip(items, ranks, strict=True)
    ]
    best = [item.scenario_id for item in ranked if item.site.rank == 1]
    recommended = best[0] if len(best) == 1 else None
    if not all_scorable:
        note = (
            "No recommendation: at least one scenario has incomplete or "
            "scientifically unscorable evidence. UNKNOWN was not treated as darkness."
        )
    elif recommended is None:
        note = "No single recommendation: the highest deterministic scores are tied."
    else:
        note = (
            "Deterministic planning recommendation from the configured visibility "
            "weights; not a NASA safety or landing recommendation."
        )
    return ranked, recommended, note


async def create_comparison(
    session: Session,
    client: HorizonsClient,
    body: ScenarioComparisonCreate,
) -> ScenarioComparisonResult:
    key = scenario_cache_key(body)
    cached = _cached(session, key)
    if cached is not None:
        return _load_row(cached, "HIT")

    comparison_id = str(uuid.uuid4())
    row = ScenarioComparison(
        id=comparison_id,
        name=body.name.strip(),
        status="RUNNING",
        site_id=body.site.site_id,
        site_label=body.site.label,
        latitude_deg=body.site.latitude_deg,
        longitude_deg=body.site.longitude_deg,
        landing_site_id=body.site.landing_site_id,
        time_step_minutes=body.time_step_minutes,
        horizon_model=body.horizon_model,
        weights=body.weights.model_dump(),
        scenario_count=len(body.scenarios),
        cache_key=key,
        request_json=body.model_dump(mode="json"),
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    semaphore = asyncio.Semaphore(analysis_service.HORIZONS_CONCURRENCY)
    try:
        evidence = list(
            await asyncio.gather(
                *(
                    _compute_one(client, body, item, comparison_id, semaphore)
                    for item in body.scenarios
                )
            )
        )
        ranked, recommended, note = _rank_evidence(evidence)
        result = ScenarioComparisonResult(
            id=comparison_id,
            name=body.name.strip(),
            status="COMPLETED",
            cache_status="MISS",
            site=body.site,
            time_step_minutes=body.time_step_minutes,
            horizon_model=body.horizon_model,
            weights=body.weights,
            window_duration_hours=body.window_duration_hours,
            scenarios=ranked,
            recommended_scenario_id=recommended,
            recommendation_available=recommended is not None,
            recommendation_note=note,
            created_at=row.created_at,
        )
        row.status = "COMPLETED"
        row.result_json = result.model_dump(mode="json")
        row.completed_at = datetime.now(UTC)
        row.error_message = None
        session.commit()
        return result
    except (HorizonsError, TerrainUnavailableError) as exc:
        _mark_failed(session, row, exc)
        raise
    except Exception as exc:
        _mark_failed(session, row, exc)
        raise
