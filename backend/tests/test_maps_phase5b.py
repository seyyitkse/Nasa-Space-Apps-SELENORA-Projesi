"""Phase 5B — map catalog, local previews, Artemis regions, horizon profile API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services import nasa_layer_catalog, raster_preview_service
from app.services.artemis_regions import catalog as artemis_catalog


def test_layer_catalog_separates_science_and_viz_roles() -> None:
    layers = nasa_layer_catalog.list_layers()
    roles = {layer.id: layer.role for layer in layers}
    assert roles["lola-site04-5mpp-surf"] == "SCIENCE_VALIDATED_LOCAL"
    assert roles["ldem-80s-80mpp-hill"] == "MAP_VISUALIZATION_ONLY"
    assert roles["moon-trek"] == "REFERENCE_DOC"
    hill = nasa_layer_catalog.get_layer("ldem-80s-80mpp-hill")
    assert hill is not None
    assert hill.approx_bytes == 88_474_342
    assert hill.accept_ranges is True


def test_maps_layers_endpoint(client: TestClient) -> None:
    r = client.get("/api/v1/maps/layers")
    assert r.status_code == 200
    body = r.json()
    assert "scientific_note" in body
    ids = {item["id"] for item in body["items"]}
    assert "lola-site01-5mpp-surf" in ids
    assert "ldem-80s-80mpp" in ids


def test_artemis_regions_have_no_fabricated_polygons(client: TestClient) -> None:
    r = client.get("/api/v1/artemis/regions")
    assert r.status_code == 200
    body = r.json()
    assert body["geometry"] is None
    assert body["geometry_status"] == "UNAVAILABLE_OFFICIAL_POLYGONS_NOT_DIGITIZED"
    names = {reg["name"] for reg in body["regions"]}
    assert "Connecting Ridge" in names
    assert "Malapert Massif" in names
    assert all(reg["polygon"] is None for reg in body["regions"])
    # Sanity vs module catalog
    assert len(artemis_catalog()["regions"]) == len(body["regions"])


def test_local_preview_png_for_site04(client: TestClient) -> None:
    from app.services import terrain_data_service

    if not terrain_data_service.list_dem_tiles():
        pytest.skip("Local LOLA tiles missing")
    r = client.get(
        "/api/v1/maps/preview",
        params={
            "layer_id": "lola-site04-5mpp-surf",
            "latitude_deg": -89.68,
            "longitude_deg": -166.0,
            "half_extent_m": 2000,
            "max_edge_px": 128,
        },
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("image/png")
    assert r.headers["X-SELENORA-Layer-Role"] == "SCIENCE_VALIDATED_LOCAL"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_preview_rejects_oversized_window(client: TestClient) -> None:
    r = client.get(
        "/api/v1/maps/preview",
        params={
            "layer_id": "lola-site04-5mpp-surf",
            "latitude_deg": -89.68,
            "longitude_deg": -166.0,
            # Above Phase 5F polar-overview cap (400 km half-extent).
            "half_extent_m": 500_000,
        },
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "MAP_SERVICE_ERROR"


def test_preview_allows_polar_overview_window(client: TestClient) -> None:
    """Coarse south-polar context: half-extent up to 400 km must be accepted."""
    from app.services import terrain_data_service

    if not terrain_data_service.list_dem_tiles():
        pytest.skip("Local LOLA tiles missing")
    r = client.get(
        "/api/v1/maps/preview",
        params={
            "layer_id": "lola-site04-5mpp-surf",
            "latitude_deg": -89.68,
            "longitude_deg": -166.0,
            "half_extent_m": 200_000,
            "max_edge_px": 128,
        },
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("image/png")
    left, bottom, right, top = (float(x) for x in r.headers["X-SELENORA-Bounds-M"].split(","))
    assert (right - left) > 0 and (top - bottom) > 0


def test_elevation_sample_local(client: TestClient) -> None:
    from app.services import terrain_data_service

    if not terrain_data_service.list_dem_tiles():
        pytest.skip("Local LOLA tiles missing")
    r = client.get(
        "/api/v1/maps/elevation",
        params={
            "layer_id": "lola-site04-5mpp-surf",
            "latitude_deg": -89.68,
            "longitude_deg": -166.0,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["covered"] is True
    assert body["value"] is not None
    assert body["role"] == "SCIENCE_VALIDATED_LOCAL"


def test_horizon_profile_endpoint(client: TestClient) -> None:
    from app.services import terrain_data_service

    if not terrain_data_service.list_dem_tiles():
        pytest.skip("Local LOLA tiles missing")
    r = client.get(
        "/api/v1/terrain/horizon-profile",
        params={
            "latitude_deg": -89.68,
            "longitude_deg": -166.0,
            "n_azimuth": 36,
            "max_range_m": 5000,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["true_north_grid_azimuth_deg"] == pytest.approx(194.0, abs=0.05)
    assert len(body["bins"]) == 36
    assert body["scientific_role"] == "SCIENCE_VALIDATED_LOCAL"
    assert "complete_coverage_fraction" in body


def test_mesh_size_guard() -> None:
    with pytest.raises(raster_preview_service.MapServiceError):
        raster_preview_service.build_mesh(
            latitude_deg=-89.68,
            longitude_deg=-166.0,
            half_extent_m=5000,
            step_m=10,
        )


def test_documentation_layer_cannot_preview(client: TestClient) -> None:
    r = client.get(
        "/api/v1/maps/preview",
        params={
            "layer_id": "moon-trek",
            "latitude_deg": -89.5,
            "longitude_deg": 0.0,
        },
    )
    assert r.status_code == 400


@pytest.mark.live
def test_live_vsicurl_hillshade_preview(client: TestClient) -> None:
    """Remote Product 90 hillshade window — network required."""
    r = client.get(
        "/api/v1/maps/preview",
        params={
            "layer_id": "ldem-80s-80mpp-hill",
            "latitude_deg": -89.5,
            "longitude_deg": 0.0,
            "half_extent_m": 20_000,
            "max_edge_px": 128,
        },
    )
    assert r.status_code == 200, r.text
    assert r.headers["X-SELENORA-Layer-Role"] == "MAP_VISUALIZATION_ONLY"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
