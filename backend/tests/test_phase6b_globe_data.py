"""Phase 6B — lunar globe coordinate helpers, seed provenance, globe API."""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from app.db.seed import APPROX, SEED_SITES
from app.integrations.nasa.horizons import build_observer_query
from app.science.lunar_projection import MOON_RADIUS_M
from app.science.lunar_sphere import (
    SOUTH_POLAR_LAT_MAX_DEG,
    cartesian_to_lonlat,
    is_south_polar,
    lonlat_to_cartesian,
    normalize_longitude_deg,
)
from app.services.globe_sites import EXPECTED_SEED_IDS, GLOBE_DISCLAIMER, KNOWN_LOLA_COVERAGE


# ---------------------------------------------------------------------------
# Longitude / pole conventions
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (0.0, 0.0),
        (180.0, 180.0),
        (-180.0, 180.0),
        (181.0, -179.0),
        (-181.0, 179.0),
        (540.0, 180.0),
        (-540.0, 180.0),
        (-166.0, -166.0),
        (129.78, 129.78),
    ],
)
def test_normalize_longitude_deg(raw: float, expected: float) -> None:
    assert normalize_longitude_deg(raw) == pytest.approx(expected, abs=1e-9)


def test_north_south_pole_cartesian() -> None:
    north = lonlat_to_cartesian(0.0, 90.0)
    south = lonlat_to_cartesian(123.0, -90.0)  # lon irrelevant at pole
    assert north.x_m == pytest.approx(0.0, abs=1e-6)
    assert north.y_m == pytest.approx(0.0, abs=1e-6)
    assert north.z_m == pytest.approx(MOON_RADIUS_M, rel=1e-12)
    assert south.x_m == pytest.approx(0.0, abs=1e-6)
    assert south.y_m == pytest.approx(0.0, abs=1e-6)
    assert south.z_m == pytest.approx(-MOON_RADIUS_M, rel=1e-12)


def test_prime_meridian_and_90e() -> None:
    p0 = lonlat_to_cartesian(0.0, 0.0)
    p90 = lonlat_to_cartesian(90.0, 0.0)
    assert p0.x_m == pytest.approx(MOON_RADIUS_M, rel=1e-12)
    assert p0.y_m == pytest.approx(0.0, abs=1e-6)
    assert p0.z_m == pytest.approx(0.0, abs=1e-6)
    assert p90.x_m == pytest.approx(0.0, abs=1e-6)
    assert p90.y_m == pytest.approx(MOON_RADIUS_M, rel=1e-12)
    assert p90.z_m == pytest.approx(0.0, abs=1e-6)


@pytest.mark.parametrize(
    ("lon", "lat"),
    [
        (0.0, 0.0),
        (-166.0, -89.68),
        (-141.8, -89.44),
        (129.78, -89.67),
        (180.0, -45.0),
        (-180.0, 45.0),
        (2.9, -86.0),
    ],
)
def test_coordinate_round_trip(lon: float, lat: float) -> None:
    cart = lonlat_to_cartesian(lon, lat)
    lon2, lat2, r = cartesian_to_lonlat(cart.x_m, cart.y_m, cart.z_m)
    assert r == pytest.approx(MOON_RADIUS_M, rel=1e-12)
    # ±180 antimeridian equivalence
    if abs(abs(lon) - 180.0) < 1e-9:
        assert abs(abs(lon2) - 180.0) < 1e-9
    else:
        assert lon2 == pytest.approx(normalize_longitude_deg(lon), abs=1e-9)
    assert lat2 == pytest.approx(lat, abs=1e-9)


def test_south_polar_classification() -> None:
    assert is_south_polar(-80.0)
    assert is_south_polar(-89.68)
    assert not is_south_polar(-79.9)
    assert SOUTH_POLAR_LAT_MAX_DEG == -80.0


# ---------------------------------------------------------------------------
# Seed catalog / provenance
# ---------------------------------------------------------------------------


def test_seed_ids_stable_and_approximate() -> None:
    ids = [str(s["id"]) for s in SEED_SITES]
    assert ids == list(EXPECTED_SEED_IDS)
    assert len(set(ids)) == len(ids)
    # Historical research points retained
    assert "shackleton-rim-a" in ids
    assert "connecting-ridge-b" in ids
    for s in SEED_SITES:
        assert float(s["latitude_deg"]) <= -80.0  # type: ignore[arg-type]
        assert "coordinate_source" in s and str(s["coordinate_source"]).strip()
        assert APPROX == "APPROXIMATE_REFERENCE"


def test_seed_coordinates_not_silently_changed() -> None:
    """Lock published demo lon/lat so globe work cannot drift Mission Planner inputs."""
    by_id = {str(s["id"]): s for s in SEED_SITES}
    assert by_id["shackleton-rim-a"]["latitude_deg"] == -89.68
    assert by_id["shackleton-rim-a"]["longitude_deg"] == -166.0
    assert by_id["connecting-ridge-b"]["latitude_deg"] == -89.44
    assert by_id["connecting-ridge-b"]["longitude_deg"] == -141.8
    assert by_id["shackleton-floor"]["latitude_deg"] == -89.67
    assert by_id["shackleton-floor"]["longitude_deg"] == 129.78


def test_known_lola_coverage_mapping() -> None:
    assert KNOWN_LOLA_COVERAGE["shackleton-rim-a"] == "Site04"
    assert KNOWN_LOLA_COVERAGE["connecting-ridge-b"] == "Site01"
    assert "shackleton-floor" not in KNOWN_LOLA_COVERAGE


# ---------------------------------------------------------------------------
# Horizons / Mission Planner compatibility
# ---------------------------------------------------------------------------


def test_horizons_site_coord_uses_same_seed_lonlat() -> None:
    from datetime import UTC, datetime

    q = build_observer_query(
        target="SUN",
        latitude_deg=-89.68,
        longitude_deg=-166.0,
        start_utc=datetime(2026, 12, 1, tzinfo=UTC),
        stop_utc=datetime(2026, 12, 2, tzinfo=UTC),
        step_minutes=60,
    )
    assert q["SITE_COORD"] == "'-166.000000,-89.680000,0.0000'"
    assert q["COORD_TYPE"] == "'GEODETIC'"
    assert q["CENTER"] == "'coord@301'"


# ---------------------------------------------------------------------------
# API: globe sites + existing sites/artemis contracts
# ---------------------------------------------------------------------------


def test_globe_sites_endpoint(client: TestClient) -> None:
    r = client.get("/api/v1/globe/sites")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == len(SEED_SITES)
    assert body["svs_glb_orientation_status"] == "GEOMETRY_AXES_MATCH_MOON_ME_UV_CAVEATS"
    assert "NOT official NASA" in body["disclaimer"] or "NOT official" in body["disclaimer"]
    assert GLOBE_DISCLAIMER.split(".")[0] in body["disclaimer"] or "APPROXIMATE_REFERENCE" in body["disclaimer"]
    assert body["related_endpoints"]["sites"] == "/api/v1/sites"
    assert body["related_endpoints"]["artemis_regions"] == "/api/v1/artemis/regions"

    ids = {item["id"] for item in body["items"]}
    assert ids == set(EXPECTED_SEED_IDS)
    for item in body["items"]:
        assert item["coordinate_status"] == "APPROXIMATE_REFERENCE"
        assert item["not_nasa_landing_recommendation"] is True
        assert item["south_polar"] is True
        assert item["geometric_analysis_supported"] is True
        assert item["coordinate_source"]
        cart = item["cartesian_me"]
        assert cart["frame"] == "MOON_ME_SPHERE_SCIENTIFIC"
        # Round-trip via scientific helpers
        lon2, lat2, _r = cartesian_to_lonlat(cart["x_m"], cart["y_m"], cart["z_m"])
        assert lat2 == pytest.approx(item["latitude_deg"], abs=1e-9)
        assert lon2 == pytest.approx(normalize_longitude_deg(item["longitude_deg"]), abs=1e-9)
        # Cartesian magnitude ≈ Moon radius
        mag = math.sqrt(cart["x_m"] ** 2 + cart["y_m"] ** 2 + cart["z_m"] ** 2)
        assert mag == pytest.approx(MOON_RADIUS_M, rel=1e-9)


def test_globe_data_not_misread_as_nasa_recommendation(client: TestClient) -> None:
    body = client.get("/api/v1/globe/sites").json()
    blob = str(body).lower()
    assert "not_nasa_landing_recommendation" in blob
    assert all(item["not_nasa_landing_recommendation"] is True for item in body["items"])
    assert "landing recommendation" in body["disclaimer"].lower() or "not official" in body["disclaimer"].lower()


def test_existing_sites_api_unchanged_ids(client: TestClient) -> None:
    body = client.get("/api/v1/sites").json()
    assert body["total"] == len(SEED_SITES)
    assert all(s["coordinate_status"] == "APPROXIMATE_REFERENCE" for s in body["items"])
    assert "East-positive" in body["longitude_convention"]
    assert "MOON_ME" in body["coordinate_frame"] or "planetocentric" in body["coordinate_frame"].lower()
    by_id = {s["id"]: s for s in body["items"]}
    assert by_id["shackleton-rim-a"]["longitude_deg"] == -166.0
    assert by_id["connecting-ridge-b"]["longitude_deg"] == -141.8


def test_artemis_regions_still_distinguish_historical_vs_current(client: TestClient) -> None:
    body = client.get("/api/v1/artemis/regions").json()
    assert body["historical_2022_count"] == 13
    assert body["current_2024_shortlist_count"] == 9
    assert all(reg["polygon"] is None for reg in body["regions"])
    assert "fabricate" in body["disclaimer"].lower() or "NOT" in body["disclaimer"]
    # Seed research points are NOT Artemis region IDs
    region_ids = {reg["id"] for reg in body["regions"]}
    assert "shackleton-rim-a" not in region_ids
    assert "connecting-ridge-b" not in region_ids
