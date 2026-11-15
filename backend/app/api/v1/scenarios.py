"""Phase 7C same-site, different-date scenario endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.api.deps import db_session, horizons_client
from app.integrations.nasa.horizons import HorizonsClient
from app.schemas.common import ErrorResponse
from app.schemas.scenarios import (
    ScenarioComparisonCreate,
    ScenarioComparisonResult,
    ScenarioComparisonStatus,
)
from app.services import scenario_service

router = APIRouter(prefix="/scenarios", tags=["scenarios"])
ScenarioId = Annotated[str, Path(max_length=64, pattern=r"^[A-Za-z0-9\-]+$")]
_ERRORS = {
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


@router.get("", response_model=list[ScenarioComparisonStatus])
def list_scenarios(
    session: Annotated[Session, Depends(db_session)],
) -> list[ScenarioComparisonStatus]:
    return scenario_service.list_comparisons(session)


@router.post(
    "",
    response_model=ScenarioComparisonResult,
    responses=_ERRORS,
    summary="Compare one stable lunar site across 2–10 UTC mission windows",
)
async def create_scenarios(
    body: ScenarioComparisonCreate,
    session: Annotated[Session, Depends(db_session)],
    horizons: Annotated[HorizonsClient, Depends(horizons_client)],
) -> ScenarioComparisonResult:
    return await scenario_service.create_comparison(session, horizons, body)


@router.get("/{comparison_id}", response_model=ScenarioComparisonResult, responses=_ERRORS)
def get_scenarios(
    comparison_id: ScenarioId,
    session: Annotated[Session, Depends(db_session)],
) -> ScenarioComparisonResult:
    return scenario_service.load_comparison(session, comparison_id)
