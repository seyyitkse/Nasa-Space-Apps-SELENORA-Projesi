"""Phase 7E — read-only verified lunar mission catalog endpoint.

``GET /api/v1/missions`` — filtered by program, outcome bucket and coordinate
confidence. Filters are validated as enums; unknown values return 422 via
FastAPI query validation.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Query

from app.schemas.missions import MissionCatalog
from app.services import mission_catalog

router = APIRouter(prefix="/missions", tags=["missions"])


class ProgramFilter(str, Enum):
    APOLLO = "APOLLO"
    CLPS = "CLPS"


class OutcomeFilter(str, Enum):
    SUCCESSFUL = "successful"
    PARTIAL = "partial"
    UNSUCCESSFUL = "unsuccessful"
    ABORTED = "aborted"
    PLANNED = "planned"
    UNSUCCESSFUL_OR_ABORTED = "unsuccessful_or_aborted"


class ConfidenceFilter(str, Enum):
    EXACT_VERIFIED = "EXACT_VERIFIED"
    APPROXIMATE_REGION = "APPROXIMATE_REGION"


@router.get(
    "",
    response_model=MissionCatalog,
    summary="Verified lunar mission catalog (Apollo + CLPS, actual vs planned)",
)
def list_missions(
    program: Annotated[ProgramFilter | None, Query(description="Mission program")] = None,
    outcome: Annotated[
        OutcomeFilter | None,
        Query(
            description=(
                "Landing outcome bucket: successful / partial / unsuccessful / "
                "aborted / planned / unsuccessful_or_aborted"
            )
        ),
    ] = None,
    confidence: Annotated[
        ConfidenceFilter | None,
        Query(description="Coordinate confidence class"),
    ] = None,
) -> MissionCatalog:
    payload = mission_catalog.filtered_catalog(
        program=program.value if program else None,
        outcome=outcome.value if outcome else None,
        confidence=confidence.value if confidence else None,
    )
    return MissionCatalog.model_validate(payload)
