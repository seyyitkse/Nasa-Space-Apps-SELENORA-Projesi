"""Mission analysis contract.

Phase 1 status: request validation is live; computation is NOT. These endpoints
return ``501 NOT_IMPLEMENTED`` (or 404 for unknown ids) and never fabricate a
successful analysis. See docs/API_CONTRACT.md.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.core.errors import NotFoundError, NotImplementedYetError
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

router = APIRouter(prefix="/analyses", tags=["analyses"])

AnalysisId = Annotated[str, Path(max_length=64, pattern=r"^[A-Za-z0-9\-]+$")]
_ERRORS = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 501: {"model": ErrorResponse}}


def _require(session: Session, analysis_id: str) -> MissionAnalysis:
    row = session.get(MissionAnalysis, analysis_id)
    if row is None:
        raise NotFoundError(f"Analysis '{analysis_id}' not found.")
    return row


@router.get("", response_model=list[AnalysisStatus], summary="List stored analyses")
def list_analyses(session: Annotated[Session, Depends(db_session)]) -> list[AnalysisStatus]:
    rows = session.scalars(select(MissionAnalysis).order_by(MissionAnalysis.created_at.desc())).all()
    return [AnalysisStatus(id=r.id, status=r.status, data_quality=r.data_quality) for r in rows]  # type: ignore[arg-type]


@router.post(
    "",
    response_model=AnalysisStatus,
    status_code=202,
    responses=_ERRORS,
    summary="Create a mission analysis (Phase 2)",
)
def create_analysis(body: AnalysisCreate) -> AnalysisStatus:
    raise NotImplementedYetError(
        "The ephemeris-based analysis engine is scheduled for Phase 2. "
        "Your request was validated successfully but no analysis was run.",
        details={
            "validated": True,
            "sites": len(body.sites),
            "sample_count_per_site": body.sample_count,
            "phase": 2,
        },
    )


@router.get("/{analysis_id}", response_model=AnalysisResult, responses=_ERRORS)
def get_analysis(
    analysis_id: AnalysisId, session: Annotated[Session, Depends(db_session)]
) -> AnalysisResult:
    _require(session, analysis_id)
    raise NotImplementedYetError("Analysis result retrieval is scheduled for Phase 2.")


@router.get("/{analysis_id}/timeline", response_model=TimelineResponse, responses=_ERRORS)
def get_timeline(
    analysis_id: AnalysisId, session: Annotated[Session, Depends(db_session)]
) -> TimelineResponse:
    _require(session, analysis_id)
    raise NotImplementedYetError("Timeline retrieval is scheduled for Phase 2.")


@router.post("/{analysis_id}/explain", response_model=ExplainResponse, responses=_ERRORS)
def explain_analysis(
    analysis_id: AnalysisId,
    body: ExplainRequest,
    session: Annotated[Session, Depends(db_session)],
) -> ExplainResponse:
    _require(session, analysis_id)
    raise NotImplementedYetError("AI explanation is scheduled for Phase 3.")
