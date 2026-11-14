"""Dependency-injection providers. Resources live on ``app.state`` (created in
the lifespan) so tests can override any of them via ``app.dependency_overrides``."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.integrations.deepseek.client import DeepSeekClient
from app.integrations.nasa.horizons import HorizonsClient


def settings_dep() -> Settings:
    return get_settings()


def db_session(request: Request) -> Iterator[Session]:
    yield from request.app.state.database.session()


def horizons_client(request: Request) -> HorizonsClient:
    return request.app.state.horizons


def deepseek_client(request: Request) -> DeepSeekClient:
    return request.app.state.deepseek
