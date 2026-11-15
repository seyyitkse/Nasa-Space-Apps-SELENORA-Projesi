"""Loopback-only browser QA: isolated cache/DB, measured real upstream requests.

Run from backend: python tests/browser_map_server.py --port 8042 --cache-dir ../data/cache/browser_cold
Create <cache-dir>/lroc-offline to simulate a remote LROC 503, remove it to recover.
No production endpoint or settings flag is added for failure injection.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8042)
    parser.add_argument("--cache-dir", type=Path, required=True)
    args = parser.parse_args()
    root = args.cache_dir.resolve()
    root.mkdir(parents=True, exist_ok=True)
    os.environ["SELENORA_MAP_CACHE_DIR"] = str(root)
    from app.core.config import Settings
    from app.main import create_app
    from app.services import imagery_service
    from app.services.raster_preview_service import LayerUnavailableError
    import uvicorn

    original = imagery_service._http_get

    def measured(url: str) -> bytes:
        started = time.perf_counter()
        record = {"url": url, "started_utc": time.time()}
        try:
            if (root / "lroc-offline").exists():
                raise LayerUnavailableError("Browser QA: simulated remote LROC HTTP 503")
            result = original(url)
            record["bytes"] = len(result)
            return result
        except Exception as exc:
            record["error"] = str(exc)
            raise
        finally:
            record["seconds"] = round(time.perf_counter() - started, 4)
            with (root / "upstream.jsonl").open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record) + "\n")

    imagery_service._http_get = measured
    settings = Settings(environment="test", database_url=f"sqlite:///{(root / 'browser_qa.db').as_posix()}",
                        rate_limit_per_minute=10000, cors_origins=["http://127.0.0.1:5182"],
                        DEEPSEEK_API_KEY=None, _env_file=None)
    uvicorn.run(create_app(settings), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
