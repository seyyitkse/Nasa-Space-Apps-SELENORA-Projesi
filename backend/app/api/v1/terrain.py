"""Terrain / LOLA coverage and horizon-profile endpoints (Phase 4 / 5B)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.core.errors import AzimuthUndefinedAtPoleError
from app.core.errors import TerrainUnavailableError
from app.schemas.common import ApiModel
from app.services import terrain_data_service

router = APIRouter(prefix="/terrain", tags=["terrain"])


class DemTileInfo(ApiModel):
    site_id: str
    file_name: str
    resolution_m: float
    bounds_m: tuple[float, float, float, float]
    width: int
    height: int


class CoverageResponse(ApiModel):
    covered: bool
    latitude_deg: float
    longitude_deg: float
    stereo_x_m: float
    stereo_y_m: float
    surface_z_m: float | None
    dem_site_id: str | None
    dem_file: str | None
    message: str
    dataset_version: str
    citation: str


class TerrainCatalog(ApiModel):
    available: bool
    dataset_version: str
    citation: str
    tiles: list[DemTileInfo]


@router.get("/catalog", response_model=TerrainCatalog, summary="Local LOLA DEM catalog")
def terrain_catalog() -> TerrainCatalog:
    tiles = [
        DemTileInfo(
            site_id=t.site_id,
            file_name=t.path.name,
            resolution_m=t.resolution_m,
            bounds_m=t.bounds,
            width=t.width,
            height=t.height,
        )
        for t in terrain_data_service.list_dem_tiles()
    ]
    return TerrainCatalog(
        available=len(tiles) > 0,
        dataset_version=terrain_data_service.DATASET_VERSION,
        citation=terrain_data_service.DATASET_CITATION,
        tiles=tiles,
    )


@router.get("/coverage", response_model=CoverageResponse, summary="Check LOLA DEM coverage for a site")
def terrain_coverage(
    latitude_deg: float = Query(..., ge=-90, le=90),
    longitude_deg: float = Query(..., ge=-180, le=180),
) -> CoverageResponse:
    cov = terrain_data_service.check_coverage(latitude_deg, longitude_deg)
    return CoverageResponse(
        covered=cov.covered,
        latitude_deg=latitude_deg,
        longitude_deg=longitude_deg,
        stereo_x_m=cov.stereo_x_m,
        stereo_y_m=cov.stereo_y_m,
        surface_z_m=cov.surface_z_m,
        dem_site_id=cov.dem.site_id if cov.dem else None,
        dem_file=cov.dem.path.name if cov.dem else None,
        message=cov.message,
        dataset_version=terrain_data_service.DATASET_VERSION,
        citation=terrain_data_service.DATASET_CITATION,
    )


@router.get("/horizon-profile", summary="True-north terrain horizon profile (local 5 m DEM)")
def terrain_horizon_profile(
    latitude_deg: Annotated[float, Query(ge=-90, le=90)],
    longitude_deg: Annotated[float, Query(ge=-180, le=180)],
    max_range_m: Annotated[float, Query(ge=500, le=12_000)] = 12_000.0,
    n_azimuth: Annotated[int, Query(ge=8, le=360)] = 72,
    observer_height_m: Annotated[float, Query(ge=0, le=50)] = 2.0,
) -> dict[str, Any]:
    # At the exact geographic poles, "local north" (and thus azimuth) is undefined.
    # This endpoint is explicitly azimuth-based (true-north horizon bins), so we
    # reject the scientifically undefined request rather than returning HTTP 500.
    if abs(abs(float(latitude_deg)) - 90.0) < 1e-12:
        raise AzimuthUndefinedAtPoleError(
            "Local north/azimuth is undefined at the geographic poles; "
            "use |latitude| < 90° (e.g. -89.999°) for terrain horizon-profile.",
            details={
                "latitude_deg": float(latitude_deg),
                "longitude_deg": float(longitude_deg),
                "message_tr": (
                    "Coğrafi kutuplarda yerel kuzey/azimut bilimsel olarak tanımsızdır; "
                    "ufuk profili için |enlem| < 90° (ör. -89.999°) kullanın."
                ),
            },
        )
    try:
        profile, cov, meta = terrain_data_service.get_horizon_profile(
            latitude_deg,
            longitude_deg,
            max_range_m=max_range_m,
            n_azimuth=n_azimuth,
            observer_height_m=observer_height_m,
        )
    except FileNotFoundError as exc:
        raise TerrainUnavailableError(str(exc)) from exc

    bins = []
    for i in range(len(profile.azimuth_deg)):
        bins.append(
            {
                "azimuth_deg": float(profile.azimuth_deg[i]),
                "horizon_elevation_deg": (
                    None
                    if not profile.has_any_data[i]
                    else float(profile.horizon_elevation_deg[i])
                ),
                "has_any_data": bool(profile.has_any_data[i]),
                "complete_coverage": bool(profile.complete_coverage[i]),
                "valid_range_m": float(profile.valid_range_m[i]),
                "distance_to_blocker_m": (
                    None
                    if profile.distance_to_blocker_m[i] != profile.distance_to_blocker_m[i]
                    else float(profile.distance_to_blocker_m[i])
                ),
            }
        )
    return {
        "latitude_deg": latitude_deg,
        "longitude_deg": longitude_deg,
        "scientific_role": "SCIENCE_VALIDATED_LOCAL",
        "quality_label": (
            "EPHEMERIS_TERRAIN"
            if profile.complete_coverage_fraction >= 0.99
            else "LOCAL_TERRAIN_PARTIAL"
        ),
        "true_north_grid_azimuth_deg": profile.true_north_grid_azimuth_deg,
        "observer_height_m": profile.observer_height_m,
        "observer_z_m": profile.observer_z_m,
        "max_range_m": profile.max_range_m,
        "any_data_fraction": profile.any_data_fraction,
        "complete_coverage_fraction": profile.complete_coverage_fraction,
        "dem_site_id": meta.get("dem_site_id"),
        "dem_file": meta.get("dem_file"),
        "resolution_m": meta.get("resolution_m"),
        "coverage_message": cov.message,
        "dataset_version": terrain_data_service.DATASET_VERSION,
        "horizon_engine_version": meta.get("horizon_engine_version"),
        "attribution": terrain_data_service.DATASET_CITATION,
        "crs_summary": (
            "South polar stereographic, Moon sphere a=b=1737.4 km, lon_0=0; "
            "azimuths are true geographic (Horizons convention)."
        ),
        "bins": bins,
        "limitations": [
            "VISIBLE requires complete coverage to max_range_m; otherwise UNKNOWN if not BLOCKED.",
            "Local 5 m Site01/04 tiles do not imply Moon-wide terrain validity.",
        ],
    }
