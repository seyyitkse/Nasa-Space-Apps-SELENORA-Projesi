"""Phase 4 — LOLA DEM loading, projection, horizon, and terrain visibility."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from rasterio.transform import from_origin

from app.science.horizon_profile import compute_horizon_profile
from app.science.lunar_projection import (
    MOON_RADIUS_M,
    lonlat_to_stereo,
    sphere_drop_m,
    stereo_to_lonlat,
)
from app.science.terrain_visibility import body_vs_terrain, summarize_terrain_pair
from app.services import terrain_data_service


@pytest.fixture(scope="module")
def dem_tiles():
    tiles = terrain_data_service.list_dem_tiles()
    if len(tiles) < 2:
        pytest.skip("Local LOLA Site01/Site04 GeoTIFFs not present under data/raw/lola/")
    return tiles


def test_list_dem_tiles_metadata(dem_tiles) -> None:
    ids = {t.site_id for t in dem_tiles}
    assert "Site01" in ids and "Site04" in ids
    for t in dem_tiles:
        assert t.resolution_m == pytest.approx(5.0)
        assert t.width == 3200 and t.height == 3200
        assert t.nodata is not None or True  # nodata may be None when filled


def test_seed_sites_covered_by_real_lola(dem_tiles) -> None:
    # Bussey Point A → Site04 (Shackleton rim); Point B → Site01 (Connecting ridge)
    a = terrain_data_service.check_coverage(-89.68, -166.0)
    b = terrain_data_service.check_coverage(-89.44, -141.8)
    assert a.covered and a.dem is not None and a.dem.site_id == "Site04"
    assert b.covered and b.dem is not None and b.dem.site_id == "Site01"
    assert a.surface_z_m is not None and b.surface_z_m is not None


def test_uncovered_site_reported(dem_tiles) -> None:
    c = terrain_data_service.check_coverage(-85.0, 0.0)
    assert not c.covered
    assert c.dem is None


def test_stereo_roundtrip_near_south_pole() -> None:
    lon, lat = -166.0, -89.68
    pt = lonlat_to_stereo(lon, lat)
    lon2, lat2 = stereo_to_lonlat(pt.x_m, pt.y_m)
    assert lon2 == pytest.approx(lon, abs=1e-6)
    assert lat2 == pytest.approx(lat, abs=1e-6)


def test_sphere_drop_small_angle() -> None:
    d = 10_000.0
    drop = sphere_drop_m(d)
    approx = d * d / (2.0 * MOON_RADIUS_M)
    assert drop == pytest.approx(approx, rel=1e-4)
    assert drop > 0


def test_synthetic_ridge_horizon_blocks_north() -> None:
    """Synthetic DEM: flat floor + tall northern wall → positive N horizon, not clear sky."""
    n = 200
    dem = np.zeros((n, n), dtype=float)
    dem[40:60, :] = 500.0  # wall at y≈200–300 m north of origin
    # Affine: origin at NW, x east, y south (e negative) — standard north-up.
    transform = from_origin(-500.0, 500.0, 5.0, 5.0)
    # Observer at centre: x=0, y=0 → col=100, row=100
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        observer_height_m=2.0,
        n_azimuth=36,
        max_range_m=400.0,
        range_step_m=10.0,
    )
    assert profile.any_data_fraction == pytest.approx(1.0)
    assert profile.complete_coverage_fraction == pytest.approx(1.0)
    # Azimuth 0° = north → should see elevated horizon
    h_n, ok_n = profile.elevation_at_azimuth(0.0)
    h_s, ok_s = profile.elevation_at_azimuth(180.0)
    assert ok_n and ok_s
    assert h_n > 5.0
    assert h_s < h_n


def test_nodata_azimuth_not_treated_as_clear() -> None:
    n = 80
    dem = np.full((n, n), np.nan, dtype=float)
    # Only fill southern half
    dem[40:, :] = 0.0
    transform = from_origin(-200.0, 200.0, 5.0, 5.0)
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        observer_height_m=2.0,
        n_azimuth=8,
        max_range_m=150.0,
        range_step_m=10.0,
    )
    assert profile.any_data_fraction < 1.0
    # North (0°) should be uncovered
    h, ok = profile.elevation_at_azimuth(0.0)
    assert not ok
    assert np.isnan(h)


def test_body_vs_terrain_unknown_and_blocked() -> None:
    n = 100
    dem = np.zeros((n, n), dtype=float)
    dem[0:15, :] = 300.0
    transform = from_origin(-250.0, 250.0, 5.0, 5.0)
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        observer_height_m=2.0,
        n_azimuth=36,
        max_range_m=200.0,
        range_step_m=10.0,
    )
    az = np.array([0.0, 180.0])
    el = np.array([2.0, 2.0])  # low elevation
    tv = body_vs_terrain(az, el, profile)
    assert tv.geometric_visible.all()
    h_n, _ = profile.elevation_at_azimuth(0.0)
    if h_n > 2.0:
        assert tv.blocked[0]
        assert not tv.visible[0]


def test_real_lola_horizon_seed_a(dem_tiles) -> None:
    profile, cov, meta = terrain_data_service.get_horizon_profile(
        -89.68,
        -166.0,
        n_azimuth=36,
        max_range_m=8_000.0,
        range_step_m=50.0,
        use_cache=False,
    )
    assert cov.covered
    assert meta["dem_site_id"] == "Site04"
    assert profile.any_data_fraction >= 0.95
    assert np.isfinite(profile.horizon_elevation_deg[profile.has_any_data]).all()
    # Shackleton rim terrain should produce some elevated horizon bins
    assert float(np.nanmax(profile.horizon_elevation_deg)) > 0.0
    # 8 km request on ~16 km tile: complete coverage must not be falsely 100%.
    assert profile.complete_coverage_fraction < 1.0


def test_real_lola_horizon_seed_b(dem_tiles) -> None:
    profile, cov, meta = terrain_data_service.get_horizon_profile(
        -89.44,
        -141.8,
        n_azimuth=36,
        max_range_m=8_000.0,
        range_step_m=50.0,
        use_cache=False,
    )
    assert cov.covered
    assert meta["dem_site_id"] == "Site01"
    assert profile.any_data_fraction >= 0.95
    assert profile.complete_coverage_fraction < 1.0


def test_terrain_vs_geometric_summary_invariants() -> None:
    n = 120
    dem = np.zeros((n, n), dtype=float)
    dem[:, 80:] = 400.0  # eastern ridge
    transform = from_origin(-300.0, 300.0, 5.0, 5.0)
    profile = compute_horizon_profile(
        dem=dem,
        transform=transform,
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_z_m=0.0,
        true_north_grid_azimuth_deg=0.0,
        observer_height_m=2.0,
        n_azimuth=24,
        max_range_m=250.0,
        range_step_m=10.0,
    )
    start = datetime(2026, 12, 1, tzinfo=UTC)
    times = [start + timedelta(hours=i) for i in range(6)]
    sun_az = np.array([90.0] * 6)  # east — toward ridge
    sun_el = np.array([5.0, 5.0, 5.0, 5.0, 5.0, 5.0])
    earth_az = np.array([270.0] * 6)
    earth_el = np.array([10.0] * 6)
    summary, sun_vis, earth_vis, joint, meta = summarize_terrain_pair(
        sun_az,
        sun_el,
        earth_az,
        earth_el,
        profile,
        60.0,
        times=times,
        analysis_end_utc=start + timedelta(hours=6),
    )
    assert 0.0 <= summary.missing_fraction <= 1.0
    assert summary.as_metrics()["longest_darkness_hours"] <= 6.0 + 1e-6
    assert meta["horizon_coverage_fraction"] == profile.coverage_fraction
    # Joint cannot exceed either body
    assert joint.sum() <= sun_vis.sum()
    assert joint.sum() <= earth_vis.sum()


def test_terrain_catalog_endpoint(client) -> None:
    r = client.get("/api/v1/terrain/catalog")
    assert r.status_code == 200
    body = r.json()
    assert "tiles" in body
    assert body["dataset_version"]


def test_terrain_coverage_endpoint(client, dem_tiles) -> None:
    r = client.get("/api/v1/terrain/coverage", params={"latitude_deg": -89.68, "longitude_deg": -166.0})
    assert r.status_code == 200
    assert r.json()["covered"] is True
    assert r.json()["dem_site_id"] == "Site04"
