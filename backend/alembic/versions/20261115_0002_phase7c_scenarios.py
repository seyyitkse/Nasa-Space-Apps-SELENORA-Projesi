"""Phase 7C same-site date scenario persistence.

Revision ID: 20261115_0002
Revises: 20261114_0001
Create Date: 2026-11-15
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261115_0002"
down_revision: Union[str, None] = "20261114_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
    return {r[0] for r in rows}


def upgrade() -> None:
    if "scenario_comparisons" in _tables():
        return
    op.create_table(
        "scenario_comparisons",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("site_id", sa.String(96), nullable=False),
        sa.Column("site_label", sa.String(160), nullable=False),
        sa.Column("latitude_deg", sa.Float(), nullable=False),
        sa.Column("longitude_deg", sa.Float(), nullable=False),
        sa.Column("landing_site_id", sa.String(64), nullable=True),
        sa.Column("time_step_minutes", sa.Integer(), nullable=False),
        sa.Column("horizon_model", sa.String(24), nullable=False),
        sa.Column("weights", sa.JSON(), nullable=False),
        sa.Column("scenario_count", sa.Integer(), nullable=False),
        sa.Column("cache_key", sa.String(64), nullable=False),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_scenario_comparisons_cache_key",
        "scenario_comparisons",
        ["cache_key"],
    )


def downgrade() -> None:
    # Scenario rows are user-created scientific records. Keep downgrade
    # non-destructive, consistent with the existing SQLite migration policy.
    pass
