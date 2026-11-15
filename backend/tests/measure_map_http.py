"""Measure real loopback API cache behavior after a browser cold visit."""

from __future__ import annotations

import argparse
import concurrent.futures
import io
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageStat


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8042)
    parser.add_argument("--warm-only", action="store_true")
    args = parser.parse_args()
    results = []

    def request(name, bounds, edge=768):
        params = dict(layer_id="lroc-wac-south-summer", left_m=bounds[0], bottom_m=bounds[1],
                      right_m=bounds[2], top_m=bounds[3], max_edge_px=edge)
        started = time.perf_counter()
        result = {"scenario": name, "bounds": bounds, "edge": edge}
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{args.port}/api/v1/maps/preview?" + urllib.parse.urlencode(params), timeout=120) as response:
                data = response.read()
                result.update(status=response.status, cache=response.headers.get("X-SELENORA-Cache"),
                              cache_key=response.headers.get("X-SELENORA-Cache-Key"), crs=response.headers.get("X-SELENORA-CRS"),
                              returned_bounds=response.headers.get("X-SELENORA-Bounds-M"), bytes=len(data))
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                result.update(size=image.size, channel_stddev=ImageStat.Stat(image.convert("RGB")).stddev)
        except Exception as exc:
            result["error"] = str(exc)
        result["seconds"] = round(time.perf_counter() - started, 5)
        return result

    initial = (-64000, -64000, 64000, 64000)
    results.append(request("warm-startup-server", initial))
    results.append(request("warm-startup-server-repeat", initial))
    nearby = (-16000, -26000, 8000, -2000)
    if not args.warm_only:
        cold = request("new-region-cold", nearby, 512)
        results.append(cold)
        if "error" in cold:
            results.append(request("new-region-retry", nearby, 512))
    results.append(request("new-region-warm", nearby, 512))
    if not args.warm_only:
        duplicate = (-14000, -24000, 6000, -4000)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results.extend(pool.map(lambda index: request(f"concurrent-{index}", duplicate, 256), range(2)))
    filename = "http-warm-confirmation.json" if args.warm_only else "http-metrics.json"
    output = Path(__file__).resolve().parents[2] / "docs/screenshots/phase5f1" / filename
    output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2), flush=True)


if __name__ == "__main__":
    main()
