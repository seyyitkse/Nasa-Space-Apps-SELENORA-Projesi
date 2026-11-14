from __future__ import annotations

from typing import Literal

from app.schemas.common import ApiModel

IntegrationStatus = Literal["CLIENT_READY", "INTEGRATED", "PLANNED", "NOT_CONFIGURED"]


class DataSourceOut(ApiModel):
    id: str
    name: str
    provider: str
    category: Literal["EPHEMERIS", "TOPOGRAPHY", "AI_EXPLANATION"]
    description: str
    url: str
    documentation_url: str
    integration_status: IntegrationStatus
    used_for: list[str]
    phase: int
    notes: str


class DataSourceList(ApiModel):
    items: list[DataSourceOut]
