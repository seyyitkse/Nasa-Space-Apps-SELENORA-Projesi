"""Bounded raster window reads → PNG previews (Phase 5B).

Never streams original GeoTIFF bytes to clients. Caps pixel count and stereo
extent. Local Site01/04 DEMs preferred for science-adjacent previews; remote
PGDA Product 90 assets use GDAL ``/vsicurl/`` window reads when available.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

from app.core.errors import AppError
from app.science.lunar_projection import lonlat_to_stereo
from app.services.nasa_layer_catalog import NasaLayer, get_layer
from app.services import terrain_data_service

logger = logging.getLogger("selenora.maps")

MAX_PREVIEW_EDGE_PX = 1024
# Phase 5F: polar overview needs ~300 km half-extent; keep a hard science-safe cap.
MAX_HALF_EXTENT_M = 400_000.0
MIN_HALF_EXTENT_M = 250.0
DEFAULT_HALF_EXTENT_M = 8_000.0


class MapServiceError(AppError):
    status_code = 400
    code = "MAP_SERVICE_ERROR"


class LayerNotFoundError(AppError):
    status_code = 404
    code = "LAYER_NOT_FOUND"


class LayerUnavailableError(AppError):
    status_code = 503
    code = "LAYER_UNAVAILABLE"


@dataclass(frozen=True, slots=True)
class PreviewMeta:
    layer_id: str
    role: str
    width_px: int
    height_px: int
    bounds_m: tuple[float, float, float, float]
    resolution_m: float | None
    source_access: str
    attribution: str
    value_min: float
    value_max: float
    nodata_fraction: float
    cache_status: str = ""
    cache_key: str = ""


def _configure_gdal_curl() -> None:
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.tiff,.TIFF")
    os.environ.setdefault("GDAL_HTTP_TIMEOUT", "60")
    os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "2")


def _open_path_for_layer(layer: NasaLayer) -> str:
    if layer.access_mode == "local_file":
        if not layer.local_glob:
            raise LayerUnavailableError(f"Layer {layer.id} has no local path pattern.")
        root = terrain_data_service.DEFAULT_LOLA_DIR
        matches = sorted(root.glob(layer.local_glob))
        if not matches:
            raise LayerUnavailableError(
                f"Local file for {layer.id} not found under {root}.",
                details={"expected": layer.local_glob},
            )
        return str(matches[0])
    if layer.access_mode == "vsicurl_window":
        if not layer.source_url:
            raise LayerUnavailableError(f"Layer {layer.id} missing remote URL.")
        _configure_gdal_curl()
        return f"/vsicurl/{layer.source_url}"
    raise MapServiceError(
        f"Layer {layer.id} is documentation-only and cannot be previewed as a raster.",
        details={"access_mode": layer.access_mode},
    )


def resolve_stereo_window(
    *,
    latitude_deg: float | None,
    longitude_deg: float | None,
    half_extent_m: float,
    bounds_m: tuple[float, float, float, float] | None,
) -> tuple[float, float, float, float]:
    if bounds_m is not None:
        left, bottom, right, top = bounds_m
        if right <= left or top <= bottom:
            raise MapServiceError("Invalid bounds_m: require left<right and bottom<top.")
        width = right - left
        height = top - bottom
        if max(width, height) > 2 * MAX_HALF_EXTENT_M:
            raise MapServiceError(
                f"Requested stereo window too large (max half-extent {MAX_HALF_EXTENT_M} m)."
            )
        return left, bottom, right, top
    if latitude_deg is None or longitude_deg is None:
        raise MapServiceError("Provide latitude_deg+longitude_deg or bounds_m.")
    half = float(half_extent_m)
    if not (MIN_HALF_EXTENT_M <= half <= MAX_HALF_EXTENT_M):
        raise MapServiceError(
            f"half_extent_m must be in [{MIN_HALF_EXTENT_M}, {MAX_HALF_EXTENT_M}]."
        )
    pt = lonlat_to_stereo(longitude_deg, latitude_deg)
    return pt.x_m - half, pt.y_m - half, pt.x_m + half, pt.y_m + half


def _stretch_to_uint8(data: np.ndarray) -> np.ndarray:
    valid = np.isfinite(data)
    out = np.zeros(data.shape, dtype=np.uint8)
    if not np.any(valid):
        return out
    vals = data[valid].astype(float)
    lo, hi = np.percentile(vals, [2, 98])
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        lo, hi = float(vals.min()), float(vals.max())
        if hi <= lo:
            out[valid] = 128
            return out
    scaled = (data - lo) / (hi - lo)
    scaled = np.clip(scaled, 0.0, 1.0)
    out[valid] = (scaled[valid] * 255.0).astype(np.uint8)
    return out


def render_preview_png(
    layer_id: str,
    *,
    latitude_deg: float | None = None,
    longitude_deg: float | None = None,
    half_extent_m: float = DEFAULT_HALF_EXTENT_M,
    bounds_m: tuple[float, float, float, float] | None = None,
    max_edge_px: int = 512,
) -> tuple[bytes, PreviewMeta]:
    layer = get_layer(layer_id)
    if layer is None:
        raise LayerNotFoundError(f"Unknown layer id '{layer_id}'.")
    if max_edge_px < 64 or max_edge_px > MAX_PREVIEW_EDGE_PX:
        raise MapServiceError(f"max_edge_px must be in [64, {MAX_PREVIEW_EDGE_PX}].")

    left, bottom, right, top = resolve_stereo_window(
        latitude_deg=latitude_deg,
        longitude_deg=longitude_deg,
        half_extent_m=half_extent_m,
        bounds_m=bounds_m,
    )
    path = _open_path_for_layer(layer)
    with rasterio.open(path) as ds:
        window = from_bounds(left, bottom, right, top, transform=ds.transform)
        window = window.intersection(
            rasterio.windows.Window(0, 0, ds.width, ds.height)
        )
        if window.width <= 0 or window.height <= 0:
            raise MapServiceError(
                "Requested window does not intersect the raster extent.",
                details={"layer_id": layer_id, "bounds_m": [left, bottom, right, top]},
            )
        # Downsample to max_edge_px while reading.
        scale = max(window.width / max_edge_px, window.height / max_edge_px, 1.0)
        out_w = max(1, int(round(window.width / scale)))
        out_h = max(1, int(round(window.height / scale)))
        data = ds.read(
            1,
            window=window,
            out_shape=(out_h, out_w),
            resampling=Resampling.bilinear,
            boundless=False,
            masked=True,
        ).astype(float).filled(np.nan)
        nodata = ds.nodata
        if nodata is not None and not (isinstance(nodata, float) and np.isnan(nodata)):
            data = np.where(data == nodata, np.nan, data)
        # Actual geographic window after intersection
        transform = ds.window_transform(window)
        # Approximate bounds of the intersected window in map units
        # (pixel corners of full-res window, not out_shape).
        c0, r0 = window.col_off, window.row_off
        c1, r1 = c0 + window.width, r0 + window.height
        xs = [transform.c, transform.c + transform.a * window.width]
        # With north-up polar stereo, e is typically negative.
        ys = [transform.f, transform.f + transform.e * window.height]
        real_bounds = (min(xs), min(ys), max(xs), max(ys))
        _ = (c0, r0, c1, r1)  # kept for clarity / future debug

    valid = np.isfinite(data)
    if not np.any(valid):
        raise LayerUnavailableError("No NASA raster coverage in this window.")
    nodata_fraction = float(1.0 - valid.mean()) if data.size else 1.0
    vmin = float(np.nanmin(data)) if np.any(valid) else float("nan")
    vmax = float(np.nanmax(data)) if np.any(valid) else float("nan")
    gray = _stretch_to_uint8(data)
    rgba = np.stack([gray, gray, gray, np.where(valid, 255, 0).astype(np.uint8)], axis=-1)

    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise LayerUnavailableError(
            "Pillow is required to encode PNG previews.",
            details={"hint": "pip install pillow"},
        ) from exc

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    meta = PreviewMeta(
        layer_id=layer.id,
        role=layer.role,
        width_px=out_w,
        height_px=out_h,
        bounds_m=real_bounds,
        resolution_m=layer.resolution_m,
        source_access=layer.access_mode,
        attribution=layer.attribution,
        value_min=vmin,
        value_max=vmax,
        nodata_fraction=nodata_fraction,
    )
    return buf.getvalue(), meta


def sample_elevation(
    layer_id: str,
    latitude_deg: float,
    longitude_deg: float,
) -> dict[str, Any]:
    layer = get_layer(layer_id)
    if layer is None:
        raise LayerNotFoundError(f"Unknown layer id '{layer_id}'.")
    if layer.kind not in {"elevation", "hillshade", "slope", "psr"}:
        raise MapServiceError(f"Layer {layer_id} does not support point sampling.")
    path = _open_path_for_layer(layer)
    pt = lonlat_to_stereo(longitude_deg, latitude_deg)
    with rasterio.open(path) as ds:
        left, bottom, right, top = ds.bounds
        inside = left <= pt.x_m <= right and bottom <= pt.y_m <= top
        if not inside:
            return {
                "layer_id": layer_id,
                "covered": False,
                "latitude_deg": latitude_deg,
                "longitude_deg": longitude_deg,
                "stereo_x_m": pt.x_m,
                "stereo_y_m": pt.y_m,
                "value": None,
                "units": layer.units,
                "role": layer.role,
                "attribution": layer.attribution,
                "message": "Point outside raster bounds",
            }
        val = list(ds.sample([(pt.x_m, pt.y_m)]))[0][0]
        if val is None or (isinstance(val, float) and np.isnan(val)):
            covered = False
            out_v = None
            msg = "NoData at point"
        elif ds.nodata is not None and val == ds.nodata:
            covered = False
            out_v = None
            msg = "NoData at point"
        else:
            covered = True
            out_v = float(val)
            msg = "OK"
    return {
        "layer_id": layer_id,
        "covered": covered,
        "latitude_deg": latitude_deg,
        "longitude_deg": longitude_deg,
        "stereo_x_m": pt.x_m,
        "stereo_y_m": pt.y_m,
        "value": out_v,
        "units": layer.units,
        "role": layer.role,
        "attribution": layer.attribution,
        "message": msg,
    }


def build_mesh(
    *,
    latitude_deg: float,
    longitude_deg: float,
    half_extent_m: float = 2_000.0,
    step_m: float = 50.0,
    layer_id: str = "lola-site04-5mpp-surf",
) -> dict[str, Any]:
    """Downsampled XYZ grid for optional 3D preview (not a full LOD engine).

    Phase 5E: returns explicit grid dimensions, NoData mask, reference elevation,
    extent, and source metadata. Values are real DEM samples only (never invented).
    """
    if step_m < 10.0 or step_m > 500.0:
        raise MapServiceError("step_m must be in [10, 500].")
    if half_extent_m > 5_000.0:
        raise MapServiceError("Mesh half_extent_m capped at 5000 m.")
    layer = get_layer(layer_id)
    if layer is None:
        raise LayerNotFoundError(f"Unknown layer id '{layer_id}'.")
    if layer.kind not in {"elevation", "hillshade"}:
        raise MapServiceError(f"Layer '{layer_id}' (kind={layer.kind}) cannot build an elevation mesh.")
    pt = lonlat_to_stereo(longitude_deg, latitude_deg)
    left, bottom, right, top = (
        pt.x_m - half_extent_m,
        pt.y_m - half_extent_m,
        pt.x_m + half_extent_m,
        pt.y_m + half_extent_m,
    )
    xs = np.arange(left, right + step_m * 0.5, step_m)
    ys = np.arange(bottom, top + step_m * 0.5, step_m)
    nx, ny = int(xs.size), int(ys.size)
    if nx * ny > 20_000:
        raise MapServiceError("Mesh too dense; increase step_m or reduce half_extent_m.")
    path = _open_path_for_layer(layer)
    grid_x, grid_y = np.meshgrid(xs, ys)
    coords = list(zip(grid_x.ravel().tolist(), grid_y.ravel().tolist()))
    with rasterio.open(path) as ds:
        samples = np.array([v[0] for v in ds.sample(coords)], dtype=float)
        nodata = ds.nodata
        if nodata is not None:
            samples = np.where(samples == nodata, np.nan, samples)
        # Outside raster extent → NaN
        outside = []
        for x, y in coords:
            outside.append(not (ds.bounds.left <= x <= ds.bounds.right and ds.bounds.bottom <= y <= ds.bounds.top))
        samples = np.where(outside, np.nan, samples)
    z = samples.reshape(ny, nx)
    nodata_mask = ~np.isfinite(z)
    valid = z[np.isfinite(z)]
    z_ref = float(np.nanmedian(valid)) if valid.size else None
    z_min = float(np.nanmin(valid)) if valid.size else None
    z_max = float(np.nanmax(valid)) if valid.size else None
    return {
        "layer_id": layer_id,
        "role": layer.role,
        "kind": layer.kind,
        "crs_summary": layer.crs_summary,
        "crs_proj4": (
            f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 "
            f"+a=1737400 +b=1737400 +units=m +no_defs"
        ),
        "attribution": layer.attribution,
        "source_url": layer.source_url,
        "access_mode": layer.access_mode,
        "origin_lonlat_deg": [longitude_deg, latitude_deg],
        "origin_stereo_m": [pt.x_m, pt.y_m],
        "extent_m": {
            "left": left,
            "bottom": bottom,
            "right": right,
            "top": top,
        },
        "grid": {"nx": nx, "ny": ny, "n_cells": nx * ny},
        "x_m": xs.tolist(),
        "y_m": ys.tolist(),
        "z_m": [[None if not np.isfinite(v) else float(v) for v in row] for row in z],
        "nodata_mask": nodata_mask.astype(bool).tolist(),
        "nodata_fraction": float(nodata_mask.mean()) if nodata_mask.size else 1.0,
        "elevation_units": layer.units or "metres",
        "reference_elevation_m": z_ref,
        "z_min_m": z_min,
        "z_max_m": z_max,
        "sampling_resolution_m": step_m,
        "step_m": step_m,
        "half_extent_m": half_extent_m,
        "warning": (
            "Downsampled preview mesh only — not a flight-dynamics surface model. "
            "NoData cells are null in z_m and true in nodata_mask; values are never fabricated."
        ),
    }
