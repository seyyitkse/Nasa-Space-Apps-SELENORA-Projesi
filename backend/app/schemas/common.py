from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Data-quality vocabulary used across every analysis output.
DataQuality = Literal[
    "EPHEMERIS_GEOMETRIC",  # JPL Horizons ephemeris, geometric (smooth-sphere) horizon
    "EPHEMERIS_TERRAIN",  # JPL Horizons + LOLA with complete requested-range horizon coverage
    "LOCAL_TERRAIN_PARTIAL",  # JPL Horizons + LOLA; DEM does not cover full horizon range
    "SYNTHETIC_DEMO",  # simplified analytic model — NOT real data
    "PARTIAL",  # some inputs missing; results incomplete
    "UNAVAILABLE",  # no usable data
]

HorizonModel = Literal["GEOMETRIC", "TERRAIN"]

Latitude = Annotated[float, Field(ge=-90.0, le=90.0, description="Planetocentric latitude, deg")]
Longitude = Annotated[
    float, Field(ge=-180.0, le=180.0, description="East-positive longitude, deg")
]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class ErrorBody(ApiModel):
    code: str
    message: str
    details: Any = None
    request_id: str | None = None


class ErrorResponse(ApiModel):
    error: ErrorBody
