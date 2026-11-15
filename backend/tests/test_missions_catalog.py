"""Phase 7E — verified lunar mission catalog tests.

Covers catalog validation, coordinate conversion / longitude normalization,
known Apollo reference vectors, near-pole CLPS marker placement,
category filtering, and the planned-vs-actual separation rules.
"""

from __future__ import annotations

import pytest

from app.schemas.missions import MissionItem
from app.science.lunar_sphere import normalize_longitude_deg
from app.services import mission_catalog


def _by_id(items: list[dict], mission_id: str) -> dict:
    return next(i for i in items if i["id"] == mission_id)


def test_catalog_loads_and_validates() -> None:
    payload = mission_catalog.catalog()
    assert payload["total"] >= 14
    ids = [i["id"] for i in payload["items"]]
    assert len(ids) == len(set(ids))
    assert payload["coordinate_frame"] == "MOON_ME"
    assert "me_pa_policy" in payload
    assert "ME/PA" in payload["me_pa_policy"] or "Mean Earth" in payload["me_pa_policy"]
    assert "NOT" in payload["disclaimer"].upper() or "not" in payload["disclaimer"]


def test_every_mission_has_primary_source_and_access_date() -> None:
    payload = mission_catalog.catalog()
    for item in payload["items"]:
        assert item["source_url"].startswith("https://"), item["id"]
        assert item["source_access_date"] == "2026-11-15", item["id"]
        assert item["coordinate_frame"] == "MOON_ME", item["id"]
        assert item["source_coordinate_system"], item["id"]
        assert item["source_frame_label"], item["id"]
        assert item["not_nasa_landing_recommendation"] is True, item["id"]


def test_planned_and_no_touchdown_missions_have_no_actual_point() -> None:
    payload = mission_catalog.catalog()
    for item in payload["items"]:
        if item["landing_outcome"] in (
            "NO_LANDING_ABORTED",
            "NO_LANDING_FAILED",
            "NOT_LANDED_YET",
        ):
            assert item["latitude_deg"] is None, item["id"]
            assert item["longitude_deg"] is None, item["id"]
            assert item["marker_kind"] in ("PLANNED_TARGET_REGION", "LIST_ONLY"), item["id"]


def test_approximate_regions_never_silently_become_exact_points() -> None:
    payload = mission_catalog.catalog()
    for item in payload["items"]:
        if item["approximate_region"]:
            assert item["confidence"] == "APPROXIMATE_REGION", item["id"]
            assert item["latitude_deg"] is None, item["id"]
            if item["region_representation"] == "FEATURE_CENTROID_APPROXIMATE":
                target = item["planned_target"]
                assert target is not None
                assert "centroid" in target["note"].lower(), item["id"]
                assert item["marker_kind"] == "PLANNED_TARGET_REGION", item["id"]


def test_planned_target_never_represented_as_actual_landing() -> None:
    payload = mission_catalog.filtered_catalog(outcome="planned")
    assert payload["total"] >= 4
    for item in payload["items"]:
        assert item["landing_outcome"] == "NOT_LANDED_YET", item["id"]
        assert item["status"] == "PLANNED", item["id"]
        assert item["landing_date"] is None, item["id"]
        assert item["latitude_deg"] is None and item["longitude_deg"] is None
        assert item["marker_kind"] != "ACTUAL_LANDING", item["id"]


def test_terrain_scoring_never_enabled_for_missions() -> None:
    payload = mission_catalog.catalog()
    for item in payload["items"]:
        assert item["terrain_scoring_supported"] is False, item["id"]


def test_mission_records_not_in_seed_database(client) -> None:  # type: ignore[no-untyped-def]
    """Seed research sites stay untouched; missions are a separate catalog."""
    r = client.get("/api/v1/sites")
    seed_ids = {s["id"] for s in r.json()["items"]}
    payload = mission_catalog.catalog()
    mission_ids = {i["id"] for i in payload["items"]}
    assert seed_ids.isdisjoint(mission_ids)


def test_longitude_normalization_0_360_to_pm180() -> None:
    assert normalize_longitude_deg(336.5781) == pytest.approx(-23.4219)
    assert normalize_longitude_deg(342.52806) == pytest.approx(-17.47194)
    assert normalize_longitude_deg(23.47314) == pytest.approx(23.47314)
    assert normalize_longitude_deg(15.5011) == pytest.approx(15.5011)
    assert normalize_longitude_deg(0) == 0
    assert normalize_longitude_deg(180) == 180
    assert normalize_longitude_deg(-180) == 180


def test_apollo_reference_vectors() -> None:
    """Known ME-frame Cartesian vectors for the stored catalog values."""
    from app.science.lunar_sphere import lonlat_to_cartesian

    R = 1_737_400.0
    import math

    a11 = lonlat_to_cartesian(23.47314, 0.67416)
    assert a11.radius_m == pytest.approx(R)
    assert a11.z_m == pytest.approx(R * math.sin(math.radians(0.67416)), rel=1e-9)
    assert a11.x_m > 0 and a11.y_m > 0

    a12 = lonlat_to_cartesian(-23.4219, -3.0128)
    assert a12.x_m > 0 and a12.y_m < 0 and a12.z_m < 0
    a12b = lonlat_to_cartesian(336.5781, -3.0128)
    assert (a12.x_m, a12.y_m, a12.z_m) == pytest.approx((a12b.x_m, a12b.y_m, a12b.z_m))

    a16 = lonlat_to_cartesian(15.5011, -8.9734)
    assert a16.y_m > 0


def test_apollo_coordinates_match_nssdc_lroc_values() -> None:
    expected = {
        "apollo-11": (0.67416, 23.47314, 0.3),
        "apollo-12": (-3.0128, -23.4219, 2.2),
        "apollo-14": (-3.64589, -17.47194, 0.4),
        "apollo-15": (26.13239, 3.63330, 1.0),
        "apollo-16": (-8.9734, 15.5011, 3.0),
        "apollo-17": (20.1911, 30.7723, 3.5),
    }
    payload = mission_catalog.catalog()
    for mid, (lat, lon, unc) in expected.items():
        item = _by_id(payload["items"], mid)
        assert item["latitude_deg"] == pytest.approx(lat)
        assert item["longitude_deg"] == pytest.approx(lon)
        assert item["longitude_normalized_deg"] == pytest.approx(lon)
        assert item["coordinate_uncertainty_m"] == pytest.approx(unc)
        assert item["confidence"] == "EXACT_VERIFIED"
        assert item["program"] == "APOLLO"
        assert item["source_coordinate_system"] == "MOON_ME_PA"
        assert item["marker_kind"] == "ACTUAL_LANDING"
        assert item["south_polar"] is False
        assert item["explorer_coverage"] is False


def test_near_pole_clps_marker_placement() -> None:
    payload = mission_catalog.catalog()
    im1 = _by_id(payload["items"], "im-1-odysseus")
    im2 = _by_id(payload["items"], "im-2-athena")

    assert im1["latitude_deg"] == pytest.approx(-80.13)
    assert im1["longitude_deg"] == pytest.approx(1.44)
    assert im1["south_polar"] is True
    assert im1["explorer_coverage"] is True

    assert im2["latitude_deg"] == pytest.approx(-84.7906)
    assert im2["longitude_deg"] == pytest.approx(29.1957)
    assert im2["south_polar"] is True
    assert im2["explorer_coverage"] is True

    for item in (im1, im2):
        assert item["cartesian_me"] is not None
        assert item["cartesian_me"]["frame"] == "MOON_ME_SPHERE_SCIENTIFIC"
        assert item["cartesian_me"]["z_m"] < 0
        assert item["marker_kind"] == "ACTUAL_LANDING"


def test_blue_ghost_1_coordinates() -> None:
    payload = mission_catalog.catalog()
    bg1 = _by_id(payload["items"], "blue-ghost-1")
    assert bg1["latitude_deg"] == pytest.approx(18.5623)
    assert bg1["longitude_deg"] == pytest.approx(61.8103)
    assert bg1["confidence"] == "EXACT_VERIFIED"
    assert bg1["program"] == "CLPS"


def test_peregrine_has_no_landing_point_but_documented_target_region() -> None:
    payload = mission_catalog.catalog()
    m1 = _by_id(payload["items"], "peregrine-m1")
    assert m1["landing_outcome"] == "NO_LANDING_FAILED"
    assert m1["latitude_deg"] is None and m1["longitude_deg"] is None
    assert m1["planned_target"]["name"] == "Sinus Viscositatis"
    assert m1["planned_target"]["latitude_deg"] == pytest.approx(35.25)
    assert m1["planned_target"]["longitude_deg"] == pytest.approx(-40.99)
    assert m1["planned_target"]["coordinate_system"] == "IAU_GAZETTEER_PLANETOGRAPHIC"
    assert m1["marker_kind"] == "PLANNED_TARGET_REGION"
    assert m1["cartesian_me"] is not None


def test_apollo_13_abort_has_no_pin() -> None:
    payload = mission_catalog.catalog()
    a13 = _by_id(payload["items"], "apollo-13")
    assert a13["landing_outcome"] == "NO_LANDING_ABORTED"
    assert a13["region_representation"] == "NONE"
    assert a13["cartesian_me"] is None
    assert a13["marker_kind"] == "LIST_ONLY"
    assert a13["planned_target"]["name"] == "Fra Mauro"
    assert a13["planned_target"]["latitude_deg"] is None


def test_griffin_and_im4_share_centroid_without_shifting() -> None:
    payload = mission_catalog.catalog()
    g = _by_id(payload["items"], "griffin-m1")
    im4 = _by_id(payload["items"], "im-4")
    assert g["planned_target"]["latitude_deg"] == pytest.approx(-84.6)
    assert im4["planned_target"]["latitude_deg"] == pytest.approx(-84.6)
    assert g["cartesian_me"]["x_m"] == pytest.approx(im4["cartesian_me"]["x_m"])


def _base_item(**overrides) -> dict:
    base = {
        "id": "test-mission",
        "name": "Test Mission",
        "program": "CLPS",
        "operator": "Test",
        "status": "PLANNED",
        "landing_outcome": "NOT_LANDED_YET",
        "coordinate_frame": "MOON_ME",
        "source_coordinate_system": "NONE_NO_TOUCHDOWN",
        "source_frame_label": "No verified landing coordinates",
        "confidence": "APPROXIMATE_REGION",
        "approximate_region": True,
        "region_representation": "NONE",
        "source_url": "https://example.nasa.gov/mission",
        "source_access_date": "2026-11-15",
        "notes": "test",
    }
    base.update(overrides)
    return base


def test_schema_rejects_planned_mission_with_coordinates() -> None:
    with pytest.raises(ValueError):
        MissionItem.model_validate(_base_item(latitude_deg=10.0, longitude_deg=20.0))


def test_schema_rejects_approximate_region_with_exact_point() -> None:
    with pytest.raises(ValueError):
        MissionItem.model_validate(
            _base_item(
                landing_outcome="NO_LANDING_FAILED",
                approximate_region=True,
                region_representation="FEATURE_CENTROID_APPROXIMATE",
                latitude_deg=10.0,
                longitude_deg=20.0,
                planned_target={
                    "name": "X",
                    "latitude_deg": 10.0,
                    "longitude_deg": 20.0,
                    "note": "centroid",
                },
            )
        )


def test_schema_rejects_point_landing_without_coordinates() -> None:
    with pytest.raises(ValueError):
        MissionItem.model_validate(
            _base_item(
                landing_outcome="SUCCESSFUL_LANDING",
                status="COMPLETED_SUCCESS",
                confidence="EXACT_VERIFIED",
                approximate_region=False,
                region_representation="POINT_LANDING",
                source_coordinate_system="MOON_ME_PA",
                source_frame_label="ME/PA",
            )
        )


def test_missions_endpoint_returns_catalog(client) -> None:  # type: ignore[no-untyped-def]
    r = client.get("/api/v1/missions")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 14
    assert body["coordinate_frame"] == "MOON_ME"
    first = body["items"][0]
    assert {"id", "program", "status", "landing_outcome", "confidence", "marker_kind"} <= set(first)


def test_missions_filter_program(client) -> None:  # type: ignore[no-untyped-def]
    r = client.get("/api/v1/missions", params={"program": "APOLLO"})
    body = r.json()
    assert body["total"] == 7
    assert all(i["program"] == "APOLLO" for i in body["items"])
    r = client.get("/api/v1/missions", params={"program": "CLPS"})
    body = r.json()
    assert body["total"] >= 7
    assert all(i["program"] == "CLPS" for i in body["items"])


def test_missions_filter_successful_landing(client) -> None:  # type: ignore[no-untyped-def]
    body = client.get("/api/v1/missions", params={"outcome": "successful"}).json()
    ids = {i["id"] for i in body["items"]}
    assert "apollo-11" in ids and "blue-ghost-1" in ids
    assert all(i["landing_outcome"] == "SUCCESSFUL_LANDING" for i in body["items"])
    assert all(i["latitude_deg"] is not None for i in body["items"])


def test_missions_filter_partial(client) -> None:  # type: ignore[no-untyped-def]
    body = client.get("/api/v1/missions", params={"outcome": "partial"}).json()
    ids = {i["id"] for i in body["items"]}
    assert "im-1-odysseus" in ids
    assert "im-2-athena" in ids
    assert all(i["landing_outcome"] == "PARTIAL_SUCCESS_LANDING" for i in body["items"])


def test_missions_filter_aborted(client) -> None:  # type: ignore[no-untyped-def]
    body = client.get("/api/v1/missions", params={"outcome": "aborted"}).json()
    ids = {i["id"] for i in body["items"]}
    assert ids == {"apollo-13"}
    assert body["items"][0]["marker_kind"] == "LIST_ONLY"


def test_missions_filter_unsuccessful(client) -> None:  # type: ignore[no-untyped-def]
    body = client.get("/api/v1/missions", params={"outcome": "unsuccessful"}).json()
    ids = {i["id"] for i in body["items"]}
    assert "peregrine-m1" in ids
    assert "apollo-13" not in ids
    assert "im-2-athena" not in ids


def test_missions_filter_unsuccessful_or_aborted(client) -> None:  # type: ignore[no-untyped-def]
    body = client.get(
        "/api/v1/missions", params={"outcome": "unsuccessful_or_aborted"}
    ).json()
    ids = {i["id"] for i in body["items"]}
    assert "apollo-13" in ids
    assert "peregrine-m1" in ids
    assert "im-2-athena" in ids
    assert "apollo-11" not in ids


def test_missions_filter_planned(client) -> None:  # type: ignore[no-untyped-def]
    body = client.get("/api/v1/missions", params={"outcome": "planned"}).json()
    assert body["total"] >= 4
    assert all(i["status"] == "PLANNED" for i in body["items"])
    assert all(i["landing_date"] is None for i in body["items"])


def test_missions_filter_confidence(client) -> None:  # type: ignore[no-untyped-def]
    exact = client.get("/api/v1/missions", params={"confidence": "EXACT_VERIFIED"}).json()
    approx = client.get(
        "/api/v1/missions", params={"confidence": "APPROXIMATE_REGION"}
    ).json()
    assert all(i["confidence"] == "EXACT_VERIFIED" for i in exact["items"])
    assert all(i["confidence"] == "APPROXIMATE_REGION" for i in approx["items"])
    assert exact["total"] + approx["total"] == mission_catalog.catalog()["total"]


def test_missions_combined_filters(client) -> None:  # type: ignore[no-untyped-def]
    body = client.get(
        "/api/v1/missions",
        params={"program": "CLPS", "outcome": "successful"},
    ).json()
    ids = {i["id"] for i in body["items"]}
    assert "blue-ghost-1" in ids
    assert "apollo-11" not in ids


def test_missions_invalid_filter_returns_422(client) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/api/v1/missions", params={"program": "SOVIET"}).status_code == 422
    assert client.get("/api/v1/missions", params={"outcome": "nope"}).status_code == 422
