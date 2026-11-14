"""Prepare real NASA startup images before serving traffic.

    cd backend
    python -m app.services.prepare_map_previews

Run on deployment (or after changing the processing version). Derived PNGs and
their exact bounds/CRS/provenance live in gitignored data/cache/map_previews.
An empty cache still works, but first acquisition necessarily requires NASA.
"""

from __future__ import annotations

import json
import time

from app.services.map_preview_service import STARTUP_BOUNDS, STARTUP_EDGE, STARTUP_LAYERS, render_preview


def main() -> None:
    failed = []
    # Prepare the fallback first so a LROC outage cannot prevent a useful map.
    for mode in ("hillshade", "photo"):
        started = time.perf_counter()
        try:
            png, meta = render_preview(STARTUP_LAYERS[mode], bounds_m=STARTUP_BOUNDS, max_edge_px=STARTUP_EDGE)
            print(json.dumps({"mode": mode, "seconds": round(time.perf_counter() - started, 3),
                              "bytes": len(png), "meta": meta.__dict__ if hasattr(meta, "__dict__") else {
                                  "bounds_m": meta.bounds_m, "size": [meta.width_px, meta.height_px],
                                  "cache": meta.cache_status, "key": meta.cache_key,
                              }}), flush=True)
        except Exception as exc:
            failed.append(mode)
            print(json.dumps({"mode": mode, "error": str(exc)}), flush=True)
    if failed:
        raise SystemExit(f"Could not prepare: {', '.join(failed)}. Retry before publishing.")


if __name__ == "__main__":
    main()
