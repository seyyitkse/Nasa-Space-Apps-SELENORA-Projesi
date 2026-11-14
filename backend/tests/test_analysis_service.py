"""Unit tests for the Phase 2 ephemeris analysis pipeline (mocked Horizons)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.integrations.nasa.horizons import (
    EphemerisResult,
    EphemerisSample,
    HorizonsError,
    parse_api_payload,
)
from app.schemas.analysis import AnalysisCreate, DecisionWeights, SiteInput
from app.services.analysis_service import (
    DATA_SOURCE_CONTRACT,
    align_body_series,
    compute_from_ephemerides,
)
from app.services.cache_keys import analysis_cache_key

FIXTURES = Path(__file__).parent / "fixtures"


def _samples_from_fixture(name: str) -> list[EphemerisSample]:
    payload = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    samples, _ = parse_api_payload(payload)
    return samples


def _ephem(target: str, samples: list[EphemerisSample], lat: float, lon: float) -> EphemerisResult:
    return EphemerisResult(
        target=target,  # type: ignore[arg-type]
        latitude_deg=lat,
        longitude_deg=lon,
        samples=samples,
        api_version="1.2",
        retrieved_at=datetime(2026, 11, 14, tzinfo=UTC),
    )


def _req(**overrides: object) -> AnalysisCreate:
    base = dict(
        mission_name="Phase 2 Unit",
        sites=[
            SiteInput(label="Shackleton A", latitude_deg=-89.68, longitude_deg=-166.0),
            SiteInput(label="Malapert", latitude_deg=-85.0, longitude_deg=0.0),
        ],
        start_utc=datetime(2026, 12, 1, tzinfo=UTC),
        end_utc=datetime(2026, 12, 2, tzinfo=UTC),
        time_step_minutes=360,
        horizon_model="GEOMETRIC",
        weights=DecisionWeights(),
    )
    base.update(overrides)
    return AnalysisCreate(**base)  # type: ignore[arg-type]


def test_align_missing_is_nan_not_zero() -> None:
    sun = [
        EphemerisSample(datetime(2026, 12, 1, tzinfo=UTC), 10.0, 5.0),
        EphemerisSample(datetime(2026, 12, 1, 6, tzinfo=UTC), 11.0, 6.0),
    ]
    earth = [EphemerisSample(datetime(2026, 12, 1, tzinfo=UTC), 20.0, -1.0)]
    times, sun_el, earth_el, *_ = align_body_series(sun, earth)
    assert len(times) == 2
    assert earth_el[0] == pytest.approx(-1.0)
    assert np.isnan(earth_el[1])
    assert not np.isnan(sun_el[1])


def test_compute_from_real_fixtures_matches_sample_elevations() -> None:
    sun = _samples_from_fixture("horizons_sun_shackleton_a_2026-12-01.json")
    earth = _samples_from_fixture("horizons_earth_shackleton_a_2026-12-01.json")
    # Second site: shift elevations slightly so ranking is deterministic.
    sun_b = [
        EphemerisSample(s.time_utc, s.azimuth_deg, s.elevation_deg - 2.0) for s in sun
    ]
    earth_b = [
        EphemerisSample(s.time_utc, s.azimuth_deg, s.elevation_deg + 3.0) for s in earth
    ]
    req = _req()
    site_ephems = [
        {
            "SUN": _ephem("SUN", sun, -89.68, -166.0),
            "EARTH": _ephem("EARTH", earth, -89.68, -166.0),
        },
        {
            "SUN": _ephem("SUN", sun_b, -85.0, 0.0),
            "EARTH": _ephem("EARTH", earth_b, -85.0, 0.0),
        },
    ]
    result, timeline, rows = compute_from_ephemerides(req, "test-id", site_ephems)
    assert result.data_quality == "EPHEMERIS_GEOMETRIC"
    assert result.status == "COMPLETED"
    assert result.algorithm_version.endswith("phase3")
    assert len(result.sites) == 2
    assert all(s.score is not None and s.rank is not None for s in result.sites)
    assert result.provenance[0].source_id == "jpl-horizons"
    assert "geometric" in " ".join(result.assumptions).lower()
    # Fixture elevations appear in the timeline for site A (rounded to 4 dp for transport).
    a_points = timeline.sites[0].points
    assert a_points[0].sun_elevation_deg == pytest.approx(1.492078, abs=5e-4)
    assert a_points[0].earth_elevation_deg == pytest.approx(-1.927529, abs=5e-4)
    # Raw persist rows keep full precision from the parser.
    assert rows[0]["sun_el"][0] == pytest.approx(1.492078, abs=1e-6)
    assert rows[0]["earth_el"][0] == pytest.approx(-1.927529, abs=1e-6)
    assert timeline.data_quality == "EPHEMERIS_GEOMETRIC"
    assert len(rows) == 2


def test_partial_data_refuses_ranking() -> None:
    t0 = datetime(2026, 6, 1, tzinfo=UTC)  # different season from Dec 2026 fixtures
    sun = [
        EphemerisSample(t0, 0.0, 10.0),
        EphemerisSample(t0 + timedelta(hours=1), 0.0, 10.0),
        EphemerisSample(t0 + timedelta(hours=2), 0.0, 10.0),
        EphemerisSample(t0 + timedelta(hours=3), 0.0, 10.0),
    ]
    earth = [EphemerisSample(t0, 0.0, 5.0)]  # 75% missing on aligned grid
    req = _req(
        start_utc=t0,
        end_utc=t0 + timedelta(hours=3),
        time_step_minutes=60,
        sites=[
            SiteInput(label="A", latitude_deg=-89.0, longitude_deg=10.0),
            SiteInput(label="B", latitude_deg=-88.0, longitude_deg=20.0),
        ],
    )
    bodies = {
        "SUN": _ephem("SUN", sun, -89.0, 10.0),
        "EARTH": _ephem("EARTH", earth, -89.0, 10.0),
    }
    result, _, _ = compute_from_ephemerides(req, "partial-id", [bodies, bodies])
    assert result.data_quality == "PARTIAL"
    assert all(s.score is None and s.rank is None for s in result.sites)


def test_joint_visibility_is_intersection() -> None:
    t0 = datetime(2027, 3, 1, tzinfo=UTC)
    times = [t0 + timedelta(hours=i) for i in range(4)]
    # Sun visible on 0,1 ; Earth on 1,2 → joint only index 1
    sun = [
        EphemerisSample(times[0], 0, 5),
        EphemerisSample(times[1], 0, 5),
        EphemerisSample(times[2], 0, -5),
        EphemerisSample(times[3], 0, -5),
    ]
    earth = [
        EphemerisSample(times[0], 0, -5),
        EphemerisSample(times[1], 0, 5),
        EphemerisSample(times[2], 0, 5),
        EphemerisSample(times[3], 0, -5),
    ]
    req = _req(
        start_utc=t0,
        end_utc=t0 + timedelta(hours=3),
        time_step_minutes=60,
        sites=[
            SiteInput(label="A", latitude_deg=-89.5, longitude_deg=-10.0),
            SiteInput(label="B", latitude_deg=-89.0, longitude_deg=-20.0),
        ],
    )
    bodies = {
        "SUN": _ephem("SUN", sun, -89.5, -10.0),
        "EARTH": _ephem("EARTH", earth, -89.5, -10.0),
    }
    result, _, _ = compute_from_ephemerides(req, "joint-id", [bodies, bodies])
    m = result.sites[0].metrics
    assert m.sun_visibility_pct == pytest.approx(50.0)
    assert m.earth_visibility_pct == pytest.approx(50.0)
    assert m.joint_visibility_pct == pytest.approx(25.0)


class FakeHorizons:
    def __init__(self, mapping: dict[tuple[str, float, float], EphemerisResult] | None = None):
        self.calls = 0
        self.mapping = mapping or {}
        self.fail = False

    async def observer_ephemeris(self, **kwargs: object) -> EphemerisResult:  # type: ignore[no-untyped-def]
        self.calls += 1
        if self.fail:
            raise HorizonsError("simulated Horizons outage")
        target = kwargs["target"]
        lat = float(kwargs["latitude_deg"])  # type: ignore[arg-type]
        lon = float(kwargs["longitude_deg"])  # type: ignore[arg-type]
        key = (str(target), round(lat, 4), round(lon, 4))
        if key in self.mapping:
            return self.mapping[key]
        # Default synthetic-ish series for any coords
        start = kwargs["start_utc"]
        stop = kwargs["stop_utc"]
        step = int(kwargs["step_minutes"])  # type: ignore[arg-type]
        assert isinstance(start, datetime) and isinstance(stop, datetime)
        samples: list[EphemerisSample] = []
        t = start
        i = 0
        while t <= stop:
            # Distinct visibility masks per site so ranking is deterministic.
            if target == "SUN":
                elev = 8.0 if lat <= -89.0 else (-2.0 if i % 3 == 0 else 4.0)
            else:
                elev = (3.0 if i % 2 == 0 else -3.0) if lat <= -89.0 else 5.0
            samples.append(EphemerisSample(t, float(i), elev))
            t += timedelta(minutes=step)
            i += 1
        return EphemerisResult(
            target=target,  # type: ignore[arg-type]
            latitude_deg=lat,
            longitude_deg=lon,
            samples=samples,
            api_version="1.2",
            retrieved_at=datetime.now(UTC),
        )


def test_create_analysis_persists_and_caches(client: TestClient) -> None:
    # Use the app's DB session via the TestClient lifespan + dependency injection.
    from app.api.deps import horizons_client

    app = client.app
    fake = FakeHorizons()
    app.dependency_overrides[horizons_client] = lambda: fake

    body = {
        "mission_name": "Cache Study",
        "sites": [
            {"label": "A", "latitude_deg": -89.68, "longitude_deg": -166.0},
            {"label": "B", "latitude_deg": -89.44, "longitude_deg": -141.8},
        ],
        "start_utc": "2027-01-10T00:00:00Z",
        "end_utc": "2027-01-12T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    r1 = client.post("/api/v1/analyses", json=body)
    assert r1.status_code == 200, r1.text
    status = r1.json()
    assert status["status"] == "COMPLETED"
    assert status["data_quality"] == "EPHEMERIS_GEOMETRIC"
    analysis_id = status["id"]
    calls_after_first = fake.calls

    got = client.get(f"/api/v1/analyses/{analysis_id}")
    assert got.status_code == 200
    result = got.json()
    assert result["data_quality"] == "EPHEMERIS_GEOMETRIC"
    assert len(result["sites"]) == 2
    assert result["provenance"][0]["source_id"] == "jpl-horizons"
    assert "SYNTHETIC" not in result["data_quality"]

    tl = client.get(f"/api/v1/analyses/{analysis_id}/timeline")
    assert tl.status_code == 200
    assert tl.json()["analysis_id"] == analysis_id
    assert len(tl.json()["sites"]) == 2

    listed = client.get("/api/v1/analyses").json()
    assert any(a["id"] == analysis_id for a in listed)

    # Cache hit — no extra Horizons calls; completed → 200 not 202
    r2 = client.post("/api/v1/analyses", json=body)
    assert r2.status_code == 200
    assert r2.json()["id"] == analysis_id
    assert fake.calls == calls_after_first

    app.dependency_overrides.pop(horizons_client, None)


def test_create_analysis_horizons_failure(client: TestClient) -> None:
    from app.api.deps import horizons_client

    app = client.app
    fake = FakeHorizons()
    fake.fail = True
    app.dependency_overrides[horizons_client] = lambda: fake

    body = {
        "mission_name": "Fail Study",
        "sites": [
            {"label": "A", "latitude_deg": -89.0, "longitude_deg": 0.0},
            {"label": "B", "latitude_deg": -88.0, "longitude_deg": 10.0},
        ],
        "start_utc": "2027-02-01T00:00:00Z",
        "end_utc": "2027-02-02T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    r = client.post("/api/v1/analyses", json=body)
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "HORIZONS_ERROR"
    listed = client.get("/api/v1/analyses").json()
    assert any(a["status"] == "FAILED" for a in listed)
    app.dependency_overrides.pop(horizons_client, None)


def test_terrain_horizon_still_501(client: TestClient) -> None:
    body = {
        "mission_name": "Terrain Study",
        "sites": [
            {"label": "A", "latitude_deg": -89.0, "longitude_deg": 0.0},
            {"label": "B", "latitude_deg": -88.0, "longitude_deg": 10.0},
        ],
        "start_utc": "2026-12-01T00:00:00Z",
        "end_utc": "2026-12-02T00:00:00Z",
        "time_step_minutes": 60,
        "horizon_model": "TERRAIN",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    r = client.post("/api/v1/analyses", json=body)
    assert r.status_code == 501
    assert r.json()["error"]["details"]["phase"] == 4


@pytest.mark.live
def test_live_two_site_analysis_end_to_end(client: TestClient) -> None:
    """Calls the real JPL Horizons API for two south-polar sites × 2 days.

    Uses a non-December window to prove the pipeline is not date-locked.
    Run explicitly: pytest -m live -o addopts=
    """
    body = {
        "mission_name": "Live Phase 2",
        "sites": [
            {"label": "Shackleton A", "latitude_deg": -89.68, "longitude_deg": -166.0},
            {"label": "Point B", "latitude_deg": -89.44, "longitude_deg": -141.8},
        ],
        "start_utc": "2027-03-01T00:00:00Z",
        "end_utc": "2027-03-03T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    r = client.post("/api/v1/analyses", json=body)
    assert r.status_code == 200, r.text
    status = r.json()
    assert status["status"] == "COMPLETED"
    assert status["data_quality"] in {"EPHEMERIS_GEOMETRIC", "PARTIAL"}
    detail = client.get(f"/api/v1/analyses/{status['id']}").json()
    assert detail["data_quality"] != "SYNTHETIC_DEMO"
    assert len(detail["sites"]) == 2
    assert detail["provenance"][0]["source_id"] == "jpl-horizons"
    tl = client.get(f"/api/v1/analyses/{status['id']}/timeline").json()
    assert len(tl["sites"][0]["points"]) >= 2


def test_cache_key_includes_data_source_contract() -> None:
    key = analysis_cache_key(
        sites=[(-89.68, -166.0), (-85.0, 0.0)],
        start_utc=datetime(2026, 12, 1, tzinfo=UTC),
        end_utc=datetime(2026, 12, 2, tzinfo=UTC),
        time_step_minutes=60,
        horizon_model="GEOMETRIC",
        algorithm_version="0.3.0-phase3",
        data_source_version=DATA_SOURCE_CONTRACT,
    )
    other = analysis_cache_key(
        sites=[(-89.68, -166.0), (-85.0, 0.0)],
        start_utc=datetime(2026, 12, 1, tzinfo=UTC),
        end_utc=datetime(2026, 12, 2, tzinfo=UTC),
        time_step_minutes=60,
        horizon_model="GEOMETRIC",
        algorithm_version="0.3.0-phase3",
        data_source_version="synthetic-v1",
    )
    assert key != other
