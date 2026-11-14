from __future__ import annotations

from fastapi import APIRouter

from app.schemas.analysis import AnalysisCreate
from app.services.demo_analysis_service import DemoAnalysisResponse, build_synthetic_analysis

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post(
    "/synthetic-analysis",
    response_model=DemoAnalysisResponse,
    summary="Run the deterministic pipeline on SYNTHETIC_DEMO data (not real ephemeris)",
)
def synthetic_analysis(body: AnalysisCreate) -> DemoAnalysisResponse:
    return build_synthetic_analysis(body)
