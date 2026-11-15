"""Phase 5E — epochs API, Artemis provenance, imagery allow-list, mesh schema."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.services import imagery_service
from app.services.epochs_service import _geometric_state, _joint
from tests.test_analysis_service import FakeHorizons


def test_geometric_and_joint_state_helpers() -> None:
    assert _geometric_state(1.0) == "VISIBLE"
    assert _geometric_state(0.0) == "BLOCKED"
    assert _geometric_state(-1.0) == "BLOCKED"
    assert _geometric_state(None) == "UNKNOWN"
    assert _geometric_state(float("nan")) == "UNKNOWN"
    assert _joint("VISIBLE", "VISIBLE") == "VISIBLE"
    assert _joint("VISIBLE", "BLOCKED") == "NOT_VISIBLE"
    assert _joint("UNKNOWN", "VISIBLE") == "UNKNOWN"
    assert _joint("BLOCKED", "UNKNOWN") == "UNKNOWN"


def test_epochs_endpoint_from_stored_geometric_analysis(client: TestClient) -> None:
    from app.api.deps import horizons_client

    app = client.app
    fake = FakeHorizons()
    app.dependency_overrides[horizons_client] = lambda: fake

    body = {
        "mission_name": "Epochs Study",
        "sites": [
            {"label": "A", "latitude_deg": -89.68, "longitude_deg": -166.0},
            {"label": "B", "latitude_deg": -89.44, "longitude_deg": -141.8},
        ],
        "start_utc": "2027-03-01T00:00:00Z",
        "end_utc": "2027-03-02T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    created = client.post("/api/v1/analyses", json=body)
    assert created.status_code == 200, created.text
    analysis_id = created.json()["id"]

    r = client.get(f"/api/v1/analyses/{analysis_id}/epochs")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["analysis_id"] == analysis_id
    assert payload["horizon_model"] == "GEOMETRIC"
    assert payload["duration_semantics"] == "[start_utc, end_utc)"
    assert payload["sample_count_per_site"] >= 2
    assert len(payload["sites"]) == 2

    site_a = payload["sites"][0]
    assert site_a["label"] == "A"
    assert site_a["samples"]
    end = datetime.fromisoformat(payload["end_utc"].replace("Z", "+00:00"))
    for sample in site_a["samples"]:
        assert sample["sun_state"] in {"VISIBLE", "BLOCKED", "UNKNOWN"}
        assert sample["earth_state"] in {"VISIBLE", "BLOCKED", "UNKNOWN"}
        assert sample["joint_state"] in {"VISIBLE", "NOT_VISIBLE", "UNKNOWN"}
        assert "sun_azimuth_deg" in sample
        assert "earth_elevation_deg" in sample
        t = datetime.fromisoformat(sample["t"].replace("Z", "+00:00"))
        if t >= end:
            assert sample["hold_hours"] == 0.0
            assert sample["contributes_duration"] is False
        else:
            assert sample["hold_hours"] > 0.0
            assert sample["contributes_duration"] is True

    # Inclusive STOP sample must not invent an extra full step beyond the window.
    total_hold = sum(s["hold_hours"] for s in site_a["samples"])
    window_h = (end - datetime.fromisoformat(payload["start_utc"].replace("Z", "+00:00"))).total_seconds() / 3600
    assert total_hold == pytest.approx(window_h, abs=1e-6)

    app.dependency_overrides.pop(horizons_client, None)


def test_epochs_unknown_when_terrain_dem_missing(client: TestClient) -> None:
    """TERRAIN analyses outside DEM coverage must not invent VISIBLE states."""
    from app.api.deps import horizons_client
    from app.services import terrain_data_service

    if terrain_data_service.list_dem_tiles():
        # Covered sites would recompute real states; pick uncovered coords instead via GEOMETRIC
        # persist then force horizon_model — covered by uncovered TERRAIN create returning 422.
        pytest.skip("Covered by uncovered TERRAIN create test when DEM present")

    app = client.app
    fake = FakeHorizons()
    app.dependency_overrides[horizons_client] = lambda: fake
    body = {
        "mission_name": "No DEM",
        "sites": [
            {"label": "A", "latitude_deg": -85.0, "longitude_deg": 0.0},
            {"label": "B", "latitude_deg": -84.0, "longitude_deg": 10.0},
        ],
        "start_utc": "2026-12-01T00:00:00Z",
        "end_utc": "2026-12-02T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "TERRAIN",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    r = client.post("/api/v1/analyses", json=body)
    assert r.status_code in {422, 400, 503}
    app.dependency_overrides.pop(horizons_client, None)


def test_artemis_regions_classify_2022_and_2024(client: TestClient) -> None:
    r = client.get("/api/v1/artemis/regions")
    assert r.status_code == 200
    body = r.json()
    assert body["geometry"] is None
    assert body["historical_2022_count"] == 13
    assert body["current_2024_shortlist_count"] == 9
    assert len(body["historical_2022_regions"]) == 13
    assert len(body["current_2024_shortlist"]) == 9
    assert all(reg["polygon"] is None for reg in body["regions"])
    assert all(reg["geometry"] is None for reg in body["regions"])

    classes = {reg["classification"] for reg in body["regions"]}
    assert "ARTEMIS_III_2022_CANDIDATE" in classes
    assert "ARTEMIS_III_2024_SHORTLIST" in classes

    names_2024 = {reg["name"] for reg in body["current_2024_shortlist"]}
    assert "Slater Plain" in names_2024
    assert "Peak near Cabeus B" in names_2024
    assert "Connecting Ridge" not in names_2024

    # 2022 Connecting Ridge must be labelled historical, not current plan.
    cr = next(reg for reg in body["historical_2022_regions"] if reg["id"] == "connecting-ridge")
    assert cr["still_on_2024_shortlist"] is False
    assert cr["source_date"].startswith("2022")


def test_imagery_sources_do_not_advertise_unaligned_trek(client: TestClient) -> None:
    r = client.get("/api/v1/maps/imagery/sources")
    assert r.status_code == 200
    body = r.json()
    by_id = {item["layer_id"]: item for item in body["items"]}
    assert by_id["moon-trek-wac-global"]["preview_enabled"] is False
    assert by_id["moon-trek-wac-global"]["alignment_status"] == "REFERENCE_ONLY"
    assert by_id["lroc-wac-south-summer"]["preview_enabled"] is True
    assert by_id["lroc-wac-south-summer"]["alignment_status"] == "AVAILABLE_NATIVE_STEREO"

    # Reject open-proxy style: unknown layer
    bad = client.get(
        "/api/v1/maps/preview",
        params={
            "layer_id": "https://evil.example/wms",
            "latitude_deg": -89.5,
            "longitude_deg": 0,
            "half_extent_m": 2000,
        },
    )
    assert bad.status_code == 404

    # Reference-only Trek layer must not serve a polar preview
    trek = client.get(
        "/api/v1/maps/preview",
        params={
            "layer_id": "moon-trek-wac-global",
            "latitude_deg": -89.5,
            "longitude_deg": 0,
            "half_extent_m": 2000,
        },
    )
    assert trek.status_code == 503


def test_imagery_preview_warps_allowlisted_wms(client: TestClient) -> None:
    # Tiny synthetic RGB PNG
    from PIL import Image
    import io

    img = Image.new("RGB", (128, 128), color=(120, 80, 40))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    fake_png = buf.getvalue()

    with patch.object(imagery_service, "_wms_getmap_png", return_value=fake_png):
        r = client.get(
            "/api/v1/maps/preview",
            params={
                "layer_id": "lroc-wac-south-summer",
                "latitude_deg": -89.68,
                "longitude_deg": -166.0,
                "half_extent_m": 2000,
                "max_edge_px": 128,
            },
        )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("image/png")
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert "X-SELENORA-Bounds-M" in r.headers
    assert r.headers["X-SELENORA-Layer-Role"] == "MAP_VISUALIZATION_ONLY"


def test_mesh_schema_includes_nodata_and_grid(client: TestClient) -> None:
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
            "layer_id": "lola-site04-5mpp-surf",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["grid"]["nx"] * body["grid"]["ny"] == body["grid"]["n_cells"]
    assert body["grid"]["n_cells"] <= 20_000
    assert "nodata_mask" in body
    assert body["elevation_units"]
    assert body["crs_proj4"].startswith("+proj=stere")
    assert body["extent_m"]["left"] < body["extent_m"]["right"]
    assert "fabricated" in body["warning"].lower() or "never fabricated" in body["warning"].lower()
    # Dense mesh rejected
    dense = client.get(
        "/api/v1/maps/mesh",
        params={
            "latitude_deg": -89.68,
            "longitude_deg": -166.0,
            "half_extent_m": 5000,
            "step_m": 10,
        },
    )
    assert dense.status_code == 400


def test_layer_catalog_includes_phase5e_imagery(client: TestClient) -> None:
    r = client.get("/api/v1/maps/layers")
    ids = {item["id"] for item in r.json()["items"]}
    assert "lroc-wac-south-summer" in ids
    assert "moon-trek-wac-global" in ids
