"""Multi-resolution NASA LOLA DEM selection for 3D mesh visualization (Phase 7D MVP).

Scientific TERRAIN scoring / horizon profiles remain on local Product 78 5 m tiles
only (``terrain_data_service``). This resolver selects the finest *usable* real
elevation GeoTIFF for map mesh previews: local 5 m first, then verified PGDA
Product 90 Cloud-Optimized GeoTIFFs via bounded ``/vsicurl/`` window reads.

Never returns hillshade, WAC imagery, or synthetic heights as elevation.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

import numpy as np
import rasterio

from app.science.lunar_projection import lonlat_to_stereo
from app.services import nasa_layer_catalog, terrain_data_service
from app.services.nasa_layer_catalog import NasaLayer
from app.services.raster_preview_service import (
    LayerUnavailableError,
    MapServiceError,
    _open_path_for_layer,
)

logger = logging.getLogger("selenora.dem_mesh")

CoverageTier = Literal["LOCAL_5MPP", "REMOTE_PGDA90"]

# Northern latitude limit (degrees) for Product 90 polar stereo mosaics.
# A point at latitude L is inside the product if L <= northern_limit.
REMOTE_ELEVATION_LADDER: tuple[tuple[str, float], ...] = (
    ("ldem-80s-20mpp", -80.0),
    ("ldem-75s-30mpp", -75.0),
    ("ldem-80s-40mpp", -80.0),
    ("ldem-60s-60mpp", -60.0),
    ("ldem-80s-80mpp", -80.0),
    ("ldem-60s-120mpp", -60.0),
    ("ldem-60s-240mpp", -60.0),
)

# First-pass probe skips multi-GB COGs; second pass includes them if needed.
_LARGE_COG_BYTES = 1_500_000_000

# Skip candidates much finer than the mesh step (still real DEM — just wasteful vsicurl).
_FINE_STEP_RATIO = 0.5

# Soft open/sample budget per candidate before trying the next coarser DEM.
_CANDIDATE_TIMEOUT_S = 40.0

# Cap how many remote candidates we probe per request.
_MAX_REMOTE_PROBES = 5


@dataclass(frozen=True, slots=True)
class ResolvedDemSource:
    layer: NasaLayer
    coverage_tier: CoverageTier
    surface_z_m: float
    native_resolution_m: float
    product_page: str
    dem_site_id: str | None
    dem_file: str | None
    message: str
    probe_ms: float


def _configure_remote_gdal() -> None:
    """Bounded HTTP / VSIL curl settings for COG range reads."""
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.tiff,.TIFF")
    os.environ.setdefault("GDAL_HTTP_TIMEOUT", "45")
    os.environ.setdefault("GDAL_HTTP_CONNECTTIMEOUT", "15")
    os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "2")
    os.environ.setdefault("GDAL_CACHEMAX", "256")  # MB
    # ~64 MiB VSIL curl block cache — avoids unbounded remote tile retention.
    os.environ.setdefault("CPL_VSIL_CURL_CACHE_SIZE", str(64 * 1024 * 1024))
    os.environ.setdefault("VSI_CACHE", "TRUE")
    os.environ.setdefault("VSI_CACHE_SIZE", str(64 * 1024 * 1024))


def _is_valid_elevation(val: Any, nodata: float | None) -> bool:
    if val is None:
        return False
    try:
        f = float(val)
    except (TypeError, ValueError):
        return False
    if not np.isfinite(f):
        return False
    if nodata is not None and np.isfinite(nodata) and f == float(nodata):
        return False
    return True


def _sample_layer_elevation(layer: NasaLayer, latitude_deg: float, longitude_deg: float) -> float | None:
    if layer.kind != "elevation":
        raise MapServiceError(
            f"Layer '{layer.id}' kind={layer.kind} is not physical elevation "
            "(hillshade/imagery cannot provide heights)."
        )
    if layer.access_mode == "vsicurl_window":
        _configure_remote_gdal()
    path = _open_path_for_layer(layer)
    pt = lonlat_to_stereo(longitude_deg, latitude_deg)
    with rasterio.open(path) as ds:
        left, bottom, right, top = ds.bounds
        if not (left <= pt.x_m <= right and bottom <= pt.y_m <= top):
            return None
        val = list(ds.sample([(pt.x_m, pt.y_m)]))[0][0]
        if not _is_valid_elevation(val, ds.nodata):
            return None
        return float(val)


def _local_site_layer_id(site_id: str) -> str | None:
    m = site_id.lower().removeprefix("site")
    if not m.isdigit():
        return None
    return f"lola-site{int(m):02d}-5mpp-surf"


def _remote_candidates(
    *,
    latitude_deg: float,
    step_m: float,
    include_large: bool,
) -> list[NasaLayer]:
    out: list[NasaLayer] = []
    for layer_id, northern_limit in REMOTE_ELEVATION_LADDER:
        if latitude_deg > northern_limit:
            continue
        layer = nasa_layer_catalog.get_layer(layer_id)
        if layer is None or layer.kind != "elevation":
            continue
        if layer.resolution_m is None:
            continue
        # Prefer DEM not much finer than ~½ mesh step (e.g. 50 m mesh → skip 20 m COG).
        if layer.resolution_m + 1e-6 < step_m * _FINE_STEP_RATIO:
            continue
        nbytes = layer.approx_bytes or 0
        if not include_large and nbytes > _LARGE_COG_BYTES:
            continue
        out.append(layer)
    # Finest first among the allowed set
    out.sort(key=lambda lyr: float(lyr.resolution_m or 1e9))
    return out


@lru_cache(maxsize=64)
def _cached_remote_hit(
    layer_id: str,
    lat_key: int,
    lon_key: int,
) -> tuple[float, float] | None:
    """Cache successful remote samples (~0.01° bins) to limit repeat vsicurl probes."""
    layer = nasa_layer_catalog.get_layer(layer_id)
    if layer is None:
        return None
    lat = lat_key / 100.0
    lon = lon_key / 100.0
    t0 = time.perf_counter()
    try:
        z = _sample_layer_elevation(layer, lat, lon)
    except Exception as exc:  # noqa: BLE001 — network / GDAL soft-fail
        logger.info(
            "remote_dem_probe_failed",
            extra={"layer_id": layer_id, "error": f"{type(exc).__name__}: {exc}"},
        )
        return None
    if z is None:
        return None
    return z, (time.perf_counter() - t0) * 1000.0


def resolve_elevation_for_mesh(
    latitude_deg: float,
    longitude_deg: float,
    *,
    step_m: float = 50.0,
    layer_id: str | None = None,
    allow_remote: bool = True,
) -> ResolvedDemSource:
    """Pick the best usable real elevation source for a mesh request.

    ``layer_id``:
      - ``None`` / ``\"auto\"`` — local 5 m if covered, else Product 90 ladder
      - explicit catalog id — that layer only (must be kind=elevation)
    """
    explicit = (layer_id or "auto").strip()
    if explicit and explicit.lower() != "auto":
        layer = nasa_layer_catalog.get_layer(explicit)
        if layer is None:
            raise MapServiceError(f"Unknown layer id '{explicit}'.")
        if layer.kind != "elevation":
            raise MapServiceError(
                f"Layer '{explicit}' (kind={layer.kind}) cannot provide physical elevation "
                "for a terrain mesh. Use an elevation DEM, not hillshade or imagery."
            )
        t0 = time.perf_counter()
        try:
            z = _sample_layer_elevation(layer, latitude_deg, longitude_deg)
        except LayerUnavailableError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise LayerUnavailableError(
                f"Elevation sample failed for {explicit}: {type(exc).__name__}: {exc}",
                details={"layer_id": explicit},
            ) from exc
        if z is None:
            raise LayerUnavailableError(
                f"No verified elevation coverage in {explicit} at the requested coordinates.",
                details={"layer_id": explicit, "latitude_deg": latitude_deg, "longitude_deg": longitude_deg},
            )
        tier: CoverageTier = (
            "LOCAL_5MPP" if layer.access_mode == "local_file" else "REMOTE_PGDA90"
        )
        return ResolvedDemSource(
            layer=layer,
            coverage_tier=tier,
            surface_z_m=z,
            native_resolution_m=float(layer.resolution_m or 0.0),
            product_page=layer.product_page,
            dem_site_id=None,
            dem_file=None,
            message=f"Explicit elevation layer {layer.id}",
            probe_ms=(time.perf_counter() - t0) * 1000.0,
        )

    # 1) Local Product 78 5 m tiles (preserve existing behaviour).
    cov = terrain_data_service.check_coverage(latitude_deg, longitude_deg)
    if cov.covered and cov.dem is not None and cov.surface_z_m is not None:
        lid = _local_site_layer_id(cov.dem.site_id)
        layer = nasa_layer_catalog.get_layer(lid) if lid else None
        if layer is not None:
            return ResolvedDemSource(
                layer=layer,
                coverage_tier="LOCAL_5MPP",
                surface_z_m=float(cov.surface_z_m),
                native_resolution_m=float(cov.dem.resolution_m),
                product_page=layer.product_page,
                dem_site_id=cov.dem.site_id,
                dem_file=cov.dem.path.name,
                message=cov.message,
                probe_ms=0.0,
            )

    if not allow_remote:
        raise LayerUnavailableError(
            cov.message or "No local LOLA 5 m/pix DEM covers this lon/lat",
            details={"latitude_deg": latitude_deg, "longitude_deg": longitude_deg},
        )

    # 2) Remote Product 90 COG ladder — finest usable first (compact COGs, then large).
    lat_key = int(round(latitude_deg * 100))
    lon_key = int(round(longitude_deg * 100))
    errors: list[str] = []
    probes = 0
    seen: set[str] = set()
    for include_large in (False, True):
        for layer in _remote_candidates(
            latitude_deg=latitude_deg,
            step_m=step_m,
            include_large=include_large,
        ):
            if layer.id in seen:
                continue
            seen.add(layer.id)
            if probes >= _MAX_REMOTE_PROBES:
                break
            probes += 1
            t0 = time.perf_counter()
            hit = _cached_remote_hit(layer.id, lat_key, lon_key)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            if hit is None:
                errors.append(f"{layer.id}: no coverage or probe failed ({elapsed_ms:.0f} ms)")
                if elapsed_ms > _CANDIDATE_TIMEOUT_S * 1000.0:
                    errors.append(f"{layer.id}: exceeded candidate timeout; trying coarser DEM")
                continue
            z, probe_ms = hit
            return ResolvedDemSource(
                layer=layer,
                coverage_tier="REMOTE_PGDA90",
                surface_z_m=float(z),
                native_resolution_m=float(layer.resolution_m or 0.0),
                product_page=layer.product_page,
                dem_site_id=None,
                dem_file=layer.source_url.split("/")[-1] if layer.source_url else layer.id,
                message=(
                    f"Remote PGDA Product 90 elevation {layer.id} "
                    f"({layer.resolution_m:g} m/pix COG)"
                ),
                probe_ms=float(probe_ms),
            )
        if probes >= _MAX_REMOTE_PROBES:
            break

    detail = "; ".join(errors[:6]) if errors else "no Product 90 elevation candidate matched latitude"
    raise LayerUnavailableError(
        "No verified NASA DEM elevation coverage for mesh visualization at this point. "
        "SELENORA does not invent terrain heights.",
        details={
            "latitude_deg": latitude_deg,
            "longitude_deg": longitude_deg,
            "local_message": cov.message,
            "remote_probes": detail,
        },
    )


def clear_resolver_caches() -> None:
    _cached_remote_hit.cache_clear()
