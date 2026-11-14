"""Phase 4.1 — true-north convergence, coverage audit, VISIBLE/BLOCKED/UNKNOWN."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from rasterio.transform import from_origin

from app.science.horizon_profile import compute_horizon_profile
from app.science.lunar_projection import (
    grid_bearing_for_true_azimuth,
    lonlat_to_stereo,
    stereo_offsets_for_true_azimuth,
    true_north_grid_azimuth_deg,
)
from app.science.terrain_visibility import TerrainVisState, body_vs_terrain, classify_sample
from app.services import terrain_data_service


@pytest.mark.parametrize(
    ("lat", "lon", "expected"),
    [
        (-89.68, -166.0, 194.0),
        (-89.44, -141.8, 218.2),
        (-89.5, 0.0, 0.0),
        (-89.5, 90.0, 90.0),
        (-89.5, -90.0, 270.0),
    ],
)
def test_true_north_grid_azimuth_matches_reference(lat: float, lon: float, expected: float) -> None:
    gamma = true_north_grid_azimuth_deg(lon, lat)
    assert gamma == pytest.approx(expected, abs=0.05)
    assert gamma == pytest.approx(lon % 360.0, abs=0.05)


def test_nonzero_longitude_convergence_points_a_b() -> None:
    a = true_north_grid_azimuth_deg(-166.0, -89.68)
    b = true_north_grid_azimuth_deg(-141.8, -89.44)
    assert a != 0.0 and b != 0.0
    assert a == pytest.approx(194.0, abs=0.05)
    assert b == pytest.approx(218.2, abs=0.05)


def test_cardinal_true_azimuths_map_to_expected_grid_bearings() -> None:
    gamma = true_north_grid_azimuth_deg(-166.0, -89.68)
    assert grid_bearing_for_true_azimuth(0.0, gamma) == pytest.approx(194.0, abs=0.05)
    assert grid_bearing_for_true_azimuth(90.0, gamma) == pytest.approx(284.0, abs=0.05)
    assert grid_bearing_for_true_azimuth(180.0, gamma) == pytest.approx(14.0, abs=0.05)
    assert grid_bearing_for_true_azimuth(270.0, gamma) == pytest.approx(104.0, abs=0.05)


def test_true_north_ray_moves_toward_equator_along_meridian() -> None:
    lon, lat = -166.0, -89.68
    gamma = true_north_grid_azimuth_deg(lon, lat)
    p0 = lonlat_to_stereo(lon, lat)
    dx, dy = stereo_offsets_for_true_azimuth(0.0, 1000.0, gamma)
    # Geographic north increases latitude (away from south pole) → larger stereo radius.
    r0 = (p0.x_m**2 + p0.y_m**2) ** 0.5
    r1 = ((p0.x_m + dx) ** 2 + (p0.y_m + dy) ** 2) ** 0.5
    assert r1 > r0


def _flat_dem(n: int = 200, half_m: float = 500.0, z: float = 0.0):
    dem = np.full((n, n), z, dtype=float)
    transform = from_origin(-half_m, half_m, (2 * half_m) / n, (2 * half_m) / n)
    return dem, transform


def test_truncated_ray_is_incomplete_not_clear_sky() -> None:
    # DEM only ±200 m; request 500 m → every ray incomplete.
    dem, transform = _flat_dem(n=80, half_m=200.0, z=0.0)
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        observer_height_m=2.0,
        n_azimuth=8,
        max_range_m=500.0,
        range_step_m=25.0,
    )
    assert profile.any_data_fraction == pytest.approx(1.0)
    assert profile.complete_coverage_fraction == pytest.approx(0.0)
    assert np.all(profile.valid_range_m[profile.has_any_data] < 500.0)


def test_full_coverage_when_dem_contains_requested_range() -> None:
    dem, transform = _flat_dem(n=400, half_m=800.0, z=0.0)
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        observer_height_m=2.0,
        n_azimuth=8,
        max_range_m=400.0,
        range_step_m=25.0,
    )
    assert profile.complete_coverage_fraction == pytest.approx(1.0)


def test_near_blocker_is_blocked_even_if_ray_incomplete() -> None:
    dem, transform = _flat_dem(n=120, half_m=300.0, z=0.0)
    # Tall wall just north of observer (true north = +Y when gamma=0).
    # Rows near top of array (y≈+250).
    dem[0:15, :] = 200.0
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        observer_height_m=2.0,
        n_azimuth=36,
        max_range_m=800.0,  # beyond DEM → incomplete
        range_step_m=10.0,
    )
    lookup = profile.lookup(0.0)
    assert lookup.has_any_data
    assert not lookup.complete_coverage
    assert lookup.horizon_elevation_deg > 5.0
    assert classify_sample(2.0, lookup) is TerrainVisState.BLOCKED
    assert classify_sample(80.0, lookup) is TerrainVisState.UNKNOWN  # clear of wall but incomplete


def test_visible_requires_complete_coverage() -> None:
    dem, transform = _flat_dem(n=400, half_m=800.0, z=0.0)
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        observer_height_m=2.0,
        n_azimuth=8,
        max_range_m=400.0,
        range_step_m=25.0,
    )
    lookup = profile.lookup(90.0)
    assert lookup.complete_coverage
    # Flat DEM: horizon near 0° or slightly negative (eye height).
    assert classify_sample(5.0, lookup) is TerrainVisState.VISIBLE


def test_nodata_prefix_yields_unknown() -> None:
    dem = np.full((80, 80), np.nan, dtype=float)
    transform = from_origin(-200.0, 200.0, 5.0, 5.0)
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        n_azimuth=8,
        max_range_m=150.0,
        range_step_m=10.0,
    )
    assert profile.any_data_fraction == pytest.approx(0.0)
    tv = body_vs_terrain(np.array([0.0]), np.array([10.0]), profile)
    assert tv.unknown[0] and not tv.visible[0] and not tv.blocked[0]


def test_real_lola_12km_complete_coverage_is_partial() -> None:
    tiles = terrain_data_service.list_dem_tiles()
    if len(tiles) < 2:
        pytest.skip("Local LOLA GeoTIFFs missing")
    for lat, lon in [(-89.68, -166.0), (-89.44, -141.8)]:
        profile, _, meta = terrain_data_service.get_horizon_profile(
            lat, lon, max_range_m=12_000.0, n_azimuth=36, use_cache=False
        )
        assert meta["true_north_grid_azimuth_deg"] == pytest.approx(
            true_north_grid_azimuth_deg(lon, lat), abs=0.05
        )
        assert profile.any_data_fraction >= 0.8
        # 16×16 km tiles cannot complete 12 km in every direction.
        assert profile.complete_coverage_fraction < 0.5
        assert float(np.min(profile.valid_range_m[profile.has_any_data])) < 12_000.0


def test_cardinal_directions_on_real_sites() -> None:
    tiles = terrain_data_service.list_dem_tiles()
    if len(tiles) < 2:
        pytest.skip("Local LOLA GeoTIFFs missing")
    for lat, lon in [(-89.68, -166.0), (-89.44, -141.8)]:
        profile, _, _ = terrain_data_service.get_horizon_profile(
            lat, lon, max_range_m=5_000.0, n_azimuth=72, use_cache=False
        )
        for az in (0.0, 90.0, 180.0, 270.0):
            lookup = profile.lookup(az)
            assert lookup.has_any_data
            assert np.isfinite(lookup.horizon_elevation_deg)
            assert lookup.valid_range_m > 0


def test_partial_coverage_refuses_deterministic_score() -> None:
    from app.science import scoring

    assert not scoring.is_scorable("LOCAL_TERRAIN_PARTIAL", 0.0)
    assert scoring.is_scorable("EPHEMERIS_GEOMETRIC", 0.0)
    assert scoring.is_scorable("EPHEMERIS_TERRAIN", 0.0)
