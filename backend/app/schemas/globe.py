"""Schemas for Phase 6B globe-ready site markers."""

from __future__ import annotations

from typing import Any

from pydantic import Field

from app.schemas.common import ApiModel, Latitude, Longitude


class CartesianME(ApiModel):
    x_m: float
    y_m: float
    z_m: float
    radius_m: float
    frame: str = "MOON_ME_SPHERE_SCIENTIFIC"


class GlobeSiteMarker(ApiModel):
    id: str
    name: str
    latitude_deg: Latitude
    longitude_deg: Longitude
    longitude_normalized_deg: float
    region: str
    description: str
    coordinate_source: str
    coordinate_status: str
    south_polar: bool
    local_lola_coverage: bool
    local_lola_tile: str | None
    geometric_analysis_supported: bool
    cartesian_me: CartesianME
    not_nasa_landing_recommendation: bool = True


class GlobeSiteCatalog(ApiModel):
    title: str
    coordinate_frame: str
    longitude_convention: str
    sphere_radius_m: float
    south_polar_threshold_deg: float
    cartesian_convention: str
    svs_glb_orientation_status: str
    svs_glb_note: str
    disclaimer: str
    sites_disclaimer: str
    related_endpoints: dict[str, str]
    total: int
    items: list[GlobeSiteMarker]
    # Allow extra metadata keys if the service adds diagnostics later.
    extras: dict[str, Any] | None = Field(default=None, exclude=True)
