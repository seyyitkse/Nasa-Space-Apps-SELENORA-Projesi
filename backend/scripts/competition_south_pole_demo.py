"""Competition jury demo: two south-polar sites × real Horizons × DeepSeek.

Uses only seeded south-polar reference coordinates (Bussey et al. 2010 Points A/B).
Never uses equatorial or mid-latitude fillers. Prints no secrets.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.schemas.analysis import AIMissionReport  # noqa: E402
from app.services.ai_guard import ranking_contradicts  # noqa: E402

# Approximate south-polar references — same as backend/app/db/seed.py
# Coordinate frame: planetocentric / east-positive lon (SELENORA convention).
# Sources: Bussey et al. (2010), Icarus 208; verify before scientific publication.
SITE_A = {
    "label": "Shackleton Rim Point A",
    "latitude_deg": -89.68,
    "longitude_deg": -166.0,
    "landing_site_id": "shackleton-rim-a",
}
SITE_B = {
    "label": "Connecting Ridge Point B",
    "latitude_deg": -89.44,
    "longitude_deg": -141.8,
    "landing_site_id": "connecting-ridge-b",
}

# Multi-day polar summer-ish window used in Phase 2 fixtures (Dec).
START = "2026-12-01T00:00:00Z"
END = "2026-12-05T00:00:00Z"
STEP = 360


def main() -> int:
    settings = get_settings()
    if not settings.deepseek_configured:
        print("RESULT=FAIL reason=DEEPSEEK_API_KEY_missing")
        return 2

    body = {
        "mission_name": "Competition Jury — South Pole Pair",
        "sites": [SITE_A, SITE_B],
        "start_utc": START,
        "end_utc": END,
        "time_step_minutes": STEP,
        "horizon_model": "GEOMETRIC",
        "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
    }

    app = create_app(settings)
    with TestClient(app) as client:
        t0 = time.perf_counter()
        r = client.post("/api/v1/analyses", json=body)
        analysis_ms = round((time.perf_counter() - t0) * 1000, 1)
        print("analysis_http=", r.status_code, "ms=", analysis_ms)
        if r.status_code not in (200, 202):
            print("RESULT=FAIL stage=analysis", r.text[:300])
            return 1
        status = r.json()
        aid = status["id"]
        print("analysis_id=", aid)
        print("status=", status["status"], "quality=", status["data_quality"])
        if status["status"] != "COMPLETED" or status["data_quality"] == "SYNTHETIC_DEMO":
            print("RESULT=FAIL stage=quality")
            return 1

        detail = client.get(f"/api/v1/analyses/{aid}").json()
        print("window=", detail["start_utc"], "→", detail["end_utc"])
        print("recommended=", detail.get("recommended_site_label"))
        for s in detail["sites"]:
            m = s["metrics"]
            print(
                "SITE",
                s["label"],
                "rank=",
                s["rank"],
                "score=",
                s["score"],
                "sun%=",
                m["sun_visibility_pct"],
                "earth%=",
                m["earth_visibility_pct"],
                "joint%=",
                m["joint_visibility_pct"],
                "dark_h=",
                m["longest_darkness_hours"],
                "comm_gap_h=",
                m["longest_communication_gap_hours"],
            )
            # Sanity: both sites must be south polar
            if s["latitude_deg"] > -80:
                print("RESULT=FAIL stage=not_south_polar", s["label"])
                return 1

        tl = client.get(f"/api/v1/analyses/{aid}/timeline").json()
        print("timeline_sites=", len(tl["sites"]), "points0=", len(tl["sites"][0]["points"]))

        t1 = time.perf_counter()
        e1 = client.post(f"/api/v1/analyses/{aid}/explain", json={"language": "en"})
        explain_ms = round((time.perf_counter() - t1) * 1000, 1)
        print("explain_http=", e1.status_code, "ms=", explain_ms)
        if e1.status_code != 200:
            err = e1.json().get("error", {})
            print("RESULT=FAIL stage=explain", err.get("code"), str(err.get("message"))[:200])
            return 1
        exp = e1.json()
        print("explain_cached=", exp["cached"], "model=", exp["model"])
        print("unsupported=", exp.get("unsupported_numbers"))
        report = AIMissionReport.model_validate(exp["report"])
        if ranking_contradicts(report, exp.get("recommended_site_label")):
            print("RESULT=FAIL stage=ranking_contradiction")
            return 1
        if exp.get("recommended_site_label") != detail.get("recommended_site_label"):
            print("RESULT=FAIL stage=recommendation_mismatch")
            return 1

        e2 = client.post(f"/api/v1/analyses/{aid}/explain", json={"language": "en"})
        print("cache_hit=", e2.json().get("cached"), "ms=", "fast" if e2.elapsed.total_seconds() < 1 else e2.elapsed)

        out = {
            "analysis_id": aid,
            "mission_name": detail["mission_name"],
            "algorithm_version": detail.get("algorithm_version"),
            "start_utc": detail["start_utc"],
            "end_utc": detail["end_utc"],
            "data_quality": detail["data_quality"],
            "recommended_site_label": detail.get("recommended_site_label"),
            "sites": [
                {
                    "label": s["label"],
                    "latitude_deg": s["latitude_deg"],
                    "longitude_deg": s["longitude_deg"],
                    "rank": s["rank"],
                    "score": s["score"],
                    "metrics": s["metrics"],
                }
                for s in detail["sites"]
            ],
            "explain_model": exp["model"],
            "explain_cached_second_call": e2.json().get("cached"),
            "summary_preview": report.summary[:240],
            "coordinate_note": (
                "Approximate Bussey et al. (2010) Points A/B; "
                "APPROXIMATE_REFERENCE — not official Artemis III polygons."
            ),
        }
        out_path = Path(__file__).resolve().parents[2] / "docs" / "competition_demo_snapshot.json"
        out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
        print("snapshot=", out_path.name)
        print("RESULT=OK")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
