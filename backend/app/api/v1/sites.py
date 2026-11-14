from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.schemas.common import ErrorResponse
from app.schemas.site import LandingSiteList, LandingSiteOut
from app.services.site_service import SiteService

router = APIRouter(prefix="/sites", tags=["sites"])


def site_service(session: Annotated[Session, Depends(db_session)]) -> SiteService:
    return SiteService(session)


@router.get("", response_model=LandingSiteList, summary="List reference landing sites")
def list_sites(service: Annotated[SiteService, Depends(site_service)]) -> LandingSiteList:
    return service.list_sites()


@router.get(
    "/{site_id}",
    response_model=LandingSiteOut,
    responses={404: {"model": ErrorResponse}},
    summary="Get one landing site",
)
def get_site(
    site_id: Annotated[str, Path(max_length=64, pattern=r"^[a-z0-9\-]+$")],
    service: Annotated[SiteService, Depends(site_service)],
) -> LandingSiteOut:
    return service.get_site(site_id)
