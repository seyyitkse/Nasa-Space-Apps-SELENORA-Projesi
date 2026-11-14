"""Run Alembic migrations programmatically (used at app startup)."""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger("selenora.migrate")

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def run_migrations(database_url: str | None = None) -> None:
    """Upgrade the database to head. Never deletes user data."""
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    if database_url:
        cfg.set_main_option("sqlalchemy.url", database_url)
        cfg.attributes["database_url"] = database_url
    command.upgrade(cfg, "head")
    logger.info("migrations_applied", extra={"revision": "head"})
