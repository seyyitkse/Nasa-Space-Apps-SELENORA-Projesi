"""Deployment: python -m app.services.prepare_polar_overviews [--export-bundle].

Thirty-eight 240px tiles, never bulk RDRs. The checked-in bundle is usable offline;
normal deployment imports it into the persistent cache before workers start.
Export reuses verified disk entries, acquires missing data and records provenance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from dataclasses import asdict

from app.services.polar_tile_grid import GRID_VERSION, WAC_LAYER, HILL_LAYER
from app.services.polar_tile_service import BUNDLE, render_tile, tile_cache_spec


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-bundle", action="store_true")
    args = parser.parse_args()
    tiles = [(WAC_LAYER, 0, x, y) for x in range(2) for y in range(2)]
    tiles += [(layer, 1, x, y) for layer in (HILL_LAYER, WAC_LAYER) for x in (1, 2) for y in (1, 2)]
    # Full-resolution WAC startup coverage, including the tall mobile viewport.
    tiles += [(WAC_LAYER, 5, x, y) for x in range(30, 34) for y in range(30, 35)]
    tiles += [(WAC_LAYER, 4, x, y) for x in (15, 16) for y in (15, 16, 17)]
    manifest = {"grid": GRID_VERSION, "crs": "IAU2000:30120", "tiles": {}}
    failures = []
    for layer, z, x, y in tiles:
        started = time.perf_counter()
        key = f"{layer}/{z}/{x}/{y}"
        try:
            png, meta = render_tile(layer, z, x, y, use_bundle=not args.export_bundle)
            filename = f"{layer}-{z}-{x}-{y}.png"
            if args.export_bundle:
                BUNDLE.mkdir(parents=True, exist_ok=True)
                (BUNDLE / filename).write_bytes(png)
            manifest["tiles"][key] = {"file": filename, "sha256": hashlib.sha256(png).hexdigest(),
                                      "spec": tile_cache_spec(layer, z, x, y), "meta": asdict(meta)}
            print(json.dumps({"tile": key, "seconds": round(time.perf_counter() - started, 3),
                              "bytes": len(png), "cache": meta.cache_status,
                              "nodata": meta.nodata_fraction}), flush=True)
        except Exception as exc:
            failures.append(key)
            print(json.dumps({"tile": key, "error": str(exc)}), flush=True)
    if failures:
        raise SystemExit(f"Overview preparation failed: {failures}; do not publish this deployment.")
    if args.export_bundle:
        (BUNDLE / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
