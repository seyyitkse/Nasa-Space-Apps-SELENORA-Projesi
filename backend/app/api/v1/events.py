"""Operational Sun/Earth events endpoint (Phase 7A)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.schemas.common import ErrorResponse
from app.schemas.events import EventsResponse
from app.services import events_service

router = APIRouter(prefix="/analyses", tags=["events"])

AnalysisId = Annotated[str, Path(max_length=64, pattern=r"^[A-Za-z0-9\-]+$")]


@router.get(
    "/{analysis_id}/events",
    response_model=EventsResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
    summary="Next Sun/Earth visibility events as sample brackets (Phase 7A)",
)
def get_events(
    analysis_id: AnalysisId,
    session: Annotated[Session, Depends(db_session)],
    reference_utc: Annotated[
        datetime | None,
        Query(
            description=(
                "Timezone-aware reference epoch inside the stored samples. Omit to use "
                "the current time when it falls inside the analysis, otherwise the "
                "first stored sample (reported as WINDOW_START, never as NOW)."
            )
        ),
    ] = None,
) -> EventsResponse:
    """Current state and next rise/set brackets per site, body and horizon type.

    Derived from the stored per-epoch states (same source as ``/epochs``); no new
    JPL Horizons request. Events are brackets between samples, UNKNOWN is preserved,
    and nothing is confirmed across an UNKNOWN interval.
    """
    return events_service.load_events(session, analysis_id, reference_utc=reference_utc)
