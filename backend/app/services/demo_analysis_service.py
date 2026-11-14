"""Builds a SYNTHETIC_DEMO analysis by running the real deterministic
visibility + scoring code on the synthetic elevation model.

Every output is labelled ``SYNTHETIC_DEMO``; nothing is persisted.
"""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np

from app.core.config import ALGORITHM_VERSION
from app.schemas.analysis import (
    AnalysisCreate,
    AnalysisResult,
    Provenance,
    TimelineResponse,
)
from app.schemas.common import ApiModel
from app.science.synthetic import synthetic_elevations, time_grid
from app.services.cache_keys import analysis_cache_key
from app.services.result_builder import (
    apply_ranks,
    build_site_result,
    build_site_timeline,
    timeline_stride,
    to_utc,
)

MAX_TIMELINE_POINTS = 720


class DemoAnalysisResponse(ApiModel):
    result: AnalysisResult
    timeline: TimelineResponse


def build_synthetic_analysis(req: AnalysisCreate) -> DemoAnalysisResponse:
    step = req.time_step_minutes
    times_np = time_grid(req.start_utc, req.end_utc, step)
    times = [
        to_utc(datetime.fromisoformat(str(np.datetime_as_string(t, unit="m"))))
        for t in times_np
    ]
    weights = req.weights.model_dump()
    key = analysis_cache_key(
        sites=[(s.latitude_deg, s.longitude_deg) for s in req.sites],
        start_utc=req.start_utc,
        end_utc=req.end_utc,
        time_step_minutes=step,
        horizon_model="GEOMETRIC",
        algorithm_version=ALGORITHM_VERSION,
        data_source_version="synthetic-v1",
    )
    analysis_id = f"demo-{key[:12]}"

    stride = timeline_stride(len(times))
    site_results = []
    timelines = []
    scores: list[float | None] = []

    for site in req.sites:
        sun, earth = synthetic_elevations(site.latitude_deg, site.longitude_deg, times_np)
        site_result, score, *_ = build_site_result(
            label=site.label,
            latitude_deg=site.latitude_deg,
            longitude_deg=site.longitude_deg,
            landing_site_id=site.landing_site_id,
            times=times,
            sun_elevation=sun,
            earth_elevation=earth,
            step_minutes=step,
            weights=weights,
            data_quality="SYNTHETIC_DEMO",
            analysis_end_utc=req.end_utc,
        )
        scores.append(score)
        site_results.append(site_result)
        timelines.append(build_site_timeline(site.label, times, sun, earth, stride))

    recommended = apply_ranks(site_results, scores)
    now = datetime.now(UTC)
    result = AnalysisResult(
        id=analysis_id,
        mission_name=req.mission_name,
        status="COMPLETED",
        data_quality="SYNTHETIC_DEMO",
        algorithm_version=ALGORITHM_VERSION,
        start_utc=req.start_utc,
        end_utc=req.end_utc,
        time_step_minutes=step,
        horizon_model="GEOMETRIC",
        weights=req.weights,
        sites=site_results,
        recommended_site_label=recommended,
        assumptions=[
            "Elevations come from a simplified analytic model (SYNTHETIC_DEMO), not JPL Horizons.",
            "Latitude phases are loosely anchored to two real JPL Horizons samples (2026-12-01); "
            "the model drifts from reality away from that date.",
            "Geometric (smooth-sphere) horizon at 0°; terrain shadowing is not modelled.",
            "Sun visibility is evaluated at the solar disc centre.",
            "Durations use sample-and-hold over [start_utc, end_utc) with ±1 step resolution.",
        ],
        limitations=[
            "Synthetic data must not be used for mission decisions.",
            "Earth above the horizon does not guarantee a working communication link.",
            "The score is a comparative planning heuristic, not a NASA-endorsed safety score.",
            "Ties in score produce no single recommendation.",
            "Coarse synthetic samples are estimates only — not second-precision ephemeris.",
        ],
        provenance=[
            Provenance(
                source_id="synthetic-v1",
                description="SELENORA synthetic geometry model (app/science/synthetic.py)",
                retrieved_at=None,
                version="synthetic-v1",
            )
        ],
        created_at=now,
    )
    timeline = TimelineResponse(
        analysis_id=analysis_id,
        data_quality="SYNTHETIC_DEMO",
        downsampled=stride > 1,
        step_minutes=step * stride,
        sites=timelines,
    )
    return DemoAnalysisResponse(result=result, timeline=timeline)
