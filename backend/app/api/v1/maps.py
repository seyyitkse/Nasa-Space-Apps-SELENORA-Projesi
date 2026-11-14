"""NASA map-layer metadata and bounded raster previews (Phase 5B)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.schemas.common import ApiModel
from app.services import imagery_service, nasa_layer_catalog, raster_preview_service
from app.services.raster_preview_service import (
    LayerNotFoundError,
    LayerUnavailableError,
    MapServiceError,
)

router = APIRouter(prefix="/maps", tags=["maps"])


class LayerOut(ApiModel):
    id: str
    title: str
    provider: str
    product_page: str
    source_url: str | None
    access_mode: str
    role: str
    kind: str
    resolution_m: float | None
    units: str | None
    crs_summary: str
    attribution: str
    notes: str
    approx_bytes: int | None
    accept_ranges: bool | None


class LayerList(ApiModel):
    items: list[LayerOut]
    scientific_note: str


class ElevationSample(ApiModel):
    layer_id: str
    covered: bool
    latitude_deg: float
    longitude_deg: float
    stereo_x_m: float
    stereo_y_m: float
    value: float | None
    units: str | None
    role: str
    attribution: str
    message: str


class MeshExtent(ApiModel):
    left: float
    bottom: float
    right: float
    top: float


class MeshGrid(ApiModel):
    nx: int
    ny: int
    n_cells: int


class MeshResponse(ApiModel):
    layer_id: str
    role: str
    kind: str
    crs_summary: str
    crs_proj4: str
    attribution: str
    source_url: str | None = None
    access_mode: str
    origin_lonlat_deg: list[float]
    origin_stereo_m: list[float]
    extent_m: MeshExtent
    grid: MeshGrid
    x_m: list[float]
    y_m: list[float]
    z_m: list[list[float | None]]
    nodata_mask: list[list[bool]]
    nodata_fraction: float
    elevation_units: str
    reference_elevation_m: float | None
    z_min_m: float | None
    z_max_m: float | None
    sampling_resolution_m: float
    step_m: float
    half_extent_m: float
    warning: str


class ImagerySourceList(ApiModel):
    items: list[dict]
    scientific_note: str


def _layer_out(layer: nasa_layer_catalog.NasaLayer) -> LayerOut:
    return LayerOut(
        id=layer.id,
        title=layer.title,
        provider=layer.provider,
        product_page=layer.product_page,
        source_url=layer.source_url,
        access_mode=layer.access_mode,
        role=layer.role,
        kind=layer.kind,
        resolution_m=layer.resolution_m,
        units=layer.units,
        crs_summary=layer.crs_summary,
        attribution=layer.attribution,
        notes=layer.notes,
        approx_bytes=layer.approx_bytes,
        accept_ranges=layer.accept_ranges,
    )


@router.get("/layers", response_model=LayerList, summary="NASA map layers and roles")
def list_map_layers() -> LayerList:
    return LayerList(
        items=[_layer_out(layer) for layer in nasa_layer_catalog.list_layers()],
        scientific_note=(
            "SCIENCE_VALIDATED_LOCAL layers may feed TERRAIN analyses. "
            "MAP_VISUALIZATION_ONLY layers are for Explorer overlays/previews and do not "
            "automatically enable validated far-field terrain scoring."
        ),
    )


@router.get("/layers/{layer_id}", response_model=LayerOut, summary="Single map layer metadata")
def get_map_layer(layer_id: str) -> LayerOut:
    layer = nasa_layer_catalog.get_layer(layer_id)
    if layer is None:
        raise LayerNotFoundError(f"Unknown layer id '{layer_id}'.")
    return _layer_out(layer)


@router.get(
    "/imagery/sources",
    response_model=ImagerySourceList,
    summary="Allow-listed LROC / Moon Trek imagery sources (Phase 5E)",
)
def list_imagery_sources() -> ImagerySourceList:
    return ImagerySourceList(
        items=imagery_service.list_imagery_sources(),
        scientific_note=(
            "Only sources with alignment_status=AVAILABLE_WARPED_STEREO and "
            "preview_enabled=true may be requested via /maps/preview. "
            "SELENORA never proxies arbitrary external URLs."
        ),
    )


@router.get(
    "/preview",
    summary="Bounded PNG preview (never returns raw GeoTIFF)",
    responses={200: {"content": {"image/png": {}}}},
)
def map_preview(
    layer_id: Annotated[str, Query()],
    latitude_deg: Annotated[float | None, Query(ge=-90, le=90)] = None,
    longitude_deg: Annotated[float | None, Query(ge=-180, le=180)] = None,
    half_extent_m: Annotated[float, Query()] = 8_000.0,
    max_edge_px: Annotated[int, Query()] = 512,
    left_m: Annotated[float | None, Query()] = None,
    bottom_m: Annotated[float | None, Query()] = None,
    right_m: Annotated[float | None, Query()] = None,
    top_m: Annotated[float | None, Query()] = None,
) -> Response:
    bounds = None
    if None not in (left_m, bottom_m, right_m, top_m):
        bounds = (left_m, bottom_m, right_m, top_m)  # type: ignore[assignment]
    try:
        layer = nasa_layer_catalog.get_layer(layer_id)
        if layer is not None and layer.access_mode in {"wms_allowlisted", "wmts_allowlisted"}:
            # Allow-listed imagery only — never fall through to GeoTIFF preview.
            png, meta = imagery_service.render_imagery_preview(
                layer_id,
                latitude_deg=latitude_deg,
                longitude_deg=longitude_deg,
                half_extent_m=half_extent_m,
                bounds_m=bounds,
                max_edge_px=max_edge_px,
            )
        else:
            png, meta = raster_preview_service.render_preview_png(
                layer_id,
                latitude_deg=latitude_deg,
                longitude_deg=longitude_deg,
                half_extent_m=half_extent_m,
                bounds_m=bounds,
                max_edge_px=max_edge_px,
            )
    except (MapServiceError, LayerNotFoundError, LayerUnavailableError):
        raise
    except Exception as exc:  # pragma: no cover - network/GDAL surface
        raise LayerUnavailableError(
            f"Preview failed: {type(exc).__name__}: {exc}",
            details={"layer_id": layer_id},
        ) from exc
    headers = {
        "X-SELENORA-Layer-Id": meta.layer_id,
        "X-SELENORA-Layer-Role": meta.role,
        "X-SELENORA-Bounds-M": ",".join(f"{v:.3f}" for v in meta.bounds_m),
        "X-SELENORA-Size-Px": f"{meta.width_px}x{meta.height_px}",
        "X-SELENORA-Attribution": meta.attribution[:500],
        "Cache-Control": "public, max-age=300",
    }
    return Response(content=png, media_type="image/png", headers=headers)


@router.get("/elevation", response_model=ElevationSample, summary="Sample a raster at lon/lat")
def map_elevation(
    latitude_deg: Annotated[float, Query(ge=-90, le=90)],
    longitude_deg: Annotated[float, Query(ge=-180, le=180)],
    layer_id: Annotated[str, Query()] = "lola-site04-5mpp-surf",
) -> ElevationSample:
    try:
        payload = raster_preview_service.sample_elevation(layer_id, latitude_deg, longitude_deg)
    except (MapServiceError, LayerNotFoundError, LayerUnavailableError):
        raise
    except Exception as exc:  # pragma: no cover
        raise LayerUnavailableError(
            f"Elevation sample failed: {type(exc).__name__}: {exc}",
            details={"layer_id": layer_id},
        ) from exc
    return ElevationSample(**payload)


@router.get(
    "/mesh",
    response_model=MeshResponse,
    summary="Downsampled XYZ mesh JSON for optional 3D preview (Phase 5E schema)",
)
def map_mesh(
    latitude_deg: Annotated[float, Query(ge=-90, le=90)],
    longitude_deg: Annotated[float, Query(ge=-180, le=180)],
    half_extent_m: Annotated[float, Query()] = 2_000.0,
    step_m: Annotated[float, Query()] = 50.0,
    layer_id: Annotated[str, Query()] = "lola-site04-5mpp-surf",
) -> MeshResponse:
    try:
        payload = raster_preview_service.build_mesh(
            latitude_deg=latitude_deg,
            longitude_deg=longitude_deg,
            half_extent_m=half_extent_m,
            step_m=step_m,
            layer_id=layer_id,
        )
    except (MapServiceError, LayerNotFoundError, LayerUnavailableError):
        raise
    except Exception as exc:  # pragma: no cover
        raise LayerUnavailableError(
            f"Mesh build failed: {type(exc).__name__}: {exc}",
            details={"layer_id": layer_id},
        ) from exc
    return MeshResponse.model_validate(payload)
