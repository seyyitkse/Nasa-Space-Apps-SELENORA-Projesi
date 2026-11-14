from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import db_session, settings_dep
from app.core.config import Settings
from app.schemas.health import HealthResponse
from app.services.health_service import check_health

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse, summary="Service health and component status")
def health(
    settings: Annotated[Settings, Depends(settings_dep)],
    session: Annotated[Session, Depends(db_session)],
) -> HealthResponse:
    return check_health(settings, session)
