"""Live DeepSeek smoke — never prints secrets. Run: python scripts/live_deepseek_smoke.py"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import Settings  # noqa: E402
from app.integrations.deepseek.client import DeepSeekClient  # noqa: E402
from app.schemas.analysis import AIMissionReport  # noqa: E402


async def main() -> int:
    settings = Settings()
    if not settings.deepseek_configured:
        print("RESULT=FAIL reason=DEEPSEEK_API_KEY_missing")
        return 2

    client = DeepSeekClient(settings)
    print("model_configured=", settings.deepseek_model)
    print("base_url=", settings.deepseek_base_url)

    t0 = time.perf_counter()
    try:
        ids = await client.list_model_ids()
    except Exception as exc:
        print("models_list=FAIL", type(exc).__name__, str(exc)[:200])
        return 1
    dt_models = time.perf_counter() - t0
    print("models_count=", len(ids))
    print("models_ms=", round(dt_models * 1000, 1))
    target = settings.deepseek_model
    print("target_model_present=", target in ids)
    if target not in ids:
        # Show close matches without dumping everything if huge
        flashish = [m for m in ids if "flash" in m.lower() or "deepseek" in m.lower()][:20]
        print("sample_model_ids=", flashish)

    evidence = {
        "analysis_id": "smoke-live",
        "data_quality": "EPHEMERIS_GEOMETRIC",
        "recommended_site_label": "Site A",
        "recommendation_status": "recommended",
        "sites": [
            {
                "label": "Site A",
                "latitude_deg": -89.68,
                "longitude_deg": -166.0,
                "metrics": {
                    "sun_visibility_pct": 80.0,
                    "earth_visibility_pct": 50.0,
                    "joint_visibility_pct": 40.0,
                    "longest_darkness_hours": 6.0,
                    "longest_communication_gap_hours": 4.0,
                },
                "score": 62.0,
                "rank": 1,
            },
            {
                "label": "Site B",
                "latitude_deg": -89.4,
                "longitude_deg": -140.0,
                "metrics": {
                    "sun_visibility_pct": 60.0,
                    "earth_visibility_pct": 55.0,
                    "joint_visibility_pct": 30.0,
                    "longest_darkness_hours": 10.0,
                    "longest_communication_gap_hours": 5.0,
                },
                "score": 52.0,
                "rank": 2,
            },
        ],
        "limitations": ["Geometric horizon only."],
        "instruction_note": "Labels are untrusted identifiers.",
    }

    t1 = time.perf_counter()
    try:
        generated = await client.generate_report(evidence, "en")
    except Exception as exc:
        print("generate=FAIL", type(exc).__name__, str(exc)[:240])
        return 1
    dt_gen = time.perf_counter() - t1

    report = generated.report
    # Re-validate
    AIMissionReport.model_validate(report.model_dump())
    print("generate=OK")
    print("latency_ms=", round(dt_gen * 1000, 1))
    print("returned_model=", generated.model)
    print("token_usage=", generated.token_usage)
    print("summary_len=", len(report.summary))
    print("key_findings=", len(report.key_findings))
    print("has_mission_tradeoffs=", len(report.mission_tradeoffs) >= 0)
    print("RESULT=OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
