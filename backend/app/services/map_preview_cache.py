"""Versioned, atomic disk cache for derived map images (never scientific inputs).

One Future per key coalesces concurrent requests in a server process. Atomic
replacement and checksums also make files safe to share between worker processes;
deploy the preparation command before starting workers to warm the startup views.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import threading
import time
import uuid
from contextlib import contextmanager
from concurrent.futures import Future
from dataclasses import asdict, replace
from pathlib import Path
from typing import Callable

from PIL import Image

from app.core.config import get_settings
from app.services.raster_preview_service import PreviewMeta

logger = logging.getLogger("selenora.map_cache")
PROCESSING_VERSION = "phase5f1-polar-direct-v1"
MAP_CRS = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +a=1737400 +b=1737400 +units=m"
_guard = threading.Lock()
_inflight: dict[str, Future[tuple[bytes, PreviewMeta]]] = {}


def cache_dir() -> Path:
    # Explicit process env also keeps test/QA caches independent of cached Settings.
    return Path(os.environ.get("SELENORA_MAP_CACHE_DIR", str(get_settings().map_cache_dir)))


def cache_spec(layer_id: str, bounds: tuple[float, float, float, float], edge: int) -> dict:
    """Keep exact finite bounds: sub-metre requests must never collide."""
    return {
        "layer": layer_id,
        "bounds_m": [float(v) if v else 0.0 for v in bounds],
        "crs": MAP_CRS,
        "max_edge_px": edge,
        "output_dimensions": output_dimensions(bounds, edge),
        "source": "lunaserv-IAU2000:30120" if layer_id == "lroc-wac-south-summer" else "nasa-layer-catalog-v1",
        "processing_version": PROCESSING_VERSION,
    }


def output_dimensions(bounds: tuple[float, float, float, float], edge: int) -> tuple[int, int]:
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    scale = max(width, height) / edge
    return max(1, round(width / scale)), max(1, round(height / scale))


def cache_key(spec: dict) -> str:
    return hashlib.sha256(json.dumps(spec, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def read_cached(spec: dict) -> tuple[bytes, PreviewMeta] | None:
    key = cache_key(spec)
    root = cache_dir()
    try:
        record = json.loads((root / f"{key}.json").read_text(encoding="utf-8"))
        # JSON round-trip normalises tuples to lists.
        if record["spec"] != json.loads(json.dumps(spec)):
            return None
        png = (root / f"{key}.png").read_bytes()
        if hashlib.sha256(png).hexdigest() != record["sha256"]:
            return None
        meta = record["meta"]
        with Image.open(io.BytesIO(png)) as image:
            if image.size != (meta["width_px"], meta["height_px"]):
                return None
            image.verify()
        meta["bounds_m"] = tuple(meta["bounds_m"])
        return png, replace(PreviewMeta(**meta), cache_status="HIT", cache_key=key)
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _write(spec: dict, png: bytes, meta: PreviewMeta) -> None:
    root = cache_dir()
    root.mkdir(parents=True, exist_ok=True)
    key = cache_key(spec)
    record = {"spec": spec, "meta": asdict(meta), "sha256": hashlib.sha256(png).hexdigest()}
    nonce = uuid.uuid4().hex
    png_tmp = root / f"{key}.{nonce}.png.tmp"
    json_tmp = root / f"{key}.{nonce}.json.tmp"
    try:
        png_tmp.write_bytes(png)
        json_tmp.write_text(json.dumps(record, allow_nan=False), encoding="utf-8")
        os.replace(png_tmp, root / f"{key}.png")
        os.replace(json_tmp, root / f"{key}.json")
    finally:
        png_tmp.unlink(missing_ok=True)
        json_tmp.unlink(missing_ok=True)
    # Bound derived storage, keeping the two prepared startup overviews pinned.
    records = list(root.glob("*.json"))
    if len(records) > 256:
        candidates = sorted(records, key=lambda path: path.stat().st_mtime)
        for path in candidates:
            if len(records) <= 256:
                break
            try:
                old = json.loads(path.read_text(encoding="utf-8"))["spec"]
                if old["bounds_m"] == [-64000.0, -64000.0, 64000.0, 64000.0] and old["max_edge_px"] == 768:
                    continue
                path.with_suffix(".png").unlink(missing_ok=True)
                path.unlink(missing_ok=True)
                records.pop()
            except (OSError, ValueError, KeyError):
                continue


@contextmanager
def _disk_lock(key: str):
    """Coalesce identical requests across processes sharing the cache directory."""
    root = cache_dir()
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{key}.lock"
    token = uuid.uuid4().hex.encode()
    deadline = time.monotonic() + 120
    while True:
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "wb") as handle:
                handle.write(token)
            break
        except FileExistsError:
            try:
                if time.time() - path.stat().st_mtime > 300:
                    path.unlink(missing_ok=True)
                    continue
            except FileNotFoundError:
                continue
            if time.monotonic() > deadline:
                raise TimeoutError("Timed out waiting for this map preview.")
            time.sleep(0.05)
    try:
        yield
    finally:
        try:
            if path.read_bytes() == token:
                path.unlink(missing_ok=True)
        except FileNotFoundError:
            pass


def get_or_create(spec: dict, render: Callable[[], tuple[bytes, PreviewMeta]]) -> tuple[bytes, PreviewMeta]:
    cached = read_cached(spec)
    if cached is not None:
        return cached
    key = cache_key(spec)
    with _guard:
        pending = _inflight.get(key)
        owner = pending is None
        if pending is None:
            pending = Future()
            _inflight[key] = pending
    if not owner:
        png, meta = pending.result(timeout=120)
        return png, replace(meta, cache_status="COALESCED")
    try:
        # Recheck after acquiring ownership (another request may have just finished).
        with _disk_lock(key):
            result = read_cached(spec)
            if result is None:
                png, meta = render()
                meta = replace(meta, cache_status="MISS", cache_key=key)
                try:
                    _write(spec, png, meta)
                except OSError:
                    logger.warning("map_preview_cache_write_failed", exc_info=True)
                result = png, meta
        pending.set_result(result)
        return result
    except BaseException as exc:
        pending.set_exception(exc)
        raise
    finally:
        with _guard:
            _inflight.pop(key, None)
