"""LOLA DEM discovery, windowed reads, and horizon caching (Phase 4 / 4.1).

Large GeoTIFFs stay on disk under ``data/raw/lola/`` (gitignored). Only a
window around each observer is read into memory for horizon computation.

Phase 4.1 cache keys include the algorithm stamp so pre-convergence profiles
are never reused.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.windows import Window, from_bounds

from app.core.config import TERRAIN_ALGORITHM_VERSION
from app.science.horizon_profile import HorizonProfile, compute_horizon_profile
from app.science.lunar_projection import lonlat_to_stereo, true_north_grid_azimuth_deg

logger = logging.getLogger("selenora.terrain")

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_LOLA_DIR = REPO_ROOT / "data" / "raw" / "lola"
HORIZON_CACHE_DIR = REPO_ROOT / "data" / "cache" / "horizons_terrain"

DATASET_VERSION = "pgda-lola-5mpp-barker2021"
HORIZON_ENGINE_VERSION = TERRAIN_ALGORITHM_VERSION
DATASET_CITATION = (
    "Barker et al., 2021, Planetary & Space Science 203, 105119 "
    "(https://doi.org/10.1016/j.pss.2020.105119); "
    "NASA PGDA High-Resolution LOLA Topography for Lunar South Pole Sites "
    "(https://pgda.gsfc.nasa.gov/products/78)."
)


@dataclass(frozen=True, slots=True)
class DemTile:
    path: Path
    site_id: str
    resolution_m: float
    bounds: tuple[float, float, float, float]  # left, bottom, right, top
    width: int
    height: int
    nodata: float | None
    crs_wkt: str


@dataclass(frozen=True, slots=True)
class CoverageResult:
    covered: bool
    dem: DemTile | None
    stereo_x_m: float
    stereo_y_m: float
    surface_z_m: float | None
    message: str


def _site_id_from_name(path: Path) -> str:
    return path.stem.split("_")[0]


@lru_cache(maxsize=1)
def list_dem_tiles(lola_dir: str | None = None) -> tuple[DemTile, ...]:
    root = Path(lola_dir) if lola_dir else DEFAULT_LOLA_DIR
    tiles: list[DemTile] = []
    if not root.is_dir():
        return tuple()
    for path in sorted(root.glob("*_surf.tif")):
        with rasterio.open(path) as ds:
            tiles.append(
                DemTile(
                    path=path,
                    site_id=_site_id_from_name(path),
                    resolution_m=float(abs(ds.res[0])),
                    bounds=(ds.bounds.left, ds.bounds.bottom, ds.bounds.right, ds.bounds.top),
                    width=ds.width,
                    height=ds.height,
                    nodata=ds.nodata,
                    crs_wkt=ds.crs.to_wkt() if ds.crs else "",
                )
            )
    return tuple(tiles)


def check_coverage(
    latitude_deg: float,
    longitude_deg: float,
    *,
    lola_dir: str | None = None,
) -> CoverageResult:
    pt = lonlat_to_stereo(longitude_deg, latitude_deg)
    for dem in list_dem_tiles(lola_dir):
        left, bottom, right, top = dem.bounds
        if not (left <= pt.x_m <= right and bottom <= pt.y_m <= top):
            continue
        with rasterio.open(dem.path) as ds:
            val = list(ds.sample([(pt.x_m, pt.y_m)]))[0][0]
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return CoverageResult(
                covered=False,
                dem=dem,
                stereo_x_m=pt.x_m,
                stereo_y_m=pt.y_m,
                surface_z_m=None,
                message=f"Point falls in NoData of {dem.path.name}",
            )
        return CoverageResult(
            covered=True,
            dem=dem,
            stereo_x_m=pt.x_m,
            stereo_y_m=pt.y_m,
            surface_z_m=float(val),
            message=f"Covered by {dem.path.name}",
        )
    return CoverageResult(
        covered=False,
        dem=None,
        stereo_x_m=pt.x_m,
        stereo_y_m=pt.y_m,
        surface_z_m=None,
        message="No local LOLA 5 m/pix DEM covers this lon/lat",
    )


def _read_window(
    dem: DemTile,
    center_x: float,
    center_y: float,
    half_extent_m: float,
) -> tuple[np.ndarray, Any]:
    with rasterio.open(dem.path) as ds:
        left = center_x - half_extent_m
        right = center_x + half_extent_m
        bottom = center_y - half_extent_m
        top = center_y + half_extent_m
        window = from_bounds(left, bottom, right, top, transform=ds.transform)
        window = window.intersection(Window(0, 0, ds.width, ds.height))
        if window.width <= 0 or window.height <= 0:
            raise ValueError("Requested DEM window is empty")
        data = ds.read(1, window=window, boundless=False).astype(float)
        transform = ds.window_transform(window)
        if dem.nodata is not None and not np.isnan(dem.nodata):
            data = np.where(data == dem.nodata, np.nan, data)
        return data, transform


def _cache_key(
    *,
    dem_path: Path,
    x: float,
    y: float,
    observer_height_m: float,
    max_range_m: float,
    n_azimuth: int,
    gamma: float,
) -> str:
    payload = {
        "dem": dem_path.name,
        "mtime": dem_path.stat().st_mtime,
        "x": round(x, 2),
        "y": round(y, 2),
        "h": observer_height_m,
        "r": max_range_m,
        "naz": n_azimuth,
        "gamma": round(gamma, 4),
        "ver": DATASET_VERSION,
        "engine": HORIZON_ENGINE_VERSION,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _profile_from_cache(blob: np.lib.npyio.NpzFile) -> HorizonProfile | None:
    required = {
        "azimuth_deg",
        "horizon_elevation_deg",
        "has_any_data",
        "complete_coverage",
        "valid_range_m",
        "distance_to_blocker_m",
        "n_valid_samples",
        "true_north_grid_azimuth_deg",
        "any_data_fraction",
        "complete_coverage_fraction",
    }
    if not required.issubset(set(blob.files)):
        return None  # stale Phase 4.0 cache
    return HorizonProfile(
        azimuth_deg=blob["azimuth_deg"],
        horizon_elevation_deg=blob["horizon_elevation_deg"],
        has_any_data=blob["has_any_data"].astype(bool),
        complete_coverage=blob["complete_coverage"].astype(bool),
        valid_range_m=blob["valid_range_m"],
        distance_to_blocker_m=blob["distance_to_blocker_m"],
        n_valid_samples=blob["n_valid_samples"].astype(int),
        observer_x_m=float(blob["observer_x_m"]),
        observer_y_m=float(blob["observer_y_m"]),
        observer_z_m=float(blob["observer_z_m"]),
        observer_height_m=float(blob["observer_height_m"]),
        max_range_m=float(blob["max_range_m"]),
        true_north_grid_azimuth_deg=float(blob["true_north_grid_azimuth_deg"]),
        any_data_fraction=float(blob["any_data_fraction"]),
        complete_coverage_fraction=float(blob["complete_coverage_fraction"]),
    )


def get_horizon_profile(
    latitude_deg: float,
    longitude_deg: float,
    *,
    observer_height_m: float = 2.0,
    max_range_m: float = 12_000.0,
    range_step_m: float = 25.0,
    n_azimuth: int = 72,
    lola_dir: str | None = None,
    use_cache: bool = True,
) -> tuple[HorizonProfile, CoverageResult, dict[str, Any]]:
    """Return terrain horizon + coverage metadata for one site."""
    cov = check_coverage(latitude_deg, longitude_deg, lola_dir=lola_dir)
    gamma = true_north_grid_azimuth_deg(longitude_deg, latitude_deg)
    meta: dict[str, Any] = {
        "dataset_version": DATASET_VERSION,
        "horizon_engine_version": HORIZON_ENGINE_VERSION,
        "citation": DATASET_CITATION,
        "coverage_message": cov.message,
        "covered": cov.covered,
        "true_north_grid_azimuth_deg": gamma,
        "observer_longitude_deg": longitude_deg,
        "observer_latitude_deg": latitude_deg,
    }
    if not cov.covered or cov.dem is None or cov.surface_z_m is None:
        raise FileNotFoundError(cov.message)

    dem = cov.dem
    meta.update(
        {
            "dem_file": dem.path.name,
            "dem_site_id": dem.site_id,
            "resolution_m": dem.resolution_m,
            "dem_bounds_m": dem.bounds,
            "observer_stereo_m": (cov.stereo_x_m, cov.stereo_y_m),
            "surface_z_m": cov.surface_z_m,
            "observer_height_m": observer_height_m,
        }
    )

    key = _cache_key(
        dem_path=dem.path,
        x=cov.stereo_x_m,
        y=cov.stereo_y_m,
        observer_height_m=observer_height_m,
        max_range_m=max_range_m,
        n_azimuth=n_azimuth,
        gamma=gamma,
    )
    HORIZON_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = HORIZON_CACHE_DIR / f"{key}.npz"
    if use_cache and cache_path.exists():
        blob = np.load(cache_path)
        profile = _profile_from_cache(blob)
        if profile is not None:
            meta["cached"] = True
            meta["any_data_fraction"] = profile.any_data_fraction
            meta["complete_coverage_fraction"] = profile.complete_coverage_fraction
            meta["horizon_coverage_fraction"] = profile.complete_coverage_fraction
            return profile, cov, meta
        logger.info("stale_terrain_cache_ignored", extra={"path": str(cache_path)})

    window, transform = _read_window(
        dem, cov.stereo_x_m, cov.stereo_y_m, half_extent_m=max_range_m + dem.resolution_m
    )
    profile = compute_horizon_profile(
        dem=window,
        transform=transform,
        observer_x_m=cov.stereo_x_m,
        observer_y_m=cov.stereo_y_m,
        observer_z_m=cov.surface_z_m,
        true_north_grid_azimuth_deg=gamma,
        observer_height_m=observer_height_m,
        n_azimuth=n_azimuth,
        max_range_m=max_range_m,
        range_step_m=range_step_m,
    )
    if use_cache:
        np.savez_compressed(
            cache_path,
            azimuth_deg=profile.azimuth_deg,
            horizon_elevation_deg=profile.horizon_elevation_deg,
            has_any_data=profile.has_any_data,
            complete_coverage=profile.complete_coverage,
            valid_range_m=profile.valid_range_m,
            distance_to_blocker_m=profile.distance_to_blocker_m,
            n_valid_samples=profile.n_valid_samples,
            observer_x_m=np.array(profile.observer_x_m),
            observer_y_m=np.array(profile.observer_y_m),
            observer_z_m=np.array(profile.observer_z_m),
            observer_height_m=np.array(profile.observer_height_m),
            max_range_m=np.array(profile.max_range_m),
            true_north_grid_azimuth_deg=np.array(profile.true_north_grid_azimuth_deg),
            any_data_fraction=np.array(profile.any_data_fraction),
            complete_coverage_fraction=np.array(profile.complete_coverage_fraction),
        )
    meta["cached"] = False
    meta["any_data_fraction"] = profile.any_data_fraction
    meta["complete_coverage_fraction"] = profile.complete_coverage_fraction
    meta["horizon_coverage_fraction"] = profile.complete_coverage_fraction
    meta["median_valid_range_m"] = (
        float(np.median(profile.valid_range_m[profile.has_any_data]))
        if np.any(profile.has_any_data)
        else 0.0
    )
    meta["min_valid_range_m"] = (
        float(np.min(profile.valid_range_m[profile.has_any_data]))
        if np.any(profile.has_any_data)
        else 0.0
    )
    return profile, cov, meta
