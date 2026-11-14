"""Single entry point for cached photographic and genuine LOLA map previews."""

from __future__ import annotations

import math

from app.services import imagery_service, map_preview_cache, nasa_layer_catalog, raster_preview_service
from app.services.raster_preview_service import MapServiceError, PreviewMeta

STARTUP_BOUNDS = (-64_000.0, -64_000.0, 64_000.0, 64_000.0)
STARTUP_EDGE = 768
STARTUP_LAYERS = {"photo": "lroc-wac-south-summer", "hillshade": "ldem-80s-80mpp-hill"}


def render_preview(layer_id: str, *, latitude_deg: float | None = None,
                   longitude_deg: float | None = None, half_extent_m: float = 8_000,
                   bounds_m: tuple[float, float, float, float] | None = None,
                   max_edge_px: int = 512) -> tuple[bytes, PreviewMeta]:
    if not 64 <= max_edge_px <= 768:
        raise MapServiceError("max_edge_px must be in [64, 768].")
    bounds = raster_preview_service.resolve_stereo_window(
        latitude_deg=latitude_deg, longitude_deg=longitude_deg,
        half_extent_m=half_extent_m, bounds_m=bounds_m,
    )
    if not all(math.isfinite(v) for v in bounds):
        raise MapServiceError("Bounds must be finite.")
    layer = nasa_layer_catalog.get_layer(layer_id)
    render = imagery_service.render_imagery_preview if imagery_service.get_source(layer_id) or layer and layer.access_mode in {
        "wms_allowlisted", "wmts_allowlisted"
    } else raster_preview_service.render_preview_png
    spec = map_preview_cache.cache_spec(layer_id, bounds, max_edge_px)
    return map_preview_cache.get_or_create(spec, lambda: render(
        layer_id, bounds_m=bounds, max_edge_px=max_edge_px,
    ))


def startup_cached(kind: str) -> tuple[bytes, PreviewMeta] | None:
    return map_preview_cache.read_cached(map_preview_cache.cache_spec(
        STARTUP_LAYERS[kind], STARTUP_BOUNDS, STARTUP_EDGE,
    ))
