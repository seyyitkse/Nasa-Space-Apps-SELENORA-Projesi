"""H1 regression: UNKNOWN must not become darkness; separate Sun/Earth denominators."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from app.science import visibility as vis
from app.services.result_builder import intervals_from_times


def test_separate_denominators_when_peer_is_unknown() -> None:
    # Sun VISIBLE, Earth UNKNOWN / Sun BLOCKED, Earth VISIBLE / Sun UNKNOWN, Earth BLOCKED /
    # Sun VISIBLE, Earth VISIBLE
    sun = np.array([1.0, -1.0, np.nan, 1.0])
    earth = np.array([np.nan, 1.0, -1.0, 1.0])
    s, sun_vis, earth_vis, joint = vis.summarize(sun, earth, 60)

    assert s.sun_visibility_pct == pytest.approx(200 / 3)  # 2 of 3 sun-valid
    assert s.earth_visibility_pct == pytest.approx(200 / 3)  # 2 of 3 earth-valid
    assert s.joint_visibility_pct == pytest.approx(50.0)  # 1 of 2 both-known
    assert sun_vis.tolist() == [True, False, False, True]
    assert earth_vis.tolist() == [False, True, False, True]
    assert joint.tolist() == [False, False, False, True]
    # Darkness is BLOCKED only (index 1), never UNKNOWN (index 2) or VISIBLE-with-UNKNOWN-peer (0).
    assert s.longest_darkness_hours == pytest.approx(1.0)


def test_all_unknown_percentages_are_null_not_zero() -> None:
    sun = np.full(4, np.nan)
    earth = np.full(4, np.nan)
    s, sun_vis, earth_vis, joint = vis.summarize(sun, earth, 60)
    assert s.sun_visibility_pct is None
    assert s.earth_visibility_pct is None
    assert s.joint_visibility_pct is None
    assert s.longest_darkness_hours == 0.0
    assert s.longest_communication_gap_hours == 0.0
    assert not sun_vis.any()
    assert not earth_vis.any()
    assert not joint.any()


def test_all_unknown_not_scorable() -> None:
    from app.science import scoring

    sun = np.full(3, np.nan)
    earth = np.full(3, np.nan)
    s, *_ = vis.summarize(sun, earth, 60)
    assert not scoring.metrics_are_scorable(s.as_metrics())


def test_all_visible_percentages_are_100() -> None:
    sun = np.array([5.0, 5.0, 5.0, 5.0])
    earth = np.array([3.0, 3.0, 3.0, 3.0])
    s, sun_vis, earth_vis, joint = vis.summarize(sun, earth, 60)
    assert s.sun_visibility_pct == pytest.approx(100.0)
    assert s.earth_visibility_pct == pytest.approx(100.0)
    assert s.joint_visibility_pct == pytest.approx(100.0)
    assert sun_vis.all() and earth_vis.all() and joint.all()
    assert s.longest_darkness_hours == 0.0


def test_darkness_windows_exclude_unknown() -> None:
    start = datetime(2026, 12, 1, tzinfo=UTC)
    times = [start + timedelta(hours=i) for i in range(4)]
    end = start + timedelta(hours=4)
    sun = np.array([1.0, -1.0, np.nan, 1.0])
    _s, sun_vis, _e, _j = vis.summarize(sun, np.array([np.nan, 1.0, -1.0, 1.0]), 60, times=times, analysis_end_utc=end)
    # Pre-H1 bug: known_sun & ~sun_vis → [True, True, False, False]
    # Correct: blocked only among sun-valid
    _vis, sun_blocked, _valid = vis.classify_visibility(sun)
    assert sun_blocked.tolist() == [False, True, False, False]
    windows = intervals_from_times(times, sun_blocked, 60, True, analysis_end_utc=end)
    assert len(windows) == 1
    assert windows[0].duration_hours == pytest.approx(1.0)
    # Ensure the old incorrect mask would have been longer — regression guard.
    bad_mask = (~np.isnan(sun)) & (~sun_vis)
    # After fix sun_vis[0] is True, so even the old formula is shorter; assert blocked path.
    assert bad_mask.tolist() == [False, True, False, False]


def test_partial_unknown_sun_does_not_zero_earth() -> None:
    sun = np.array([np.nan, np.nan, 5.0, 5.0])
    earth = np.array([2.0, 2.0, 2.0, -1.0])
    s, *_ = vis.summarize(sun, earth, 60)
    assert s.sun_visibility_pct == pytest.approx(100.0)  # 2/2 sun-valid visible
    assert s.earth_visibility_pct == pytest.approx(75.0)  # 3/4 earth-valid visible
    assert s.joint_visibility_pct == pytest.approx(50.0)  # 1/2 both-known joint
