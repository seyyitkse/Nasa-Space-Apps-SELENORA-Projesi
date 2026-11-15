"""Phase 3.3 — duration / window invariants for visibility metrics."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from app.schemas.analysis import AnalysisCreate, DecisionWeights, SiteInput
from app.science import visibility
from app.services.result_builder import build_site_result, intervals_from_times


def _times(start: datetime, n: int, step_minutes: int) -> list[datetime]:
    return [start + timedelta(minutes=i * step_minutes) for i in range(n)]


def _assert_duration_invariants(
    *,
    start: datetime,
    end: datetime,
    step_minutes: int,
    times: list[datetime],
    sun: np.ndarray,
    earth: np.ndarray,
) -> None:
    window_h = (end - start).total_seconds() / 3600.0
    summary, sun_vis, earth_vis, joint = visibility.summarize(
        sun, earth, step_minutes, times=times, analysis_end_utc=end
    )
    hold = visibility.hold_hours_for_samples(times, step_minutes, end)
    assert float(hold.sum()) == pytest.approx(min(window_h, float(hold.sum())), abs=1e-9)
    assert float(hold.sum()) <= window_h + 1e-9
    for name in (
        "longest_sunlight_hours",
        "longest_darkness_hours",
        "longest_earth_visibility_hours",
        "longest_communication_gap_hours",
        "longest_joint_visibility_hours",
    ):
        assert getattr(summary, name) <= window_h + 1e-9, name
    assert summary.longest_communication_gap_hours <= window_h + 1e-9
    # Covered valid hours cannot exceed window.
    assert summary.covered_hours <= window_h + 1e-9
    # Interval ends never past analysis end.
    site, *_ = build_site_result(
        label="T",
        latitude_deg=-89.0,
        longitude_deg=0.0,
        landing_site_id=None,
        times=times,
        sun_elevation=sun,
        earth_elevation=earth,
        step_minutes=step_minutes,
        weights={"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
        data_quality="EPHEMERIS_GEOMETRIC",
        analysis_end_utc=end,
    )
    for w in site.darkness_windows + site.communication_gaps + site.joint_windows:
        assert w.end_utc <= end + timedelta(microseconds=0)
        assert w.duration_hours <= window_h + 1e-9
        assert w.start_utc >= start - timedelta(microseconds=0)


def test_96h_continuous_earth_invisible_gap_clamped() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    end = start + timedelta(hours=96)
    step = 360
    # Horizons-style inclusive stop → 17 samples.
    times = _times(start, 17, step)
    assert times[-1] == end
    sun = np.full(17, 10.0)  # always above
    earth = np.full(17, -5.0)  # always below
    summary, *_ = visibility.summarize(
        sun, earth, step, times=times, analysis_end_utc=end
    )
    assert summary.longest_communication_gap_hours == pytest.approx(96.0)
    assert summary.longest_sunlight_hours == pytest.approx(96.0)
    assert summary.longest_darkness_hours == pytest.approx(0.0)
    assert summary.earth_visibility_pct == pytest.approx(0.0)
    assert summary.sun_visibility_pct == pytest.approx(100.0)
    _assert_duration_invariants(
        start=start, end=end, step_minutes=step, times=times, sun=sun, earth=earth
    )


def test_96h_continuous_sun_visible() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    end = start + timedelta(hours=96)
    step = 360
    times = _times(start, 17, step)
    sun = np.full(17, 8.0)
    earth = np.full(17, 2.0)
    summary, *_ = visibility.summarize(
        sun, earth, step, times=times, analysis_end_utc=end
    )
    assert summary.longest_sunlight_hours == pytest.approx(96.0)
    assert summary.longest_darkness_hours == 0.0
    assert summary.joint_visibility_pct == pytest.approx(100.0)


def test_visibility_change_exactly_at_boundary_sample() -> None:
    start = datetime(2027, 1, 1, tzinfo=UTC)
    end = start + timedelta(hours=6)
    step = 60
    times = _times(start, 7, step)  # includes end
    # Visible for first 3 hours of hold (samples 0,1,2), invisible after.
    sun = np.array([5, 5, 5, -1, -1, -1, -1], dtype=float)
    earth = np.full(7, 1.0)
    summary, *_ = visibility.summarize(
        sun, earth, step, times=times, analysis_end_utc=end
    )
    assert summary.longest_sunlight_hours == pytest.approx(3.0)
    assert summary.longest_darkness_hours == pytest.approx(3.0)
    assert summary.sun_visibility_pct == pytest.approx(50.0)


def test_first_visible_last_invisible() -> None:
    start = datetime(2027, 2, 1, tzinfo=UTC)
    end = start + timedelta(hours=4)
    step = 60
    times = _times(start, 5, step)
    sun = np.array([5.0, -1.0, -1.0, -1.0, -1.0])
    earth = np.full(5, -2.0)
    summary, *_ = visibility.summarize(
        sun, earth, step, times=times, analysis_end_utc=end
    )
    assert summary.longest_sunlight_hours == pytest.approx(1.0)
    assert summary.longest_darkness_hours == pytest.approx(3.0)
    assert summary.longest_communication_gap_hours == pytest.approx(4.0)


def test_missing_samples_excluded_from_visible_and_invisible() -> None:
    start = datetime(2027, 3, 1, tzinfo=UTC)
    end = start + timedelta(hours=4)
    step = 60
    times = _times(start, 5, step)
    sun = np.array([5.0, np.nan, -1.0, 5.0, -1.0])
    earth = np.array([1.0, 1.0, 1.0, np.nan, -1.0])
    summary, sun_vis, earth_vis, _ = visibility.summarize(
        sun, earth, step, times=times, analysis_end_utc=end
    )
    # Valid paired hours: indices 0 (1h), 2 (1h), 4 (0h at end) → covered 2h
    assert summary.covered_hours == pytest.approx(2.0)
    assert summary.missing_fraction == pytest.approx(0.5)  # 2h missing of 4h hold sum
    # NaN must not extend darkness/visibility runs across the gap.
    assert summary.longest_sunlight_hours == pytest.approx(1.0)
    assert summary.longest_darkness_hours == pytest.approx(1.0)


def test_tied_sites_equal_scores() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    end = start + timedelta(hours=12)
    step = 60
    times = _times(start, 13, step)
    sun = np.full(13, 5.0)
    earth = np.full(13, -1.0)
    a, *_ = build_site_result(
        label="A",
        latitude_deg=-89.68,
        longitude_deg=-166.0,
        landing_site_id=None,
        times=times,
        sun_elevation=sun,
        earth_elevation=earth,
        step_minutes=step,
        weights={"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
        data_quality="EPHEMERIS_GEOMETRIC",
        analysis_end_utc=end,
    )
    b, *_ = build_site_result(
        label="B",
        latitude_deg=-89.44,
        longitude_deg=-141.8,
        landing_site_id=None,
        times=times,
        sun_elevation=sun.copy(),
        earth_elevation=earth.copy(),
        step_minutes=step,
        weights={"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
        data_quality="EPHEMERIS_GEOMETRIC",
        analysis_end_utc=end,
    )
    assert a.score == b.score
    assert a.metrics.longest_communication_gap_hours == pytest.approx(12.0)


def test_six_hour_sampling_window_clamp() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    end = start + timedelta(hours=48)
    step = 360
    times = _times(start, 9, step)
    sun = np.full(9, -1.0)
    earth = np.full(9, -1.0)
    summary, *_ = visibility.summarize(
        sun, earth, step, times=times, analysis_end_utc=end
    )
    assert summary.longest_darkness_hours == pytest.approx(48.0)
    assert summary.longest_communication_gap_hours == pytest.approx(48.0)


def test_sixty_minute_sampling() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    end = start + timedelta(hours=24)
    step = 60
    times = _times(start, 25, step)
    sun = np.array([5.0 if i < 10 else -1.0 for i in range(25)])
    earth = np.full(25, 1.0)
    summary, *_ = visibility.summarize(
        sun, earth, step, times=times, analysis_end_utc=end
    )
    assert summary.longest_sunlight_hours == pytest.approx(10.0)
    assert summary.longest_darkness_hours == pytest.approx(14.0)


def test_step_does_not_divide_window_partial_last_hold() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    end = start + timedelta(hours=10)  # 10h
    step = 360  # 6h
    # Samples at 0h, 6h — and optionally 12h beyond end if requested; we only use inside.
    times = [start, start + timedelta(hours=6), start + timedelta(hours=12)]
    sun = np.array([-1.0, -1.0, -1.0])
    earth = np.array([-1.0, -1.0, -1.0])
    hold = visibility.hold_hours_for_samples(times, step, end)
    assert hold.tolist() == pytest.approx([6.0, 4.0, 0.0])
    summary, *_ = visibility.summarize(
        sun, earth, step, times=times, analysis_end_utc=end
    )
    assert summary.longest_communication_gap_hours == pytest.approx(10.0)
    assert float(hold.sum()) == pytest.approx(10.0)


def test_single_sample_at_end_is_insufficient_cover() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    end = start + timedelta(hours=6)
    times = [end]  # only the exclusive endpoint
    sun = np.array([5.0])
    earth = np.array([5.0])
    hold = visibility.hold_hours_for_samples(times, 60, end)
    assert hold[0] == 0.0
    summary, *_ = visibility.summarize(
        sun, earth, 60, times=times, analysis_end_utc=end
    )
    assert summary.covered_hours == 0.0
    assert summary.longest_sunlight_hours == 0.0
    # No valid hold duration → percentage unavailable (not fabricated 0%).
    assert summary.sun_visibility_pct is None


def test_analysis_create_duration_helper() -> None:
    req = AnalysisCreate(
        mission_name="Dur",
        sites=[
            SiteInput(label="A", latitude_deg=-89.0, longitude_deg=0.0),
            SiteInput(label="B", latitude_deg=-88.0, longitude_deg=10.0),
        ],
        start_utc=datetime(2026, 12, 1, tzinfo=UTC),
        end_utc=datetime(2026, 12, 5, tzinfo=UTC),
        time_step_minutes=360,
        weights=DecisionWeights(),
    )
    assert req.analysis_duration_hours == pytest.approx(96.0)
    assert req.sample_count == 17


def test_interval_builder_clamps_end() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    end = start + timedelta(hours=12)
    step = 360
    times = _times(start, 3, step)  # 0, 6, 12(=end)
    mask = np.array([True, True, True])
    intervals = intervals_from_times(
        times, mask, step, True, analysis_end_utc=end
    )
    assert len(intervals) == 1
    assert intervals[0].duration_hours == pytest.approx(12.0)
    assert intervals[0].end_utc == end
