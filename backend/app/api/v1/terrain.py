"""Terrain / LOLA coverage endpoints (Phase 4)."""

from __future__ import annotations

from fastapi import APIRouter, Query

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
