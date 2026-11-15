"""Allow-listed lunar imagery fetches (Phase 5E).

Only pre-approved WMS/WMTS endpoints may be contacted. LROC is requested directly
in SELENORA's matching lunar polar CRS so Explorer can place PNGs with
``X-SELENORA-Bounds-M``. This is **not** an open URL proxy.
"""

from __future__ import annotations

import io
import logging
import math
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import numpy as np

from app.science.lunar_projection import (
    lonlat_to_stereo,
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

# Match raster_preview_service polar-overview cap (Phase 5F).
MAX_HALF_EXTENT_M = 400_000.0
MAX_EDGE_PX = 768
MIN_EDGE_PX = 64
REQUEST_TIMEOUT_S = 30.0
# Verified in live GetCapabilities; control points are checked against LOLA.
NATIVE_POLAR_CRS = "IAU2000:30120"


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
        layer_id="lroc-nac-2m-south-pole", title="LROC NAC 2 m South Pole Mosaic (preliminary)",
        provider="ASU LROC / Lunaserv", protocol="WMS", endpoint=LUNASERV_WMS,
        remote_layer_name="luna_nac_2m_south_pole", crs_native="IAU2000:30120",
        tile_format="image/png", attribution="NASA/GSFC/Arizona State University — preliminary LROC NAC 2 m mosaic via ASU Lunaserv",
        product_page=LUNASERV_WMS + "?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1",
        alignment_status="AVAILABLE_NATIVE_STEREO", preview_enabled=True,
        notes="2009–2010 preliminary 2 m mosaic; estimated absolute accuracy 10–20 m in service metadata. Not the controlled NAC_POLE_SOUTH_CM_AVG 1 m RDR. Alpha defines actual coverage.",
        polar_coverage="Discontinuous Shackleton / de Gerlache ridge coverage. Service advertises an uninformative global bbox; no global NAC coverage is implied.",
    ),
    ImagerySource(
        layer_id="lroc-wac-south-summer",
        title="LROC WAC South Pole Summer Mosaic (Lunaserv WMS)",
        provider="ASU LROC / Lunaserv",
        protocol="WMS",
        endpoint=LUNASERV_WMS,
        remote_layer_name="luna_wac_roi_south_summer",
        crs_native="IAU2000:30120 — south polar stereographic, R=1737400 m, lon_0=0, k=1",
        tile_format="image/png",
        attribution=(
            "LROC WAC mosaics via ASU Lunaserv (https://webmap.lroc.asu.edu/). "
            "NASA/GSFC/Arizona State University."
        ),
        product_page="https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER",
        alignment_status="AVAILABLE_NATIVE_STEREO",
        preview_enabled=True,
        notes=(
            "GetCapabilities verified 2026-11-14. Direct IAU2000:30120 GetMap uses "
            "the exact SELENORA metre bounds and output dimensions. No geographic "
            "envelope, antimeridian seam or client reprojection. MAP_VISUALIZATION_ONLY."
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
    layer: str, left: float, bottom: float, right: float, top: float, width: int, height: int
) -> bytes:
    """An exact projected BBOX, including windows crossing geographic ±180°.

    IAU2000:30120 has a=b=1737400, lat_0=-90, lon_0=0 and k=1.
    These axes are identical to SELENORA/LOLA. WMS 1.1.1 uses x,y order.
    No degree padding or geographic WMS fallback is permitted here.
    """
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetMap",
        "LAYERS": layer, "STYLES": "", "FORMAT": "image/png",
        "TRANSPARENT": "true", "SRS": NATIVE_POLAR_CRS,
        "BBOX": ",".join(format(v, ".15g") for v in (left, bottom, right, top)),
        "WIDTH": str(width), "HEIGHT": str(height),
    }
    return _http_get(f"{LUNASERV_WMS}?{urlencode(params)}")


def render_imagery_preview(
    layer_id: str,
    *,
    latitude_deg: float | None = None,
    longitude_deg: float | None = None,
    half_extent_m: float = 8_000.0,
    bounds_m: tuple[float, float, float, float] | None = None,
    max_edge_px: int = 512,
    allow_empty: bool = False,
) -> tuple[bytes, PreviewMeta]:
    source = get_source(layer_id)
    if source is None:
        raise LayerNotFoundError(f"Unknown imagery layer '{layer_id}'.")
    if not source.preview_enabled or source.alignment_status != "AVAILABLE_NATIVE_STEREO":
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

    if not all(math.isfinite(v) for v in (left, bottom, right, top)):
        raise MapServiceError("Bounds must be finite.")
    width_m = right - left
    height_m = top - bottom
    if width_m <= 0 or height_m <= 0:
        raise MapServiceError("Invalid stereo bounds.")
    # Each dimension follows the physical aspect ratio, even for a thin window.
    scale = max(width_m, height_m) / max_edge_px
    out_w = max(1, int(round(width_m / scale)))
    out_h = max(1, int(round(height_m / scale)))
    png = _wms_getmap_png(
        source.remote_layer_name or "", left, bottom, right, top, out_w, out_h,
    )
    from PIL import Image

    with Image.open(io.BytesIO(png)) as image:
        image.load()
        if image.format != "PNG" or image.size != (out_w, out_h):
            raise LayerUnavailableError("Upstream image dimensions do not match the requested polar window.")
        # Black is valid lunar shadow. Only the source alpha denotes missing data.
        alpha = np.asarray(image.convert("RGBA"))[:, :, 3]
        nodata_fraction = float(np.mean(alpha == 0))
        if nodata_fraction == 1.0 and not allow_empty:
            raise LayerUnavailableError("LROC has no photographic coverage in this window.")
    meta = PreviewMeta(
        layer_id=layer_id, role="MAP_VISUALIZATION_ONLY",
        width_px=out_w, height_px=out_h, bounds_m=(left, bottom, right, top),
        resolution_m=max(width_m / out_w, height_m / out_h),
        source_access="wms_allowlisted", attribution=source.attribution,
        value_min=0.0, value_max=255.0, nodata_fraction=nodata_fraction,
    )
    # Return the original PNG bytes, including its alpha; never invent/stretch pixels.
    return png, meta
