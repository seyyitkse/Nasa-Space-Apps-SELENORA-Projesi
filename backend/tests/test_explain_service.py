"""Phase 3 AI explain pipeline tests (mocked DeepSeek)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient

from app.integrations.deepseek.client import DeepSeekClient
from app.schemas.analysis import AIMissionReport, AnalysisResult, DecisionWeights
from app.services.ai_guard import ranking_contradicts
from app.services.evidence_package import build_evidence_package


class FakeCompletions:
    def __init__(self, content: str | Exception) -> None:
        self.content = content
        self.calls = 0
        self.kwargs: dict[str, Any] = {}

    async def create(self, **kwargs: Any) -> Any:
        self.calls += 1
        self.kwargs = kwargs
        if isinstance(self.content, Exception):
            raise self.content
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))],
            usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20, total_tokens=30),
        )


def _sample_result(**overrides: object) -> AnalysisResult:
    base = dict(
        id="ana-1",
        mission_name="Demo",
        status="COMPLETED",
        data_quality="EPHEMERIS_GEOMETRIC",
        algorithm_version="0.3.0-phase3",
        start_utc=datetime(2027, 3, 1, tzinfo=UTC),
        end_utc=datetime(2027, 3, 3, tzinfo=UTC),
        time_step_minutes=360,
        horizon_model="GEOMETRIC",
        weights=DecisionWeights(),
        sites=[
            {
                "label": "Site A",
                "latitude_deg": -89.68,
                "longitude_deg": -166.0,
                "landing_site_id": None,
                "metrics": {
                    "sun_visibility_pct": 80.0,
                    "earth_visibility_pct": 50.0,
                    "joint_visibility_pct": 40.0,
                    "longest_sunlight_hours": 12.0,
                    "longest_darkness_hours": 6.0,
                    "longest_earth_visibility_hours": 10.0,
                    "longest_communication_gap_hours": 4.0,
                    "longest_joint_visibility_hours": 3.0,
                },
                "score": 62.0,
                "rank": 1,
                "contributions": [],
                "darkness_windows": [],
                "communication_gaps": [],
                "joint_windows": [],
            },
            {
                "label": "Site B",
                "latitude_deg": -89.4,
                "longitude_deg": -140.0,
                "landing_site_id": None,
                "metrics": {
                    "sun_visibility_pct": 60.0,
                    "earth_visibility_pct": 55.0,
                    "joint_visibility_pct": 30.0,
                    "longest_sunlight_hours": 8.0,
                    "longest_darkness_hours": 10.0,
                    "longest_earth_visibility_hours": 9.0,
                    "longest_communication_gap_hours": 5.0,
                    "longest_joint_visibility_hours": 2.0,
                },
                "score": 52.0,
                "rank": 2,
                "contributions": [],
                "darkness_windows": [],
                "communication_gaps": [],
                "joint_windows": [],
            },
        ],
        recommended_site_label="Site A",
        assumptions=["Geometric horizon"],
        limitations=["No LOLA"],
        provenance=[
            {
                "source_id": "jpl-horizons",
                "description": "NASA/JPL Horizons",
                "retrieved_at": datetime(2026, 11, 14, tzinfo=UTC),
                "version": "1.2",
            }
        ],
        created_at=datetime(2026, 11, 14, tzinfo=UTC),
    )
    base.update(overrides)
    return AnalysisResult.model_validate(base)


def _good_report() -> dict[str, Any]:
    return {
        "summary": "Site A leads on sunlight with sun_visibility_pct of 80.",
        "key_findings": ["Site A ranks first with score 62."],
        "site_advantages": {"Site A": ["Higher sun_visibility_pct (80)."]},
        "site_disadvantages": {"Site B": ["Longer longest_darkness_hours (10)."]},
        "comparison_explanation": "Deterministic ranking prefers Site A.",
        "mission_tradeoffs": ["Sunlight vs Earth visibility trade-off."],
        "scientific_limitations": ["Geometric horizon only."],
        "data_quality_notes": ["data_quality is EPHEMERIS_GEOMETRIC."],
    }


def test_evidence_package_is_allowlisted() -> None:
    pkg = build_evidence_package(_sample_result())
    assert pkg["analysis_id"] == "ana-1"
    assert pkg["recommended_site_label"] == "Site A"
    assert "sites" in pkg and len(pkg["sites"]) == 2
    assert "instruction_note" in pkg
    # No timeline / raw ephemeris dumps
    blob = json.dumps(pkg)
    assert "elevation_deg" not in blob
    assert "$$SOE" not in blob


def test_ranking_contradiction_detected() -> None:
    report = AIMissionReport(
        summary="We recommend Site B for the mission.",
        key_findings=[],
        site_advantages={"Site A": ["ok"], "Site B": ["better"]},
        site_disadvantages={},
        comparison_explanation="Recommended Site B over Site A.",
    )
    assert ranking_contradicts(report, "Site A") is True
    assert ranking_contradicts(report, "Site B") is False


def test_explain_endpoint_not_configured(client: TestClient) -> None:
    from app.api.deps import horizons_client
    from tests.test_analysis_service import FakeHorizons

    client.app.dependency_overrides[horizons_client] = lambda: FakeHorizons()
    body = {
        "mission_name": "AI Prep",
        "sites": [
            {"label": "A", "latitude_deg": -89.0, "longitude_deg": 0.0},
            {"label": "B", "latitude_deg": -88.0, "longitude_deg": 10.0},
        ],
        "start_utc": "2027-03-01T00:00:00Z",
        "end_utc": "2027-03-02T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    created = client.post("/api/v1/analyses", json=body).json()
    r = client.post(f"/api/v1/analyses/{created['id']}/explain", json={"language": "en"})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "SERVICE_NOT_CONFIGURED"
    # Scientific analysis still available
    assert client.get(f"/api/v1/analyses/{created['id']}").status_code == 200
    client.app.dependency_overrides.pop(horizons_client, None)


def test_explain_endpoint_mock_success_and_cache(client: TestClient) -> None:
    from app.api.deps import deepseek_client, horizons_client
    from app.core.config import Settings
    from tests.test_analysis_service import FakeHorizons

    fake = FakeCompletions(json.dumps(_good_report()))
    settings = Settings(_env_file=None, DEEPSEEK_API_KEY="test-key", DEEPSEEK_MODEL="deepseek-flash")  # type: ignore[call-arg]
    ds = DeepSeekClient(settings, completions=fake)

    client.app.dependency_overrides[horizons_client] = lambda: FakeHorizons()
    client.app.dependency_overrides[deepseek_client] = lambda: ds

    body = {
        "mission_name": "AI Study",
        "sites": [
            {"label": "Site A", "latitude_deg": -89.0, "longitude_deg": 0.0},
            {"label": "Site B", "latitude_deg": -88.0, "longitude_deg": 10.0},
        ],
        "start_utc": "2027-03-01T00:00:00Z",
        "end_utc": "2027-03-02T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    created = client.post("/api/v1/analyses", json=body).json()
    aid = created["id"]

    r1 = client.post(f"/api/v1/analyses/{aid}/explain", json={"language": "en"})
    assert r1.status_code == 200, r1.text
    data = r1.json()
    assert data["cached"] is False
    assert data["report"]["summary"]
    assert "recommended_site_label" in data
    assert data["prompt_version"]
    assert fake.calls == 1

    r2 = client.post(f"/api/v1/analyses/{aid}/explain", json={"language": "en"})
    assert r2.status_code == 200
    assert r2.json()["cached"] is True
    assert fake.calls == 1  # no second DeepSeek call

    stored = client.get(f"/api/v1/analyses/{aid}/explain")
    assert stored.status_code == 200
    assert stored.json()["cached"] is True

    client.app.dependency_overrides.pop(horizons_client, None)
    client.app.dependency_overrides.pop(deepseek_client, None)


def test_explain_rejects_ranking_contradiction(client: TestClient) -> None:
    from app.api.deps import deepseek_client, horizons_client
    from app.core.config import Settings
    from tests.test_analysis_service import FakeHorizons

    bad = _good_report()
    bad["comparison_explanation"] = "We recommend Site B as the preferred site."
    bad["summary"] = "Recommend Site B."
    fake = FakeCompletions(json.dumps(bad))
    settings = Settings(_env_file=None, DEEPSEEK_API_KEY="test-key")  # type: ignore[call-arg]
    ds = DeepSeekClient(settings, completions=fake)

    client.app.dependency_overrides[horizons_client] = lambda: FakeHorizons()
    client.app.dependency_overrides[deepseek_client] = lambda: ds

    body = {
        "mission_name": "Contra",
        "sites": [
            {"label": "Site A", "latitude_deg": -89.1, "longitude_deg": 1.0},
            {"label": "Site B", "latitude_deg": -88.1, "longitude_deg": 11.0},
        ],
        "start_utc": "2027-04-01T00:00:00Z",
        "end_utc": "2027-04-02T00:00:00Z",
        "time_step_minutes": 360,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }
    aid = client.post("/api/v1/analyses", json=body).json()["id"]
    detail = client.get(f"/api/v1/analyses/{aid}").json()
    winner = detail["recommended_site_label"] or detail["sites"][0]["label"]
    other = next(s["label"] for s in detail["sites"] if s["label"] != winner)
    # Persist a definite recommendation so the guard has a winner to protect.
    from app.models.analysis import MissionAnalysis

    with client.app.state.database.session_factory() as session:
        row = session.get(MissionAnalysis, aid)
        assert row is not None and row.result_json is not None
        payload = dict(row.result_json)
        payload["recommended_site_label"] = winner
        for s in payload["sites"]:
            if s["label"] == winner:
                s["rank"] = 1
                s["score"] = 90.0
            else:
                s["rank"] = 2
                s["score"] = 40.0
        row.result_json = payload
        session.commit()

    bad["comparison_explanation"] = f"We recommend {other} as the preferred site."
    bad["summary"] = f"Recommend {other}."
    bad["site_advantages"] = {winner: ["a"], other: ["b"]}
    fake.content = json.dumps(bad)

    r = client.post(f"/api/v1/analyses/{aid}/explain", json={"language": "en"})
    assert r.status_code == 502, r.text
    assert client.get(f"/api/v1/analyses/{aid}").status_code == 200

    client.app.dependency_overrides.pop(horizons_client, None)
    client.app.dependency_overrides.pop(deepseek_client, None)


def test_migration_adds_missing_columns(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """Existing Phase-1-like SQLite gains Phase 2/3 columns without data loss."""
    import sqlite3

    from app.db.migrate import run_migrations

    db = tmp_path / "legacy.db"
    conn = sqlite3.connect(db)
    conn.execute(
        """
        CREATE TABLE mission_analyses (
            id TEXT PRIMARY KEY,
            mission_name TEXT NOT NULL,
            status TEXT NOT NULL,
            start_utc TEXT NOT NULL,
            end_utc TEXT NOT NULL,
            time_step_minutes INTEGER NOT NULL,
            horizon_model TEXT NOT NULL,
            weights TEXT NOT NULL,
            data_quality TEXT NOT NULL,
            algorithm_version TEXT NOT NULL,
            cache_key TEXT NOT NULL,
            error_message TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT
        )
        """
    )
    conn.execute(
        """
        INSERT INTO mission_analyses VALUES
        ('keep-me','M','COMPLETED','2027-01-01','2027-01-02',60,'GEOMETRIC','{}',
         'EPHEMERIS_GEOMETRIC','0.1.0','abc',NULL,'2027-01-01',NULL)
        """
    )
    conn.execute(
        """
        CREATE TABLE analysis_sites (
            id INTEGER PRIMARY KEY,
            analysis_id TEXT,
            label TEXT,
            latitude_deg REAL,
            longitude_deg REAL,
            landing_site_id TEXT,
            metrics TEXT,
            score REAL,
            rank INTEGER
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE ai_reports (
            id INTEGER PRIMARY KEY,
            analysis_id TEXT,
            language TEXT,
            model TEXT,
            report TEXT,
            created_at TEXT
        )
        """
    )
    conn.commit()
    conn.close()

    run_migrations(f"sqlite:///{db.as_posix()}")

    conn = sqlite3.connect(db)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(mission_analyses)")}
    assert "result_json" in cols and "timeline_json" in cols
    site_cols = {r[1] for r in conn.execute("PRAGMA table_info(analysis_sites)")}
    assert "details" in site_cols
    ai_cols = {r[1] for r in conn.execute("PRAGMA table_info(ai_reports)")}
    assert "prompt_version" in ai_cols and "cache_key" in ai_cols
    assert conn.execute("SELECT id FROM mission_analyses").fetchone()[0] == "keep-me"
    conn.close()
