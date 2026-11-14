"""Shared helpers for turning visibility masks into API result shapes.

Used by both the SYNTHETIC_DEMO path and the real Horizons analysis pipeline
so response contracts stay identical.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np

from app.schemas.analysis import (
    Interval,
    ScoreContribution,
    SiteResult,
    SiteTimeline,
    TimelinePoint,
    VisibilityMetrics,
)
from app.science import scoring, visibility
from app.science.scoring import Contribution

MAX_TIMELINE_POINTS = 720
MAX_WINDOWS = 50


def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def intervals_from_times(
    times: list[datetime],
    mask: np.ndarray,
    step_minutes: int,
    value: bool,
) -> list[Interval]:
    """Build Interval list from a boolean mask over an ordered time grid."""
    spans = visibility.runs(mask, value)
    spans.sort(key=lambda se: se[1] - se[0], reverse=True)
    out: list[Interval] = []
    for start_idx, end_idx in spans[:MAX_WINDOWS]:
        start = to_utc(times[start_idx])
        end = to_utc(times[end_idx - 1]) + timedelta(minutes=step_minutes)
        out.append(
            Interval(
                start_utc=start,
                end_utc=end,
                duration_hours=round((end_idx - start_idx) * step_minutes / 60.0, 3),
            )
        )
    return sorted(out, key=lambda i: i.start_utc)


def timeline_stride(n_points: int) -> int:
    return max(1, int(np.ceil(n_points / MAX_TIMELINE_POINTS)))


def build_site_timeline(
    label: str,
    times: list[datetime],
    sun_elevation: np.ndarray,
    earth_elevation: np.ndarray,
    stride: int,
) -> SiteTimeline:
    points: list[TimelinePoint] = []
    for i in range(0, len(times), stride):
        sun_v = sun_elevation[i]
        earth_v = earth_elevation[i]
        points.append(
            TimelinePoint(
                t=to_utc(times[i]),
                sun_elevation_deg=None if np.isnan(sun_v) else round(float(sun_v), 4),
                earth_elevation_deg=None if np.isnan(earth_v) else round(float(earth_v), 4),
            )
        )
    return SiteTimeline(label=label, points=points)


def contributions_to_schema(contribs: list[Contribution]) -> list[ScoreContribution]:
    return [
        ScoreContribution(
            metric=c.metric,  # type: ignore[arg-type]
            weight_pct=c.weight_pct,
            value_pct=c.value_pct,
            contribution=c.contribution,
        )
        for c in contribs
    ]


def build_site_result(
    *,
    label: str,
    latitude_deg: float,
    longitude_deg: float,
    landing_site_id: str | None,
    times: list[datetime],
    sun_elevation: np.ndarray,
    earth_elevation: np.ndarray,
    step_minutes: int,
    weights: dict[str, float],
    data_quality: str,
) -> tuple[SiteResult, float | None, np.ndarray, np.ndarray, np.ndarray]:
    summary, sun_vis, earth_vis, joint = visibility.summarize(
        sun_elevation, earth_elevation, step_minutes
    )
    metrics = summary.as_metrics()
    scorable = scoring.is_scorable(data_quality, summary.missing_fraction)
    score: float | None = None
    contribs: list[Contribution] = []
    if scorable:
        score, contribs = scoring.score_site(metrics, weights)
    site = SiteResult(
        label=label,
        latitude_deg=latitude_deg,
        longitude_deg=longitude_deg,
        landing_site_id=landing_site_id,
        metrics=VisibilityMetrics(**metrics),
        score=score,
        rank=None,
        contributions=contributions_to_schema(contribs),
        darkness_windows=intervals_from_times(times, sun_vis, step_minutes, False),
        communication_gaps=intervals_from_times(times, earth_vis, step_minutes, False),
        joint_windows=intervals_from_times(times, joint, step_minutes, True),
    )
    return site, score, sun_vis, earth_vis, joint


def apply_ranks(site_results: list[SiteResult], scores: list[float | None]) -> str | None:
    ranks = scoring.rank(scores)
    for result, rank in zip(site_results, ranks, strict=True):
        result.rank = rank
    best = [s.label for s in site_results if s.rank == 1]
    return best[0] if len(best) == 1 else None
