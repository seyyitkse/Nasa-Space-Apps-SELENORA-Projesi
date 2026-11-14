from __future__ import annotations

from app.schemas.common import ApiModel, Latitude, Longitude


class LandingSiteOut(ApiModel):
    id: str
    name: str
    latitude_deg: Latitude
    longitude_deg: Longitude
    region: str
    description: str
    coordinate_source: str
    coordinate_status: str


class LandingSiteList(ApiModel):
    items: list[LandingSiteOut]
    total: int
    coordinate_frame: str
    longitude_convention: str
    disclaimer: str
