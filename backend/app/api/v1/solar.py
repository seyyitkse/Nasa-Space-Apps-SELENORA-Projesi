"""Relative solar-potential endpoint (Phase 7B)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.schemas.common import ErrorResponse
from app.schemas.solar import SolarPotentialResponse
from app.services import solar_service

router = APIRouter(prefix="/analyses", tags=["solar-potential"])

AnalysisId = Annotated[str, Path(max_length=64, pattern=r"^[A-Za-z0-9\-]+$")]


@router.get(
    "/{analysis_id}/solar-potential",
    response_model=SolarPotentialResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
    summary="Relative solar-incidence potential per site and panel configuration (Phase 7B)",
)
def get_solar_potential(
    analysis_id: AnalysisId,
    session: Annotated[Session, Depends(db_session)],
    panel: Annotated[
        str | None,
        Query(
            max_length=32,
            description=(
                "horizontal | fixed | azimuth_tracking | dual_axis. Omit to return all "
                "four configurations for comparison."
            ),
        ),
    ] = None,
    azimuth_deg: Annotated[
        float | None,
        Query(
            description=(
                "Fixed panel only: azimuth of the panel normal, degrees clockwise from "
                "true north, [0, 360). Omit for a per-site hindsight optimum."
            )
        ),
    ] = None,
    tilt_deg: Annotated[
        float | None,
        Query(
            description=(
                "Fixed panel only: angle between the panel normal and the local "
                "vertical, [0, 90]. Default 90 (vertical)."
            )
        ),
    ] = None,
    tracking_tilt_deg: Annotated[
        float | None,
        Query(description="Azimuth-tracking panel only: constant tilt, [0, 90]. Default 90."),
    ] = None,
) -> SolarPotentialResponse:
    """Relative illumination-geometry index. Not irradiance, not electrical output.

    Derived from the stored per-epoch Sun geometry and states (same source as
    ``/epochs``); no new JPL Horizons request. UNKNOWN terrain visibility yields a
    minimum–maximum range, never a single invented value.
    """
    options = solar_service.parse_options(
        panel=panel,
        azimuth_deg=azimuth_deg,
        tilt_deg=tilt_deg,
        tracking_tilt_deg=tracking_tilt_deg,
    )
    return solar_service.load_solar_potential(session, analysis_id, options)
