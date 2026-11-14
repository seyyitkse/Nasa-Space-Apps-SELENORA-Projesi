from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

VALID_ANALYSIS = {
    "mission_name": "Artemis Study",
    "sites": [
        {"label": "A", "latitude_deg": -89.68, "longitude_deg": -166.0},
        {"label": "B", "latitude_deg": -89.44, "longitude_deg": -141.8},
    ],
    "start_utc": "2026-12-01T00:00:00Z",
    "end_utc": "2026-12-15T00:00:00Z",
    "time_step_minutes": 60,
    "horizon_model": "GEOMETRIC",
    "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
}


def test_health_reports_components(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    names = {c["name"]: c["status"] for c in body["components"]}
    assert names["database"] == "OK"
    assert names["ai_analyst"] == "NOT_CONFIGURED"
    assert names["scientific_engine"] == "READY"
    assert "X-Request-ID" in r.headers
    assert r.headers["Server-Timing"].startswith("app;dur=")


def test_sites_are_seeded_and_flagged_approximate(client: TestClient) -> None:
    r = client.get("/api/v1/sites")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == len(body["items"]) >= 5
    assert all(s["coordinate_status"] == "APPROXIMATE_REFERENCE" for s in body["items"])
    assert all(-90 <= s["latitude_deg"] <= -80 for s in body["items"])
    assert "East-positive" in body["longitude_convention"]


def test_get_site_and_404_shape(client: TestClient) -> None:
    assert client.get("/api/v1/sites/shackleton-rim-a").json()["name"].startswith("Shackleton")
    r = client.get("/api/v1/sites/does-not-exist")
    assert r.status_code == 404
    err = r.json()["error"]
    assert err["code"] == "NOT_FOUND" and err["request_id"]


def test_data_sources_status_is_honest(client: TestClient) -> None:
    items = {d["id"]: d for d in client.get("/api/v1/data-sources").json()["items"]}
    assert items["jpl-horizons"]["integration_status"] == "INTEGRATED"
    assert items["lro-lola"]["integration_status"] == "PLANNED"
    assert items["deepseek"]["integration_status"] == "NOT_CONFIGURED"
    # Never leak secrets in API responses
    assert "api_key" not in str(items).lower()


def test_create_analysis_runs_with_mocked_horizons(client: TestClient) -> None:
    from app.api.deps import horizons_client
    from tests.test_analysis_service import FakeHorizons

    client.app.dependency_overrides[horizons_client] = lambda: FakeHorizons()
    r = client.post("/api/v1/analyses", json=VALID_ANALYSIS)
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["status"] == "COMPLETED"
    assert body["data_quality"] == "EPHEMERIS_GEOMETRIC"
    detail = client.get(f"/api/v1/analyses/{body['id']}").json()
    assert detail["data_quality"] == "EPHEMERIS_GEOMETRIC"
    assert len(detail["sites"]) == 2
    assert all(s["score"] is not None for s in detail["sites"])
    client.app.dependency_overrides.pop(horizons_client, None)


def test_create_analysis_rejects_bad_input(client: TestClient) -> None:
    bad_weights = {**VALID_ANALYSIS, "weights": {"sun_visibility": 50, "earth_visibility": 40, "joint_visibility": 20}}
    assert client.post("/api/v1/analyses", json=bad_weights).status_code == 422
    bad_lat = {**VALID_ANALYSIS, "sites": [{"label": "X", "latitude_deg": -91, "longitude_deg": 0}] * 2}
    assert client.post("/api/v1/analyses", json=bad_lat).status_code == 422
    reversed_dates = {**VALID_ANALYSIS, "start_utc": "2026-12-15T00:00:00Z", "end_utc": "2026-12-01T00:00:00Z"}
    assert client.post("/api/v1/analyses", json=reversed_dates).status_code == 422
    too_long = {**VALID_ANALYSIS, "end_utc": "2027-02-01T00:00:00Z"}
    assert client.post("/api/v1/analyses", json=too_long).status_code == 422
    one_site = {**VALID_ANALYSIS, "sites": VALID_ANALYSIS["sites"][:1]}
    r = client.post("/api/v1/analyses", json=one_site)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    naive_time = {**VALID_ANALYSIS, "start_utc": "2026-12-01T00:00:00"}
    assert client.post("/api/v1/analyses", json=naive_time).status_code == 422


def test_unknown_analysis_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/analyses/abc").status_code == 404
    assert client.get("/api/v1/analyses/abc/timeline").status_code == 404
    assert client.post("/api/v1/analyses/abc/explain", json={"language": "tr"}).status_code == 404
    assert client.get("/api/v1/analyses").json() == []


def test_synthetic_demo_is_labelled_and_deterministic(client: TestClient) -> None:
    r1 = client.post("/api/v1/demo/synthetic-analysis", json=VALID_ANALYSIS)
    r2 = client.post("/api/v1/demo/synthetic-analysis", json=VALID_ANALYSIS)
    assert r1.status_code == 200
    a, b = r1.json(), r2.json()
    assert a["result"]["data_quality"] == "SYNTHETIC_DEMO"
    assert a["timeline"]["data_quality"] == "SYNTHETIC_DEMO"
    assert a["result"]["sites"] == b["result"]["sites"]
    for site in a["result"]["sites"]:
        contrib_sum = sum(c["contribution"] for c in site["contributions"])
        assert abs(contrib_sum - site["score"]) < 0.01
        assert 0 <= site["metrics"]["sun_visibility_pct"] <= 100
    assert len(a["timeline"]["sites"][0]["points"]) <= 720


def test_cors_allows_only_configured_origin(client: TestClient) -> None:
    ok = client.options(
        "/api/v1/sites",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options(
        "/api/v1/sites",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert bad.headers.get("access-control-allow-origin") is None


def test_rate_limit(tmp_path) -> None:  # type: ignore[no-untyped-def]
    s = Settings(
        environment="test",
        database_url=f"sqlite:///{(tmp_path / 'rl.db').as_posix()}",
        rate_limit_per_minute=3,
        _env_file=None,  # type: ignore[call-arg]
    )
    with TestClient(create_app(s)) as c:
        codes = [c.get("/api/v1/data-sources").status_code for _ in range(4)]
        assert codes == [200, 200, 200, 429]
        assert c.get("/health").status_code == 200  # health is exempt
