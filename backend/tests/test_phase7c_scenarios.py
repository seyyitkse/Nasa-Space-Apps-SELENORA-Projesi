"""Phase 7C: same stable site, independent real-date scenario workflow."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.deps import horizons_client
from app.integrations.nasa.horizons import EphemerisResult, EphemerisSample, HorizonsError
from app.schemas.scenarios import ScenarioComparisonCreate, ScenarioEvidence
from app.services.scenario_service import _rank_evidence, scenario_cache_key


class DateAwareHorizons:
    """Deterministic test double whose evidence changes with the requested date."""

    def __init__(self, *, missing_earth_month: int | None = None) -> None:
        self.calls: list[tuple[str, datetime, datetime, float, float]] = []
        self.fail = False
        self.missing_earth_month = missing_earth_month

    async def observer_ephemeris(self, **kwargs: object) -> EphemerisResult:
        if self.fail:
            raise HorizonsError("simulated scenario Horizons outage")
        target = str(kwargs["target"])
        start = kwargs["start_utc"]
        stop = kwargs["stop_utc"]
        step = int(kwargs["step_minutes"])  # type: ignore[arg-type]
        lat = float(kwargs["latitude_deg"])  # type: ignore[arg-type]
        lon = float(kwargs["longitude_deg"])  # type: ignore[arg-type]
        assert isinstance(start, datetime) and isinstance(stop, datetime)
        self.calls.append((target, start, stop, lat, lon))
        samples: list[EphemerisSample] = []
        if not (target == "EARTH" and start.month == self.missing_earth_month):
            t = start
            index = 0
            while t <= stop:
                # December: both visible. January: Sun only. February: Earth only.
                if start.month == 12:
                    elevation = 6.0
                elif start.month == 1:
                    elevation = 5.0 if target == "SUN" else -3.0
                else:
                    elevation = -2.0 if target == "SUN" else 4.0
                samples.append(EphemerisSample(t, float(index * 10), elevation))
                t += timedelta(minutes=step)
                index += 1
        return EphemerisResult(
            target=target,  # type: ignore[arg-type]
            latitude_deg=lat,
            longitude_deg=lon,
            samples=samples,
            api_version=f"scenario-fixture-{start.date().isoformat()}",
            retrieved_at=datetime(2026, 11, 15, tzinfo=UTC),
        )


def body(*, weights: dict[str, float] | None = None) -> dict:
    return {
        "name": "Shackleton seasonal comparison",
        "site": {
            "site_id": "shackleton-rim-a",
            "label": "Shackleton Rim A",
            "latitude_deg": -89.68,
            "longitude_deg": -166.0,
            "landing_site_id": "shackleton-rim-a",
        },
        "scenarios": [
            {
                "scenario_id": "dec-2026",
                "label": "December 2026",
                "start_utc": "2026-12-01T00:00:00Z",
                "end_utc": "2026-12-03T00:00:00Z",
            },
            {
                "scenario_id": "jan-2027",
                "label": "January 2027",
                "start_utc": "2027-01-01T00:00:00Z",
                "end_utc": "2027-01-03T00:00:00Z",
            },
            {
                "scenario_id": "feb-2027",
                "label": "February 2027",
                "start_utc": "2027-02-01T00:00:00Z",
                "end_utc": "2027-02-03T00:00:00Z",
            },
        ],
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": weights
        or {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }


def test_same_site_different_dates_are_fetched_and_persisted(client: TestClient) -> None:
    fake = DateAwareHorizons()
    client.app.dependency_overrides[horizons_client] = lambda: fake
    response = client.post("/api/v1/scenarios", json=body())
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["cache_status"] == "MISS"
    assert result["site"]["site_id"] == "shackleton-rim-a"
    assert len(fake.calls) == 6  # Sun + Earth, independently for all three dates.
    assert {call[1].month for call in fake.calls} == {12, 1, 2}
    assert all(call[3:5] == (-89.68, -166.0) for call in fake.calls)
    assert [item["start_utc"][:7] for item in result["scenarios"]] == [
        "2026-12",
        "2027-01",
        "2027-02",
    ]
    assert [item["site"]["metrics"]["joint_visibility_pct"] for item in result["scenarios"]] == [
        100.0,
        0.0,
        0.0,
    ]
    assert result["recommended_scenario_id"] == "dec-2026"
    versions = [item["provenance"][0]["version"] for item in result["scenarios"]]
    assert versions == [
        "scenario-fixture-2026-12-01",
        "scenario-fixture-2027-01-01",
        "scenario-fixture-2027-02-01",
    ]

    stored = client.get(f"/api/v1/scenarios/{result['id']}")
    assert stored.status_code == 200
    assert stored.json()["cache_status"] == "STORED"
    assert client.get("/api/v1/scenarios").json()[0]["status"] == "COMPLETED"
    client.app.dependency_overrides.pop(horizons_client, None)


def test_identical_request_is_cache_hit_but_dates_and_weights_isolate_cache(
    client: TestClient,
) -> None:
    fake = DateAwareHorizons()
    client.app.dependency_overrides[horizons_client] = lambda: fake
    first = client.post("/api/v1/scenarios", json=body())
    assert first.status_code == 200
    calls = len(fake.calls)
    hit = client.post("/api/v1/scenarios", json=body())
    assert hit.status_code == 200 and hit.json()["cache_status"] == "HIT"
    assert len(fake.calls) == calls

    changed_date = body()
    changed_date["scenarios"][2]["start_utc"] = "2027-03-01T00:00:00Z"
    changed_date["scenarios"][2]["end_utc"] = "2027-03-03T00:00:00Z"
    assert client.post("/api/v1/scenarios", json=changed_date).json()["cache_status"] == "MISS"
    assert len(fake.calls) == calls + 6

    sun_heavy = body(
        weights={"sun_visibility": 80, "earth_visibility": 10, "joint_visibility": 10}
    )
    assert client.post("/api/v1/scenarios", json=sun_heavy).json()["cache_status"] == "MISS"
    assert len(fake.calls) == calls + 12
    client.app.dependency_overrides.pop(horizons_client, None)


def test_scenario_cache_key_covers_h2_weights_and_date_windows() -> None:
    balanced = ScenarioComparisonCreate.model_validate(body())
    sun_heavy = ScenarioComparisonCreate.model_validate(
        body(weights={"sun_visibility": 80, "earth_visibility": 10, "joint_visibility": 10})
    )
    shifted_json = body()
    shifted_json["scenarios"][0]["start_utc"] = "2026-12-08T00:00:00Z"
    shifted_json["scenarios"][0]["end_utc"] = "2026-12-10T00:00:00Z"
    shifted = ScenarioComparisonCreate.model_validate(shifted_json)
    assert scenario_cache_key(balanced) != scenario_cache_key(sun_heavy)
    assert scenario_cache_key(balanced) != scenario_cache_key(shifted)
    assert scenario_cache_key(balanced) == scenario_cache_key(
        ScenarioComparisonCreate.model_validate(body())
    )


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.update(scenarios=value["scenarios"][:1]),
        lambda value: value["scenarios"][1].update(
            start_utc=value["scenarios"][0]["start_utc"],
            end_utc=value["scenarios"][0]["end_utc"],
        ),
        lambda value: value["scenarios"][1].update(end_utc="2027-01-04T00:00:00Z"),
        lambda value: value["scenarios"][1].update(scenario_id="dec-2026"),
    ],
)
def test_invalid_or_duplicate_scenario_configurations_are_422(
    client: TestClient, mutate
) -> None:  # type: ignore[no-untyped-def]
    payload = body()
    mutate(payload)
    response = client.post("/api/v1/scenarios", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_total_sample_limit_bounds_large_multi_window_requests(client: TestClient) -> None:
    payload = body()
    payload["time_step_minutes"] = 10
    payload["scenarios"] = []
    for index in range(10):
        start = datetime(2027, 1, 1, tzinfo=UTC) + timedelta(days=31 * index)
        payload["scenarios"].append(
            {
                "scenario_id": f"window-{index}",
                "label": f"Window {index + 1}",
                "start_utc": start.isoformat(),
                "end_utc": (start + timedelta(days=30)).isoformat(),
            }
        )
    response = client.post("/api/v1/scenarios", json=payload)
    assert response.status_code == 422
    assert "30000 sample limit" in str(response.json()["error"]["details"])


def test_custom_site_identity_is_preserved(client: TestClient) -> None:
    fake = DateAwareHorizons()
    client.app.dependency_overrides[horizons_client] = lambda: fake
    payload = body()
    payload["site"] = {
        "site_id": "custom-ridge-42",
        "label": "Custom ridge 42",
        "latitude_deg": -87.25,
        "longitude_deg": 42.5,
        "landing_site_id": None,
    }
    result = client.post("/api/v1/scenarios", json=payload).json()
    assert result["site"]["site_id"] == "custom-ridge-42"
    assert result["site"]["landing_site_id"] is None
    assert all(item["site"]["latitude_deg"] == -87.25 for item in result["scenarios"])
    client.app.dependency_overrides.pop(horizons_client, None)


def test_missing_ephemeris_is_not_fabricated_or_recommended(client: TestClient) -> None:
    fake = DateAwareHorizons(missing_earth_month=1)
    client.app.dependency_overrides[horizons_client] = lambda: fake
    result = client.post("/api/v1/scenarios", json=body()).json()
    january = next(item for item in result["scenarios"] if item["scenario_id"] == "jan-2027")
    assert january["data_quality"] == "PARTIAL"
    assert january["site"]["metrics"]["earth_visibility_pct"] is None
    assert january["site"]["metrics"]["longest_communication_gap_hours"] == 0.0
    assert result["recommended_scenario_id"] is None
    assert "UNKNOWN was not treated as darkness" in result["recommendation_note"]
    client.app.dependency_overrides.pop(horizons_client, None)


def test_partial_terrain_evidence_refuses_cross_scenario_recommendation(
    client: TestClient,
) -> None:
    fake = DateAwareHorizons()
    client.app.dependency_overrides[horizons_client] = lambda: fake
    raw = client.post("/api/v1/scenarios", json=body()).json()
    first = ScenarioEvidence.model_validate(raw["scenarios"][0])
    second = ScenarioEvidence.model_validate(raw["scenarios"][1])
    partial = second.model_copy(
        update={
            "data_quality": "LOCAL_TERRAIN_PARTIAL",
            "site": second.site.model_copy(update={"score": None}),
        }
    )
    ranked, recommended, note = _rank_evidence([first, partial])
    assert recommended is None
    assert all(item.site.rank is None for item in ranked)
    assert "UNKNOWN was not treated as darkness" in note
    client.app.dependency_overrides.pop(horizons_client, None)


def test_upstream_failure_is_not_converted_to_success(client: TestClient) -> None:
    fake = DateAwareHorizons()
    fake.fail = True
    client.app.dependency_overrides[horizons_client] = lambda: fake
    response = client.post("/api/v1/scenarios", json=body())
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "HORIZONS_ERROR"
    statuses = client.get("/api/v1/scenarios").json()
    assert statuses[0]["status"] == "FAILED"
    assert statuses[0]["error_message"]
    client.app.dependency_overrides.pop(horizons_client, None)


def test_existing_analysis_contract_still_rejects_one_site(client: TestClient) -> None:
    payload = {
        "mission_name": "Still distinct-site analysis",
        "sites": [{"label": "A", "latitude_deg": -89.68, "longitude_deg": -166.0}],
        "start_utc": "2026-12-01T00:00:00Z",
        "end_utc": "2026-12-03T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    assert client.post("/api/v1/analyses", json=payload).status_code == 422
