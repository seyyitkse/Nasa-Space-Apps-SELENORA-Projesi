"""Deterministic cache keys for analysis results.

The key covers every input that can change the numbers: coordinates, date
range, time resolution, horizon mode, algorithm version and data-source version.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime


def analysis_cache_key(
    *,
    sites: list[tuple[float, float]],
    start_utc: datetime,
    end_utc: datetime,
    time_step_minutes: int,
    horizon_model: str,
    algorithm_version: str,
    data_source_version: str,
) -> str:
    canonical = {
        "sites": sorted([round(lat, 6), round(lon, 6)] for lat, lon in sites),
        "start": start_utc.astimezone(UTC).isoformat(),
        "end": end_utc.astimezone(UTC).isoformat(),
        "step": time_step_minutes,
        "horizon": horizon_model,
        "algo": algorithm_version,
        "data": data_source_version,
    }
    blob = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(blob).hexdigest()
