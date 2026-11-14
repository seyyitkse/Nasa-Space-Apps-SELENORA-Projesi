from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.site import LandingSite
from app.schemas.site import LandingSiteList, LandingSiteOut

COORDINATE_FRAME = "Lunar body-fixed, planetocentric latitude (IAU Moon; ME/PA frame to be confirmed per data product)"
LONGITUDE_CONVENTION = "East-positive, -180..180 degrees"
DISCLAIMER = (
    "Reference coordinates are approximate and intended for demonstration. "
    "They are not official Artemis candidate-region definitions."
)


class SiteService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_sites(self) -> LandingSiteList:
        rows = self._session.scalars(select(LandingSite).order_by(LandingSite.latitude_deg)).all()
        items = [LandingSiteOut.model_validate(r) for r in rows]
        return LandingSiteList(
            items=items,
            total=len(items),
            coordinate_frame=COORDINATE_FRAME,
            longitude_convention=LONGITUDE_CONVENTION,
            disclaimer=DISCLAIMER,
        )

    def get_site(self, site_id: str) -> LandingSiteOut:
        row = self._session.get(LandingSite, site_id)
        if row is None:
            raise NotFoundError(f"Landing site '{site_id}' not found.")
        return LandingSiteOut.model_validate(row)
