"""Bounded visualization tiles. Native WMS path and legacy preview keys stay intact."""
from __future__ import annotations

import io
import json
import threading
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

from app.services import imagery_service, map_preview_cache, nasa_layer_catalog, raster_preview_service
from app.services.polar_tile_grid import GRID_VERSION, HILL_LAYER, NAC_LAYER, WAC_LAYER, tile_spec
from app.services.raster_preview_service import PreviewMeta

_acquisitions = threading.BoundedSemaphore(3)
BUNDLE = Path(__file__).resolve().parents[3] / "frontend/public/lunar-overview"


def tile_cache_spec(layer: str, z: int, x: int, y: int) -> dict:
    bounds, edge = tile_spec(layer, z, x, y)
    spec = map_preview_cache.cache_spec(layer, bounds, edge)
    spec.update(processing_version="phase5f2-tiles-v1", grid=GRID_VERSION,
                source="lunaserv-IAU2000:30120" if layer in {WAC_LAYER, NAC_LAYER} else "pgda90-hill-fixed-DN-0-255")
    return spec


def _hill_tile(bounds: tuple, edge: int) -> tuple[bytes, PreviewMeta]:
    """Fixed DN transfer and boundless masked reads prevent per-window contrast seams.

    Transparent out-of-raster pixels are absence, never fabricated terrain.
    """
    layer = nasa_layer_catalog.get_layer(HILL_LAYER)
    with rasterio.open(raster_preview_service._open_path_for_layer(layer)) as ds:
        window = from_bounds(*bounds, transform=ds.transform)
        data = ds.read(1, window=window, out_shape=(edge, edge), boundless=True,
                       masked=True, resampling=Resampling.bilinear).astype(float).filled(np.nan)
    valid = np.isfinite(data)
    gray = np.nan_to_num(np.clip(data, 0, 255), nan=0).astype(np.uint8)
    rgba = np.stack([gray, gray, gray, np.where(valid, 255, 0).astype(np.uint8)], axis=-1)
    stream = io.BytesIO()
    Image.fromarray(rgba).save(stream, format="PNG", optimize=True)
    meta = PreviewMeta(HILL_LAYER, "MAP_VISUALIZATION_ONLY", edge, edge, bounds,
                       (bounds[2] - bounds[0]) / edge, "vsicurl_window", layer.attribution,
                       float(data[valid].min()) if valid.any() else 0,
                       float(data[valid].max()) if valid.any() else 0, float(1 - valid.mean()))
    return stream.getvalue(), meta


def _bundled(layer: str, z: int, x: int, y: int, spec: dict):
    """Checked-in genuine NASA coarse tiles also bootstrap an offline deployment."""
    try:
        manifest = json.loads((BUNDLE / "manifest.json").read_text(encoding="utf-8"))
        record = manifest["tiles"][f"{layer}/{z}/{x}/{y}"]
        if record["spec"] != json.loads(json.dumps(spec)):
            return None
        png = (BUNDLE / record["file"]).read_bytes()
        import hashlib
        if hashlib.sha256(png).hexdigest() != record["sha256"]:
            return None
        meta = record["meta"]
        meta["bounds_m"] = tuple(meta["bounds_m"])
        return png, PreviewMeta(**meta)
    except (OSError, KeyError, ValueError, TypeError):
        return None


def render_tile(layer: str, z: int, x: int, y: int, *, use_bundle: bool = True):
    bounds, edge = tile_spec(layer, z, x, y)
    spec = tile_cache_spec(layer, z, x, y)

    def render():
        prepared = _bundled(layer, z, x, y, spec) if use_bundle else None
        if prepared:
            return prepared
        with _acquisitions:
            if layer == HILL_LAYER:
                return _hill_tile(bounds, edge)
            # Cache alpha-only NAC tiles too: missing coverage is not an upstream failure.
            return imagery_service.render_imagery_preview(layer, bounds_m=bounds,
                                                          max_edge_px=edge, allow_empty=True)
    return map_preview_cache.get_or_create(spec, render)
