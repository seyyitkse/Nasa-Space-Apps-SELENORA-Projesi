"""Mission analysis endpoints — Horizons science + DeepSeek explain (Phase 3)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import db_session, deepseek_client, horizons_client
from app.core.errors import NotFoundError
from app.integrations.deepseek.client import DeepSeekClient
from app.integrations.nasa.horizons import HorizonsClient
from app.models.analysis import MissionAnalysis
from app.schemas.analysis import (
    AnalysisCreate,
    AnalysisResult,
    AnalysisStatus,
    ExplainRequest,
    ExplainResponse,
    TimelineResponse,
)
from app.schemas.common import ErrorResponse
from app.schemas.epochs import EpochsResponse
from app.services import analysis_service, epochs_service, explain_service

router = APIRouter(prefix="/analyses", tags=["analyses"])

AnalysisId = Annotated[str, Path(max_length=64, pattern=r"^[A-Za-z0-9\-]+$")]
_ERRORS = {
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    501: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


def _require(session: Session, analysis_id: str) -> MissionAnalysis:
    row = session.get(MissionAnalysis, analysis_id)
    if row is None:
        raise NotFoundError(f"Analysis '{analysis_id}' not found.")
    return row


@router.get("", response_model=list[AnalysisStatus], summary="List stored analyses")
def list_analyses(session: Annotated[Session, Depends(db_session)]) -> list[AnalysisStatus]:
    rows = session.scalars(select(MissionAnalysis).order_by(MissionAnalysis.created_at.desc())).all()
    return [
        AnalysisStatus(id=r.id, status=r.status, data_quality=r.data_quality)  # type: ignore[arg-type]
        for r in rows
    ]


@router.post(
    "",
    response_model=AnalysisStatus,
    responses={
        **_ERRORS,
        200: {"model": AnalysisStatus, "description": "Analysis completed (sync or cache hit)"},
        202: {"model": AnalysisStatus, "description": "Analysis accepted and still running"},
    },
    summary="Create a mission analysis from JPL Horizons ephemeris",
)
async def create_analysis(
    body: AnalysisCreate,
    response: Response,
    session: Annotated[Session, Depends(db_session)],
    horizons: Annotated[HorizonsClient, Depends(horizons_client)],
) -> AnalysisStatus:
    status = await analysis_service.create_analysis(session, horizons, body)
    # 202 only when work is still in flight; completed/cache-hit → 200.
    response.status_code = 202 if status.status in {"PENDING", "RUNNING"} else 200
    return status


@router.get("/{analysis_id}", response_model=AnalysisResult, responses=_ERRORS)
def get_analysis(
    analysis_id: AnalysisId, session: Annotated[Session, Depends(db_session)]
) -> AnalysisResult:
    row = _require(session, analysis_id)
    if row.status in {"PENDING", "RUNNING"}:
        return AnalysisResult(
            id=row.id,
            mission_name=row.mission_name,
            status=row.status,  # type: ignore[arg-type]
            data_quality=row.data_quality,  # type: ignore[arg-type]
            algorithm_version=row.algorithm_version,
            start_utc=row.start_utc,
            end_utc=row.end_utc,
            time_step_minutes=row.time_step_minutes,
            horizon_model=row.horizon_model,  # type: ignore[arg-type]
            weights=row.weights,  # type: ignore[arg-type]
            sites=[],
            recommended_site_label=None,
            assumptions=[],
            limitations=[row.error_message] if row.error_message else [],
            provenance=[],
            created_at=row.created_at,
        )
    if row.status == "FAILED":
        if row.result_json:
            return analysis_service.load_result(row)
        return AnalysisResult(
            id=row.id,
            mission_name=row.mission_name,
            status="FAILED",
            data_quality="UNAVAILABLE",
            algorithm_version=row.algorithm_version,
            start_utc=row.start_utc,
            end_utc=row.end_utc,
            time_step_minutes=row.time_step_minutes,
            horizon_model=row.horizon_model,  # type: ignore[arg-type]
            weights=row.weights,  # type: ignore[arg-type]
            sites=[],
            recommended_site_label=None,
            assumptions=[],
            limitations=[row.error_message or "Analysis failed."],
            provenance=[],
            created_at=row.created_at,
        )
    return analysis_service.load_result(row)


@router.get("/{analysis_id}/timeline", response_model=TimelineResponse, responses=_ERRORS)
def get_timeline(
    analysis_id: AnalysisId, session: Annotated[Session, Depends(db_session)]
) -> TimelineResponse:
    row = _require(session, analysis_id)
    if row.status != "COMPLETED" or not row.timeline_json:
        raise NotFoundError(f"Timeline for analysis '{analysis_id}' is not available yet.")
    return analysis_service.load_timeline(row)


@router.get(
    "/{analysis_id}/epochs",
    response_model=EpochsResponse,
    responses=_ERRORS,
    summary="Authoritative per-epoch Sun/Earth states from stored timelines (Phase 5E)",
)
def get_epochs(
    analysis_id: AnalysisId, session: Annotated[Session, Depends(db_session)]
) -> EpochsResponse:
    """Return VISIBLE/BLOCKED/UNKNOWN per sample without a new Horizons request.

    Built from persisted ``visibility_timelines`` Az/El. Terrain analyses recompute
    states against the local LOLA horizon (UNKNOWN when DEM coverage is incomplete).
    """
    return epochs_service.load_epochs(session, analysis_id)


@router.post(
    "/{analysis_id}/explain",
    response_model=ExplainResponse,
    responses=_ERRORS,
    summary="Generate or fetch a DeepSeek AI briefing for a stored analysis",
)
async def explain_analysis(
    analysis_id: AnalysisId,
    body: ExplainRequest,
    session: Annotated[Session, Depends(db_session)],
    deepseek: Annotated[DeepSeekClient, Depends(deepseek_client)],
) -> ExplainResponse:
    return await explain_service.explain_analysis(session, deepseek, analysis_id, body)


@router.get(
    "/{analysis_id}/explain",
    response_model=ExplainResponse,
    responses=_ERRORS,
    summary="Fetch the latest stored AI briefing (no new DeepSeek call)",
)
def get_explanation(
    analysis_id: AnalysisId,
    session: Annotated[Session, Depends(db_session)],
    language: str | None = None,
) -> ExplainResponse:
    lang = language if language in {"en", "tr"} else None
    out = explain_service.get_latest_explanation(session, analysis_id, lang)  # type: ignore[arg-type]
    if out is None:
        raise NotFoundError(f"No AI briefing stored for analysis '{analysis_id}'.")
    return out
