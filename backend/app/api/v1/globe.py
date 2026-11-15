"""Phase 6B — globe-ready read-only markers (reuses seed LandingSite rows)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.schemas.globe import GlobeSiteCatalog
from app.services import globe_sites

router = APIRouter(prefix="/globe", tags=["globe"])


@router.get(
    "/sites",
    response_model=GlobeSiteCatalog,
    summary="Globe markers from seed sites (not NASA landing recommendations)",
)
def list_globe_sites(session: Annotated[Session, Depends(db_session)]) -> GlobeSiteCatalog:
    payload = globe_sites.catalog(session)
    return GlobeSiteCatalog.model_validate(payload)
