"""Allow-listed lunar imagery fetches (Phase 5E).

Only pre-approved WMS/WMTS endpoints may be contacted. Responses are warped into
SELENORA's south-polar stereographic CRS so Explorer can place PNGs with
``X-SELENORA-Bounds-M``. This is **not** an open URL proxy.
"""

from __future__ import annotations

import io
import logging
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import numpy as np
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

from app.science.lunar_projection import (
    MOON_LONLAT,
    MOON_POLAR_STEREO_S,
    lonlat_to_stereo,
    stereo_to_lonlat,
)
from app.services.raster_preview_service import (
    LayerNotFoundError,
    LayerUnavailableError,
    MapServiceError,
    PreviewMeta,
)

logger = logging.getLogger("selenora.imagery")

LUNASERV_WMS = "https://webmap.lroc.asu.edu/lunaserv/wms"
TREK_WAC_WMTS_TEMPLATE = (
    "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/"
    "default/default028mm/{z}/{y}/{x}.jpg"
)

MAX_HALF_EXTENT_M = 50_000.0
MAX_EDGE_PX = 768
MIN_EDGE_PX = 64
REQUEST_TIMEOUT_S = 45.0
_CACHE: dict[str, tuple[float, bytes, PreviewMeta]] = {}
_CACHE_TTL_S = 300.0
_CACHE_MAX = 32


@dataclass(frozen=True, slots=True)
class ImagerySource:
    layer_id: str
    title: str
    provider: str
    protocol: str
    endpoint: str
    remote_layer_name: str | None
    crs_native: str
    tile_format: str
    attribution: str
    product_page: str
    alignment_status: str
    preview_enabled: bool
    notes: str
    polar_coverage: str


SOURCES: tuple[ImagerySource, ...] = (
    ImagerySource(
        layer_id="lroc-wac-south-summer",
        title="LROC WAC South Pole Summer Mosaic (Lunaserv WMS)",
        provider="ASU LROC / Lunaserv",
        protocol="WMS",
        endpoint=LUNASERV_WMS,
        remote_layer_name="luna_wac_roi_south_summer",
        crs_native="EPSG:4326 (requested) → warped to SELENORA south polar stereo",
        tile_format="image/png",
        attribution=(
            "LROC WAC mosaics via ASU Lunaserv (https://webmap.lroc.asu.edu/). "
            "NASA/GSFC/Arizona State University."
        ),
        product_page="https://data.lroc.im-ldi.com/lroc/",
        alignment_status="AVAILABLE_WARPED_STEREO",
        preview_enabled=True,
        notes=(
            "GetCapabilities verified 2026-11-14. Previews are fetched as EPSG:4326 "
            "WMS GetMap for the stereo window's lon/lat envelope, then warped into "
            "SELENORA polar stereographic (a=b=1737400). MAP_VISUALIZATION_ONLY."
        ),
        polar_coverage="South-polar summer WAC mosaic (Lunaserv layer luna_wac_roi_south_summer)",
    ),
    ImagerySource(
        layer_id="moon-trek-wac-global",
        title="NASA Moon Trek LRO WAC Global Mosaic (WMTS)",
        provider="NASA Moon Trek",
        protocol="WMTS",
        endpoint=(
            "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/"
            "1.0.0/WMTSCapabilities.xml"
        ),
        remote_layer_name="LRO_WAC_Mosaic_Global_303ppd_v02",
        crs_native="EPSG:104903 (geographic lon/lat tile matrix)",
        tile_format="image/jpeg",
        attribution="NASA Moon Trek — LRO WAC Mosaic Global 303 ppd",
        product_page="https://trek.nasa.gov/moon/",
        alignment_status="REFERENCE_ONLY",
        preview_enabled=False,
        notes=(
            "WMTSCapabilities verified 2026-11-14 (EPSG:104903, JPEG tiles). "
            "Equirectangular polar sampling is severely distorted near the pole; "
            "SELENORA does not advertise this as an Explorer basemap. "
            f"Tile template (documentation only): {TREK_WAC_WMTS_TEMPLATE}"
        ),
        polar_coverage="Global EQ mosaic — not polar-stereo aligned for Explorer",
    ),
)


def list_imagery_sources() -> list[dict[str, Any]]:
    return [
        {
            "layer_id": s.layer_id,
            "title": s.title,
            "provider": s.provider,
            "protocol": s.protocol,
            "endpoint": s.endpoint,
            "remote_layer_name": s.remote_layer_name,
            "crs_native": s.crs_native,
            "tile_format": s.tile_format,
            "attribution": s.attribution,
            "product_page": s.product_page,
            "alignment_status": s.alignment_status,
            "preview_enabled": s.preview_enabled,
            "notes": s.notes,
            "polar_coverage": s.polar_coverage,
            "role": "MAP_VISUALIZATION_ONLY" if s.preview_enabled else "REFERENCE_DOC",
        }
        for s in SOURCES
    ]


def get_source(layer_id: str) -> ImagerySource | None:
    for s in SOURCES:
        if s.layer_id == layer_id:
            return s
    return None


def _cache_get(key: str) -> tuple[bytes, PreviewMeta] | None:
    hit = _CACHE.get(key)
    if hit is None:
        return None
    expires, png, meta = hit
    if time.time() > expires:
        _CACHE.pop(key, None)
        return None
    return png, meta


def _cache_put(key: str, png: bytes, meta: PreviewMeta) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        oldest = min(_CACHE.items(), key=lambda kv: kv[1][0])[0]
        _CACHE.pop(oldest, None)
    _CACHE[key] = (time.time() + _CACHE_TTL_S, png, meta)


def _stereo_window_lonlat_bbox(
    left: float, bottom: float, right: float, top: float
) -> tuple[float, float, float, float]:
    xs = np.linspace(left, right, 5)
    ys = np.linspace(bottom, top, 5)
    lons: list[float] = []
    lats: list[float] = []
    for x in xs:
        for y in ys:
            lon, lat = stereo_to_lonlat(float(x), float(y))
            lons.append(lon)
            lats.append(lat)
    return min(lons), min(lats), max(lons), max(lats)


def _http_get(url: str) -> bytes:
    import urllib.error
    import urllib.request

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "SELENORA/0.5E (NASA Space Apps; allowlisted imagery)"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
            data = resp.read()
            ctype = (resp.headers.get("Content-Type") or "").lower()
    except urllib.error.HTTPError as exc:
        raise LayerUnavailableError(
            f"Imagery upstream HTTP {exc.code}",
            details={"host": "webmap.lroc.asu.edu"},
        ) from exc
    except Exception as exc:  # pragma: no cover
        raise LayerUnavailableError(
            f"Imagery upstream failed: {type(exc).__name__}: {exc}",
        ) from exc
    if "xml" in ctype or data[:5] == b"<?xml" or data[:6] == b"<Servi":
        raise LayerUnavailableError(
            "Imagery upstream returned an error document instead of an image.",
            details={"content_type": ctype, "prefix": data[:120].decode("utf-8", "replace")},
        )
    if data[:8] != b"\x89PNG\r\n\x1a\n" and data[:2] != b"\xff\xd8":
        raise LayerUnavailableError("Imagery upstream returned an unrecognized image payload.")
    return data


def _wms_getmap_png(
    layer: str, west: float, south: float, east: float, north: float, width: int, height: int
) -> bytes:
    if abs(east - west) < 1e-6:
        west, east = west - 1.0, east + 1.0
    if abs(north - south) < 1e-6:
        south, north = south - 0.05, north + 0.05
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": layer,
        "STYLES": "",
        "FORMAT": "image/png",
        "TRANSPARENT": "true",
        "SRS": "EPSG:4326",
        "BBOX": f"{west},{south},{east},{north}",
        "WIDTH": str(width),
        "HEIGHT": str(height),
    }
    return _http_get(f"{LUNASERV_WMS}?{urlencode(params)}")


def _encode_rgb_png(rgb: np.ndarray) -> bytes:
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise LayerUnavailableError(
            "Pillow is required to encode PNG previews.",
            details={"hint": "pip install pillow"},
        ) from exc
    img = Image.fromarray(rgb, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _warp_lonlat_png_to_stereo(
    png_bytes: bytes,
    west: float,
    south: float,
    east: float,
    north: float,
    left: float,
    bottom: float,
    right: float,
    top: float,
    out_w: int,
    out_h: int,
) -> np.ndarray:
    from rasterio.io import MemoryFile

    with MemoryFile(png_bytes) as mem, mem.open() as src:
        bands = src.count
        data = src.read()
    height, width = data.shape[1], data.shape[2]
    src_transform = from_bounds(west, south, east, north, width, height)
    dst = np.zeros((bands, out_h, out_w), dtype=np.uint8)
    dst_transform = from_bounds(left, bottom, right, top, out_w, out_h)
    for b in range(bands):
        reproject(
            source=data[b],
            destination=dst[b],
            src_transform=src_transform,
            src_crs=MOON_LONLAT,
            dst_transform=dst_transform,
            dst_crs=MOON_POLAR_STEREO_S,
            resampling=Resampling.bilinear,
            src_nodata=0,
            dst_nodata=0,
        )
    rgb = np.transpose(dst, (1, 2, 0))
    if rgb.shape[2] == 4:
        rgb = rgb[:, :, :3]
    elif rgb.shape[2] == 1:
        rgb = np.repeat(rgb, 3, axis=2)
    return rgb


def render_imagery_preview(
    layer_id: str,
    *,
    latitude_deg: float | None = None,
    longitude_deg: float | None = None,
    half_extent_m: float = 8_000.0,
    bounds_m: tuple[float, float, float, float] | None = None,
    max_edge_px: int = 512,
) -> tuple[bytes, PreviewMeta]:
    source = get_source(layer_id)
    if source is None:
        raise LayerNotFoundError(f"Unknown imagery layer '{layer_id}'.")
    if not source.preview_enabled or source.alignment_status != "AVAILABLE_WARPED_STEREO":
        raise LayerUnavailableError(
            f"Imagery layer '{layer_id}' is not advertised for polar-stereo preview "
            f"(alignment_status={source.alignment_status}).",
            details={"alignment_status": source.alignment_status},
        )
    if max_edge_px < MIN_EDGE_PX or max_edge_px > MAX_EDGE_PX:
        raise MapServiceError(f"max_edge_px must be in [{MIN_EDGE_PX}, {MAX_EDGE_PX}].")

    if bounds_m is None:
        if latitude_deg is None or longitude_deg is None:
            raise MapServiceError("Provide latitude/longitude or stereo bounds_m.")
        if half_extent_m > MAX_HALF_EXTENT_M or half_extent_m < 500.0:
            raise MapServiceError(f"half_extent_m must be in [500, {MAX_HALF_EXTENT_M}].")
        pt = lonlat_to_stereo(longitude_deg, latitude_deg)
        left = pt.x_m - half_extent_m
        bottom = pt.y_m - half_extent_m
        right = pt.x_m + half_extent_m
        top = pt.y_m + half_extent_m
    else:
        left, bottom, right, top = bounds_m
        if max(right - left, top - bottom) > 2 * MAX_HALF_EXTENT_M:
            raise MapServiceError("Requested stereo window too large for imagery preview.")

    width_m = right - left
    height_m = top - bottom
    if width_m <= 0 or height_m <= 0:
        raise MapServiceError("Invalid stereo bounds.")
    scale = max(width_m, height_m) / max_edge_px
    out_w = max(MIN_EDGE_PX, int(round(width_m / scale)))
    out_h = max(MIN_EDGE_PX, int(round(height_m / scale)))

    cache_key = f"{layer_id}:{left:.0f}:{bottom:.0f}:{right:.0f}:{top:.0f}:{out_w}x{out_h}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    west, south, east, north = _stereo_window_lonlat_bbox(left, bottom, right, top)
    pad = 0.15 * max(east - west, north - south, 0.2)
    w0, s0 = west - pad, max(south - pad, -90.0)
    e0, n0 = east + pad, min(north + pad, -60.0)
    wms_png = _wms_getmap_png(
        source.remote_layer_name or "",
        w0,
        s0,
        e0,
        n0,
        width=min(1024, out_w * 2),
        height=min(1024, out_h * 2),
    )
    rgb = _warp_lonlat_png_to_stereo(
        wms_png, w0, s0, e0, n0, left, bottom, right, top, out_w, out_h
    )
    png = _encode_rgb_png(rgb)
    meta = PreviewMeta(
        layer_id=layer_id,
        role="MAP_VISUALIZATION_ONLY",
        width_px=out_w,
        height_px=out_h,
        bounds_m=(left, bottom, right, top),
        resolution_m=None,
        source_access="wms_allowlisted",
        attribution=source.attribution,
        value_min=0.0,
        value_max=255.0,
        nodata_fraction=float(np.mean(np.all(rgb == 0, axis=2))),
    )
    _cache_put(cache_key, png, meta)
    return png, meta
