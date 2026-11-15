"""Phase 7E — verified lunar mission catalog schemas (read-only).

Coordinates for verified landings are planetocentric Mean Earth/Polar Axis
(ME/PA) as published by NSSDC / LROC Wagner et al. 2016. SELENORA stores
east-positive longitude in −180…180 deg and converts via
``app/science/lunar_sphere.py`` (MOON_ME sphere). Sources publish ME/PA as
one body-fixed product; this catalog does NOT invent a separate ME↔PA offset.

Scientific-safety rules encoded here:

* A planned target is NEVER an actual landing: planned/aborted/unsuccessful
  missions carry ``latitude_deg=null``/``longitude_deg=null`` at the mission
  level and may carry an optional ``planned_target`` with a *feature-region*
  centroid flagged ``FEATURE_CENTROID_APPROXIMATE``.
* Approximate regions are never silently converted to exact points —
  ``region_representation`` states how (or whether) a record is mapped.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import ApiModel, Latitude, Longitude

Program = Literal["APOLLO", "CLPS"]
MissionStatus = Literal[
    "COMPLETED_SUCCESS",
    "COMPLETED_PARTIAL",
    "UNSUCCESSFUL",
    "ABORTED",
    "PLANNED",
]
LandingOutcome = Literal[
    "SUCCESSFUL_LANDING",
    "PARTIAL_SUCCESS_LANDING",
    "NO_LANDING_ABORTED",
    "NO_LANDING_FAILED",
    "NOT_LANDED_YET",
]
Confidence = Literal["EXACT_VERIFIED", "APPROXIMATE_REGION"]
RegionRepresentation = Literal[
    "POINT_LANDING",
    "FEATURE_CENTROID_APPROXIMATE",
    "NONE",
]

SUCCESSFUL_OUTCOMES: frozenset[str] = frozenset({"SUCCESSFUL_LANDING"})
PARTIAL_OUTCOMES: frozenset[str] = frozenset({"PARTIAL_SUCCESS_LANDING"})
UNSUCCESSFUL_OUTCOMES: frozenset[str] = frozenset({"NO_LANDING_FAILED"})
ABORTED_OUTCOMES: frozenset[str] = frozenset({"NO_LANDING_ABORTED"})
PLANNED_OUTCOMES: frozenset[str] = frozenset({"NOT_LANDED_YET"})
# Legacy bucket used by older clients / docs: partial + failed + aborted.
UNSUCCESSFUL_OR_ABORTED_OUTCOMES: frozenset[str] = frozenset(
    {
        "PARTIAL_SUCCESS_LANDING",
        "NO_LANDING_ABORTED",
        "NO_LANDING_FAILED",
    }
)
NO_TOUCHDOWN_OUTCOMES: frozenset[str] = frozenset(
    {
        "NO_LANDING_ABORTED",
        "NO_LANDING_FAILED",
        "NOT_LANDED_YET",
    }
)


class PlannedTarget(ApiModel):
    """Named target region for planned/aborted/failed missions.

    ``latitude_deg``/``longitude_deg`` may be null (no documented feature) or
    an IAU Gazetteer feature centroid that is explicitly NOT a landing ellipse.
    """

    name: str
    latitude_deg: Latitude | None = None
    longitude_deg: Longitude | None = None
    note: str
    coordinate_system: str | None = None
    coordinate_system_note: str | None = None


class MissionItem(ApiModel):
    """One catalog mission, enriched with ME-sphere Cartesian coordinates."""

    id: str
    name: str
    program: Program
    operator: str
    status: MissionStatus
    landing_outcome: LandingOutcome
    launch_date: str | None = None
    landing_date: str | None = None

    # Actual verified landing coordinates — null unless a touchdown occurred.
    latitude_deg: Latitude | None = None
    longitude_deg: Longitude | None = None
    source_longitude_deg: float | None = Field(
        default=None,
        ge=-360.0,
        le=360.0,
        description="Longitude exactly as published by the primary source",
    )
    source_longitude_convention: str | None = None
    coordinate_frame: str
    source_coordinate_system: str
    source_frame_label: str
    coordinate_uncertainty_m: float | None = Field(default=None, ge=0.0)
    coordinate_precision_note: str | None = None
    confidence: Confidence
    approximate_region: bool
    region_representation: RegionRepresentation
    planned_target: PlannedTarget | None = None

    source_url: str
    lroc_source_url: str | None = None
    source_access_date: str
    notes: str

    # Enrichment (computed, never stored in the JSON catalog).
    longitude_normalized_deg: float | None = None
    cartesian_me: dict[str, float | str] | None = None
    marker_kind: Literal["ACTUAL_LANDING", "PLANNED_TARGET_REGION", "LIST_ONLY"] = "LIST_ONLY"
    south_polar: bool = False
    explorer_coverage: bool = False
    terrain_scoring_supported: bool = False
    not_nasa_landing_recommendation: bool = True

    @model_validator(mode="after")
    def _landing_safety(self) -> MissionItem:
        """Enforce the planned-vs-actual separation at validation time.

        ``PARTIAL_SUCCESS_LANDING`` *did* touch down (e.g. a tipped lander that
        returned data), so it may carry verified coordinates. Only outcomes
        where no touchdown happened are forbidden from having a point.
        """
        has_point = self.latitude_deg is not None and self.longitude_deg is not None
        if self.landing_outcome in PLANNED_OUTCOMES and has_point:
            raise ValueError(
                f"{self.id}: planned mission must not carry actual landing coordinates"
            )
        if self.landing_outcome in NO_TOUCHDOWN_OUTCOMES and has_point:
            raise ValueError(
                f"{self.id}: mission without a touchdown must not carry "
                "actual landing coordinates"
            )
        if self.approximate_region and has_point:
            raise ValueError(
                f"{self.id}: approximate_region=true must not carry exact coordinates"
            )
        if self.region_representation == "POINT_LANDING" and not has_point:
            raise ValueError(
                f"{self.id}: POINT_LANDING record requires actual coordinates"
            )
        if (
            self.region_representation == "FEATURE_CENTROID_APPROXIMATE"
            and self.planned_target is None
        ):
            raise ValueError(
                f"{self.id}: FEATURE_CENTROID_APPROXIMATE requires a planned_target"
            )
        return self


class MissionCatalog(ApiModel):
    """Full ``GET /api/v1/missions`` response."""

    title: str
    catalog_version: str
    generated_date: str
    coordinate_frame: str
    coordinate_convention: str
    me_pa_policy: str
    longitude_convention: str
    sphere_radius_m: float
    south_polar_threshold_deg: float
    disclaimer: str
    filters: dict[str, list[str]]
    related_endpoints: dict[str, str]
    total: int
    items: list[MissionItem]
