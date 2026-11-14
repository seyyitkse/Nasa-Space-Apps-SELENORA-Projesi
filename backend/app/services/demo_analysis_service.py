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
    Interval,
    Provenance,
    ScoreContribution,
    SiteResult,
    SiteTimeline,
    TimelinePoint,
    TimelineResponse,
    VisibilityMetrics,
)
from app.schemas.common import ApiModel
from app.science import scoring, visibility
from app.science.synthetic import synthetic_elevations, time_grid
from app.services.cache_keys import analysis_cache_key

MAX_TIMELINE_POINTS = 720
MAX_WINDOWS = 50


class DemoAnalysisResponse(ApiModel):
    result: AnalysisResult
    timeline: TimelineResponse


def _to_dt(t: np.datetime64) -> datetime:
    return datetime.fromisoformat(str(np.datetime_as_string(t, unit="m"))).replace(tzinfo=UTC)


def _intervals(times: np.ndarray, mask: np.ndarray, step: int, value: bool) -> list[Interval]:
    spans = visibility.runs(mask, value)
    spans.sort(key=lambda se: se[1] - se[0], reverse=True)
    out = []
    for s, e in spans[:MAX_WINDOWS]:
        start = _to_dt(times[s])
        end = _to_dt(times[e - 1] + np.timedelta64(step, "m"))
        out.append(Interval(start_utc=start, end_utc=end, duration_hours=round((e - s) * step / 60, 3)))
    return sorted(out, key=lambda i: i.start_utc)


def build_synthetic_analysis(req: AnalysisCreate) -> DemoAnalysisResponse:
    step = req.time_step_minutes
    times = time_grid(req.start_utc, req.end_utc, step)
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

    stride = max(1, int(np.ceil(len(times) / MAX_TIMELINE_POINTS)))
    site_results: list[SiteResult] = []
    timelines: list[SiteTimeline] = []
    scores: list[float | None] = []

    for site in req.sites:
        sun, earth = synthetic_elevations(site.latitude_deg, site.longitude_deg, times)
        summary, sun_vis, earth_vis, joint = visibility.summarize(sun, earth, step)
        metrics = summary.as_metrics()
        score, contribs = scoring.score_site(metrics, weights)
        scores.append(score)
        site_results.append(
            SiteResult(
                label=site.label,
                latitude_deg=site.latitude_deg,
                longitude_deg=site.longitude_deg,
                landing_site_id=site.landing_site_id,
                metrics=VisibilityMetrics(**metrics),
                score=score,
                rank=None,
                contributions=[
                    ScoreContribution(
                        metric=c.metric,  # type: ignore[arg-type]
                        weight_pct=c.weight_pct,
                        value_pct=c.value_pct,
                        contribution=c.contribution,
                    )
                    for c in contribs
                ],
                darkness_windows=_intervals(times, sun_vis, step, False),
                communication_gaps=_intervals(times, earth_vis, step, False),
                joint_windows=_intervals(times, joint, step, True),
            )
        )
        timelines.append(
            SiteTimeline(
                label=site.label,
                points=[
                    TimelinePoint(
                        t=_to_dt(times[i]),
                        sun_elevation_deg=round(float(sun[i]), 4),
                        earth_elevation_deg=round(float(earth[i]), 4),
                    )
                    for i in range(0, len(times), stride)
                ],
            )
        )

    ranks = scoring.rank(scores)
    for result, r in zip(site_results, ranks, strict=True):
        result.rank = r
    best = [s.label for s in site_results if s.rank == 1]
    recommended = best[0] if len(best) == 1 else None

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
            "Latitude phases are loosely anchored to two real JPL Horizons samples (2026-12-01); the model drifts from reality away from that date.",
            "Geometric (smooth-sphere) horizon at 0°; terrain shadowing is not modelled.",
            "Sun visibility is evaluated at the solar disc centre.",
            "Durations use sample-and-hold with a resolution of ±1 time step.",
        ],
        limitations=[
            "Synthetic data must not be used for mission decisions.",
            "Earth above the horizon does not guarantee a working communication link.",
            "The score is a comparative planning heuristic, not a NASA-endorsed safety score.",
            "Ties in score produce no single recommendation.",
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
