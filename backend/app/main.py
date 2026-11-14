"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app import __version__
from app.api import health
from app.api import v1 as api_v1
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RateLimitMiddleware, RequestContextMiddleware
from app.db.migrate import run_migrations
from app.db.seed import seed_landing_sites
from app.db.session import Database
from app.integrations.deepseek.client import DeepSeekClient
from app.integrations.nasa.horizons import HorizonsClient

logger = logging.getLogger("selenora")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        database = Database(settings.database_url)
        # create_all keeps brand-new installs working; Alembic upgrades existing DBs
        # without deleting rows (adds Phase 2/3 columns safely).
        database.create_all()
        try:
            run_migrations(settings.database_url)
        except Exception:
            logger.exception("migration_failed")
            raise
        with database.session_factory() as session:
            added = seed_landing_sites(session)
        http = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.horizons_timeout_seconds, connect=10.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            headers={"User-Agent": f"SELENORA/{__version__} (research prototype)"},
        )
        app.state.database = database
        app.state.http = http
        app.state.horizons = HorizonsClient(
            http, base_url=settings.horizons_base_url, max_retries=settings.horizons_max_retries
        )
        app.state.deepseek = DeepSeekClient(settings)
        logger.info(
            "startup",
            extra={
                "env": settings.environment,
                "seeded_sites": added,
                "deepseek_configured": settings.deepseek_configured,
            },
        )
        try:
            yield
        finally:
            await http.aclose()
            database.engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description=(
            "SELENORA — AI-Assisted Lunar Landing Site Decision Support Platform. "
            "Scientific computation drives the results; AI explains the evidence. "
            "Research and education use only — not a certified landing-safety system."
        ),
        lifespan=lifespan,
    )
    register_exception_handlers(app)
    # Order: last added runs first. Context (request id) must wrap everything.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(RateLimitMiddleware, limit_per_minute=settings.rate_limit_per_minute)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Request-ID", "Accept-Language"],
        expose_headers=["X-Request-ID", "Server-Timing"],
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware)

    app.include_router(health.router)
    app.include_router(api_v1.router)
    return app


app = create_app()
