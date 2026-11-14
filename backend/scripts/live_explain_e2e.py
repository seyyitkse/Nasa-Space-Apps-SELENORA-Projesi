"""Live Horizons analysis + DeepSeek explain e2e. Never prints secrets."""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import Settings, get_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.ai_guard import find_unsupported_numbers, ranking_contradicts  # noqa: E402
from app.schemas.analysis import AIMissionReport  # noqa: E402


def main() -> int:
    settings = get_settings()
    if not settings.deepseek_configured:
        print("RESULT=FAIL reason=DEEPSEEK_API_KEY_missing")
        return 2

    app = create_app(settings)
    with TestClient(app) as client:
        body = {
            "mission_name": "Phase31 Live Validation",
            "sites": [
                {"label": "Shackleton A", "latitude_deg": -89.68, "longitude_deg": -166.0},
                # Distant mid-latitude site so scores / recommendation are not a polar tie.
                {"label": "Equatorial Ref", "latitude_deg": 0.0, "longitude_deg": 0.0},
            ],
            # December window typically yields non-zero polar illumination samples.
            "start_utc": "2026-12-01T00:00:00Z",
            "end_utc": "2026-12-03T00:00:00Z",
            "time_step_minutes": 360,
            "horizon_model": "GEOMETRIC",
            "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
        }
        t0 = time.perf_counter()
        r = client.post("/api/v1/analyses", json=body)
        analysis_ms = round((time.perf_counter() - t0) * 1000, 1)
        print("analysis_http=", r.status_code)
        print("analysis_ms=", analysis_ms)
        if r.status_code not in (200, 202):
            print("RESULT=FAIL stage=analysis", r.text[:300])
            return 1
        status = r.json()
        print("analysis_status=", status["status"], "quality=", status["data_quality"])
        aid = status["id"]
        if status["status"] != "COMPLETED":
            print("RESULT=FAIL stage=analysis_not_completed")
            return 1
        if status["data_quality"] == "SYNTHETIC_DEMO":
            print("RESULT=FAIL stage=synthetic_leak")
            return 1

        detail = client.get(f"/api/v1/analyses/{aid}").json()
        print("sites=", len(detail["sites"]))
        print("recommended=", detail.get("recommended_site_label"))
        print("algo=", detail["algorithm_version"])

        t1 = time.perf_counter()
        e1 = client.post(f"/api/v1/analyses/{aid}/explain", json={"language": "en"})
        explain_ms = round((time.perf_counter() - t1) * 1000, 1)
        print("explain_http=", e1.status_code)
        print("explain_ms=", explain_ms)
        if e1.status_code != 200:
            err = e1.json().get("error", {})
            print("RESULT=FAIL stage=explain code=", err.get("code"), "msg=", str(err.get("message"))[:200])
            return 1
        exp = e1.json()
        print("explain_cached=", exp["cached"])
        print("explain_model=", exp["model"])
        print("unsupported_count=", len(exp.get("unsupported_numbers") or []))
        print("unsupported=", exp.get("unsupported_numbers"))
        for s in detail["sites"]:
            print("site_score=", s["label"], s.get("score"), "rank=", s.get("rank"))

        report = AIMissionReport.model_validate(exp["report"])
        contradicts = ranking_contradicts(report, exp.get("recommended_site_label"))
        print("ranking_contradicts=", contradicts)
        if contradicts:
            print("RESULT=FAIL stage=ranking_contradiction")
            return 1
        if exp.get("recommended_site_label") != detail.get("recommended_site_label"):
            print("RESULT=FAIL stage=recommendation_mismatch")
            return 1
        # Soft warnings are OK; hard-fail only if the guard missed a clear contradiction.
        # Prefer zero unsupported after window_hours is part of evidence.
        if exp.get("unsupported_numbers"):
            print("WARN unsupported_numbers_present")

        # Cache hit — second call must not be slower than a fresh DeepSeek round-trip typically;
        # more importantly, cached flag must be true.
        t2 = time.perf_counter()
        e2 = client.post(f"/api/v1/analyses/{aid}/explain", json={"language": "en"})
        cache_ms = round((time.perf_counter() - t2) * 1000, 1)
        print("cache_http=", e2.status_code, "cached=", e2.json().get("cached"), "ms=", cache_ms)
        if e2.status_code != 200 or e2.json().get("cached") is not True:
            print("RESULT=FAIL stage=cache")
            return 1

        stored = client.get(f"/api/v1/analyses/{aid}/explain?language=en")
        print("get_explain_http=", stored.status_code)
        if stored.status_code != 200:
            print("RESULT=FAIL stage=get_explain")
            return 1

        # Optional short TR call (costs tokens) — skip if we want cheaper; do one for validation.
        t3 = time.perf_counter()
        etr = client.post(f"/api/v1/analyses/{aid}/explain", json={"language": "tr"})
        tr_ms = round((time.perf_counter() - t3) * 1000, 1)
        print("explain_tr_http=", etr.status_code, "ms=", tr_ms)
        if etr.status_code != 200:
            err = etr.json().get("error", {})
            print("RESULT=FAIL stage=explain_tr code=", err.get("code"), "msg=", str(err.get("message"))[:200])
            return 1
        tr = etr.json()
        print("tr_unsupported=", tr.get("unsupported_numbers"))
        if ranking_contradicts(AIMissionReport.model_validate(tr["report"]), tr.get("recommended_site_label")):
            print("RESULT=FAIL stage=tr_ranking_contradiction")
            return 1

        print("analysis_id=", aid)
        print("RESULT=OK")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
