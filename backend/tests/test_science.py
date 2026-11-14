from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pytest

from app.science import scoring, visibility
from app.science.synthetic import synthetic_elevations, time_grid
from app.services.cache_keys import analysis_cache_key


def test_visibility_mask_strictly_above_horizon_and_nan_is_not_visible() -> None:
    m = visibility.visibility_mask(np.array([-1.0, 0.0, 0.01, np.nan, 5.0]))
    assert m.tolist() == [False, False, True, False, True]


def test_visibility_mask_with_terrain_horizon() -> None:
    m = visibility.visibility_mask(np.array([1.0, 3.0]), np.array([2.0, 2.0]))
    assert m.tolist() == [False, True]


def test_runs_and_transitions() -> None:
    mask = np.array([1, 1, 0, 0, 0, 1, 0, 1, 1, 1], dtype=bool)
    assert visibility.runs(mask, True) == [(0, 2), (5, 6), (7, 10)]
    assert visibility.runs(mask, False) == [(2, 5), (6, 7)]
    assert visibility.runs(np.array([], dtype=bool)) == []


def test_longest_darkness_and_gap_hours() -> None:
    mask = np.array([1, 0, 0, 0, 1, 0, 1], dtype=bool)
    assert visibility.longest_run_hours(mask, 60, value=False) == 3.0
    assert visibility.longest_run_hours(mask, 30, value=True) == 0.5
    assert visibility.longest_run_hours(np.ones(4, dtype=bool), 60, value=False) == 0.0


def test_summarize_joint_is_intersection() -> None:
    sun = np.array([5, 5, -1, -1, 5, 5], dtype=float)
    earth = np.array([1, -1, 1, -1, 1, 1], dtype=float)
    s, sun_vis, earth_vis, joint = visibility.summarize(sun, earth, 60)
    assert joint.tolist() == [True, False, False, False, True, True]
    assert s.sun_visibility_pct == pytest.approx(200 / 3)
    assert s.joint_visibility_pct == 50.0
    assert s.longest_joint_visibility_hours == 2.0
    assert s.longest_communication_gap_hours == 1.0
    assert s.longest_darkness_hours == 2.0
    assert s.missing_fraction == 0.0


def test_summarize_rejects_mismatched_series() -> None:
    with pytest.raises(ValueError):
        visibility.summarize(np.zeros(3), np.zeros(4), 60)


def test_missing_data_fraction() -> None:
    s, *_ = visibility.summarize(np.array([1.0, np.nan]), np.array([1.0, 1.0]), 60)
    assert s.missing_fraction == 0.5
    assert not scoring.is_scorable("EPHEMERIS_GEOMETRIC", s.missing_fraction)
    assert not scoring.is_scorable("UNAVAILABLE", 0.0)
    assert scoring.is_scorable("EPHEMERIS_GEOMETRIC", 0.0)


def test_score_formula_default_weights() -> None:
    metrics = {"sun_visibility_pct": 80, "earth_visibility_pct": 50, "joint_visibility_pct": 40}
    score, contribs = scoring.score_site(
        metrics, {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20}
    )
    assert score == pytest.approx(0.4 * 80 + 0.4 * 50 + 0.2 * 40)
    assert sum(c.contribution for c in contribs) == pytest.approx(score)


@pytest.mark.parametrize(
    "weights",
    [
        {"sun_visibility": 50, "earth_visibility": 40, "joint_visibility": 20},
        {"sun_visibility": -10, "earth_visibility": 90, "joint_visibility": 20},
        {"sun_visibility": 100, "earth_visibility": 0},
    ],
)
def test_invalid_weights_rejected(weights: dict[str, float]) -> None:
    with pytest.raises(ValueError):
        scoring.validate_weights(weights)


def test_rank_dense_with_ties_and_missing() -> None:
    assert scoring.rank([50.0, 70.0, 50.0, None]) == [2, 1, 2, None]


def test_synthetic_model_ranges_and_determinism() -> None:
    t = time_grid(datetime(2026, 12, 1, tzinfo=UTC), datetime(2026, 12, 31, tzinfo=UTC), 60)
    assert len(t) == 30 * 24 + 1
    sun, earth = synthetic_elevations(-89.5, 0.0, t)
    # Near the pole the Sun stays within ~(1.54° + colatitude) of the horizon.
    assert np.all(np.abs(sun) <= 1.54 + 0.5 + 1e-6)
    assert np.all(np.abs(earth) <= 6.7 + 0.5 + 1e-6)
    sun2, _ = synthetic_elevations(-89.5, 0.0, t)
    assert np.array_equal(sun, sun2)


def test_equator_subsolar_point_is_overhead() -> None:
    from app.science.synthetic import _elevation

    assert float(_elevation(0.0, 0.0, 0.0, 0.0)) == pytest.approx(90.0)
    assert float(_elevation(-90.0, 0.0, 0.0, 0.0)) == pytest.approx(0.0, abs=1e-9)


def test_cache_key_stable_and_sensitive() -> None:
    base = dict(
        sites=[(-89.68, -166.0), (-89.44, -141.8)],
        start_utc=datetime(2026, 12, 1, tzinfo=UTC),
        end_utc=datetime(2026, 12, 15, tzinfo=UTC),
        time_step_minutes=60,
        horizon_model="GEOMETRIC",
        algorithm_version="1",
        data_source_version="horizons-x",
    )
    k1 = analysis_cache_key(**base)  # type: ignore[arg-type]
    k2 = analysis_cache_key(**{**base, "sites": list(reversed(base["sites"]))})  # type: ignore[arg-type,dict-item]
    assert k1 == k2  # site order does not matter
    for change in ({"time_step_minutes": 30}, {"horizon_model": "TERRAIN"}, {"algorithm_version": "2"}):
        assert analysis_cache_key(**{**base, **change}) != k1  # type: ignore[arg-type]


def test_synthetic_anchor_roughly_matches_horizons_fixture() -> None:
    """The demo model is anchored to the real 2026-12-01 Horizons sample (±0.3°)."""
    t = time_grid(datetime(2026, 12, 1, tzinfo=UTC), datetime(2026, 12, 1, tzinfo=UTC), 60)
    sun, earth = synthetic_elevations(-89.68, -166.0, t)
    assert abs(float(sun[0]) - 1.492078) < 0.3
    assert abs(float(earth[0]) - (-1.927529)) < 0.3
