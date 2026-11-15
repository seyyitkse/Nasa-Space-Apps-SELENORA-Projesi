"""Phase 7D MVP — multi-resolution DEM mesh fallback (visualization only).

Does not alter TERRAIN horizon scoring. Hillshade must never be treated as
physical elevation. Remote Product 90 probes are marked ``live``.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.services import dem_mesh_resolver, nasa_layer_catalog, raster_preview_service
from app.services.raster_preview_service import LayerUnavailableError, MapServiceError


def test_product90_elevation_layers_are_catalogued() -> None:
    ids = {layer.id for layer in nasa_layer_catalog.list_layers()}
    for lid in (
        "ldem-80s-20mpp",
        "ldem-80s-40mpp",
        "ldem-80s-80mpp",
        "ldem-75s-30mpp",
        "ldem-60s-60mpp",
        "ldem-60s-120mpp",
        "ldem-60s-240mpp",
    ):
        assert lid in ids
        layer = nasa_layer_catalog.get_layer(lid)
        assert layer is not None
        assert layer.kind == "elevation"
        assert layer.access_mode == "vsicurl_window"
        assert layer.accept_ranges is True
        assert layer.source_url and layer.source_url.endswith(".TIF")
        assert "pgda.gsfc.nasa.gov/data/LOLA_20mpp/" in layer.source_url


def test_hillshade_rejected_for_mesh_elevation() -> None:
    with pytest.raises(MapServiceError, match="physical elevation|elevation mesh"):
        raster_preview_service.build_mesh(
            latitude_deg=-88.5,
            longitude_deg=0.0,
            half_extent_m=500,
            step_m=100,
            layer_id="ldem-80s-80mpp-hill",
        )


def test_auto_prefers_local_5mpp_when_covered() -> None:
    from app.services import terrain_data_service

    if not terrain_data_service.list_dem_tiles():
        pytest.skip("Local LOLA tiles missing")
    resolved = dem_mesh_resolver.resolve_elevation_for_mesh(
        -89.68,
        -166.0,
        step_m=50,
        layer_id="auto",
    )
    assert resolved.coverage_tier == "LOCAL_5MPP"
    assert resolved.native_resolution_m == pytest.approx(5.0)
    assert resolved.layer.id.startswith("lola-site")
    assert resolved.surface_z_m is not None


def test_remote_ladder_skips_overfine_and_large_first_pass() -> None:
    compact = dem_mesh_resolver._remote_candidates(
        latitude_deg=-88.5, step_m=50.0, include_large=False
    )
    ids = [layer.id for layer in compact]
    assert "ldem-80s-20mpp" not in ids  # finer than 0.5 * step
    assert "ldem-75s-30mpp" not in ids  # multi-GB, deferred
    assert "ldem-80s-40mpp" in ids
    assert "ldem-80s-80mpp" in ids
    assert ids == sorted(ids, key=lambda i: nasa_layer_catalog.get_layer(i).resolution_m)  # type: ignore[union-attr]


def test_mesh_auto_schema_includes_provenance(client: TestClient) -> None:
    from app.services import terrain_data_service

    if not terrain_data_service.list_dem_tiles():
        pytest.skip("Local LOLA tiles missing")
    r = client.get(
        "/api/v1/maps/mesh",
        params={
            "latitude_deg": -89.68,
            "longitude_deg": -166.0,
            "half_extent_m": 500,
            "step_m": 50,
            "layer_id": "auto",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["coverage_tier"] == "LOCAL_5MPP"
    assert body["native_resolution_m"] == pytest.approx(5.0)
    assert body["surface_z_m"] is not None
    assert body["product_page"]
    assert body["kind"] == "elevation"
    assert "fabricated" in body["warning"].lower() or "never fabricated" in body["warning"].lower()


def test_horizon_engine_unchanged_outside_local_tiles(client: TestClient) -> None:
    """Phase 7D must not silently invent TERRAIN horizons outside Product 78 tiles."""
    r = client.get(
        "/api/v1/terrain/horizon-profile",
        params={
            "latitude_deg": -88.5,
            "longitude_deg": 0.0,
            "n_azimuth": 16,
            "max_range_m": 2000,
        },
    )
    assert r.status_code in {404, 422, 503}
    body = r.json()
    assert body["error"]["code"] == "TERRAIN_UNAVAILABLE"
    assert "5 m" in body["error"]["message"] or "LOLA" in body["error"]["message"]


def test_resolver_preserves_unavailable_when_remote_fails() -> None:
    dem_mesh_resolver.clear_resolver_caches()

    def boom(*_a, **_k):
        return None

    with patch.object(dem_mesh_resolver, "_cached_remote_hit", side_effect=boom):
        with pytest.raises(LayerUnavailableError, match="does not invent"):
            dem_mesh_resolver.resolve_elevation_for_mesh(
                -88.5,
                0.0,
                step_m=100,
                layer_id="auto",
                allow_remote=True,
            )


@pytest.mark.live
def test_live_remote_mesh_outside_5m_coverage(client: TestClient) -> None:
    """Custom point outside Site01/04 — must return real Product 90 elevations."""
    dem_mesh_resolver.clear_resolver_caches()
    r = client.get(
        "/api/v1/maps/mesh",
        params={
            "latitude_deg": -88.5,
            "longitude_deg": 0.0,
            "half_extent_m": 1000,
            "step_m": 100,
            "layer_id": "auto",
        },
        timeout=180.0,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["coverage_tier"] == "REMOTE_PGDA90"
    assert body["kind"] == "elevation"
    assert body["native_resolution_m"] is not None
    assert body["native_resolution_m"] >= 40.0
    assert body["surface_z_m"] is not None
    assert abs(body["surface_z_m"]) > 1.0  # real LOLA height, not zero filler
    flat = [v for row in body["z_m"] for v in row if v is not None]
    assert len(flat) > 10
    assert body["nodata_fraction"] < 1.0
    assert "pgda.gsfc.nasa.gov/products/90" in (body.get("product_page") or "")
