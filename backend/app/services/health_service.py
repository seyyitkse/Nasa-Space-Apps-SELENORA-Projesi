from __future__ import annotations

import time
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app import __version__
from app.core.config import ALGORITHM_VERSION, API_VERSION, Settings
from app.schemas.health import ComponentStatus, HealthResponse

_STARTED = time.monotonic()


def check_health(settings: Settings, session: Session) -> HealthResponse:
    components: list[ComponentStatus] = []
    try:
        session.execute(text("SELECT 1"))
        components.append(ComponentStatus(name="database", status="OK", detail="SQLite reachable"))
    except Exception as exc:  # pragma: no cover - exercised only on real DB failure
        components.append(
            ComponentStatus(name="database", status="DOWN", detail=type(exc).__name__)
        )

    components += [
        ComponentStatus(
            name="horizons_client",
            status="READY",
            detail="Client configured; not probed on health checks to avoid load on JPL.",
        ),
        ComponentStatus(
            name="scientific_engine",
            status="READY",
            detail="Horizons ephemeris → geometric visibility → deterministic scoring (Phase 2).",
        ),
        ComponentStatus(
            name="terrain_model",
            status="NOT_IMPLEMENTED",
            detail="LOLA horizon model planned for Phase 4.",
        ),
        ComponentStatus(
            name="ai_analyst",
            status="READY" if settings.deepseek_configured else "NOT_CONFIGURED",
            detail=(
                f"DeepSeek model '{settings.deepseek_model}' configured."
                if settings.deepseek_configured
                else "DEEPSEEK_API_KEY not set."
            ),
        ),
    ]
    degraded = any(c.status == "DOWN" for c in components)
    return HealthResponse(
        status="degraded" if degraded else "ok",
        service=settings.app_name,
        version=__version__,
        api_version=API_VERSION,
        algorithm_version=ALGORITHM_VERSION,
        environment=settings.environment,
        server_time_utc=datetime.now(UTC),
        uptime_seconds=round(time.monotonic() - _STARTED, 1),
        components=components,
    )
