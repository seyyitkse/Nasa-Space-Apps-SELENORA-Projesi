from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.common import ApiModel

ComponentState = Literal["OK", "DEGRADED", "DOWN", "NOT_CONFIGURED", "NOT_IMPLEMENTED", "READY"]


class ComponentStatus(ApiModel):
    name: str
    status: ComponentState
    detail: str


class HealthResponse(ApiModel):
    status: Literal["ok", "degraded"]
    service: str
    version: str
    api_version: str
    algorithm_version: str
    environment: str
    server_time_utc: datetime
    uptime_seconds: float
    components: list[ComponentStatus]
