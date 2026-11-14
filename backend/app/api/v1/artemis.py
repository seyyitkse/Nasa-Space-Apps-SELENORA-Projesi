"""Artemis III reference endpoints (documentation labels only)."""

from __future__ import annotations

from fastapi import APIRouter

from app.services import artemis_regions

router = APIRouter(prefix="/artemis", tags=["artemis"])


@router.get("/regions", summary="Artemis III candidate region labels (no fabricated polygons)")
def artemis_regions_catalog() -> dict:
    return artemis_regions.catalog()
