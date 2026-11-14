"""Phase 3 schema: analysis JSON payloads + AI report metadata.

Safe for existing Phase 1/2 SQLite databases: adds missing columns without
dropping tables. Fresh installs create the full schema via create_all then
stamp, or via this revision when tables are absent.

Revision ID: 20261114_0001
Revises:
Create Date: 2026-11-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261114_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    bind = op.get_bind()
    rows = bind.execute(sa.text(f"PRAGMA table_info('{table}')")).fetchall()
    return {r[1] for r in rows}


def _tables() -> set[str]:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table'")
    ).fetchall()
    return {r[0] for r in rows}


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if table not in _tables():
        return
    if column.name in _columns(table):
        return
    with op.batch_alter_table(table) as batch:
        batch.add_column(column)


def upgrade() -> None:
    tables = _tables()

    # Ensure core tables exist for brand-new empty DBs that somehow skipped create_all.
    if "mission_analyses" not in tables:
        op.create_table(
            "mission_analyses",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mission_name", sa.String(160), nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("start_utc", sa.DateTime(timezone=True), nullable=False),
            sa.Column("end_utc", sa.DateTime(timezone=True), nullable=False),
            sa.Column("time_step_minutes", sa.Integer(), nullable=False),
            sa.Column("horizon_model", sa.String(24), nullable=False),
            sa.Column("weights", sa.JSON(), nullable=False),
            sa.Column("data_quality", sa.String(32), nullable=False),
            sa.Column("algorithm_version", sa.String(32), nullable=False),
            sa.Column("cache_key", sa.String(64), nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("result_json", sa.JSON(), nullable=True),
            sa.Column("timeline_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_mission_analyses_cache_key", "mission_analyses", ["cache_key"])
    else:
        _add_column_if_missing("mission_analyses", sa.Column("result_json", sa.JSON(), nullable=True))
        _add_column_if_missing("mission_analyses", sa.Column("timeline_json", sa.JSON(), nullable=True))

    if "analysis_sites" in _tables():
        _add_column_if_missing("analysis_sites", sa.Column("details", sa.JSON(), nullable=True))

    if "ai_reports" in _tables():
        _add_column_if_missing("ai_reports", sa.Column("prompt_version", sa.String(32), nullable=True))
        _add_column_if_missing("ai_reports", sa.Column("unsupported_numbers", sa.JSON(), nullable=True))
        _add_column_if_missing("ai_reports", sa.Column("cache_key", sa.String(64), nullable=True))
        _add_column_if_missing("ai_reports", sa.Column("token_usage", sa.JSON(), nullable=True))
        # Index for cache lookups (safe if already present — SQLite ignores duplicate names poorly,
        # so only create when missing).
        bind = op.get_bind()
        idx = {
            r[1]
            for r in bind.execute(sa.text("PRAGMA index_list('ai_reports')")).fetchall()
        }
        if "ix_ai_reports_cache_key" not in idx:
            op.create_index("ix_ai_reports_cache_key", "ai_reports", ["cache_key"])


def downgrade() -> None:
    # Non-destructive downgrade: leave columns in place (SQLite drop-column is fragile).
    pass
