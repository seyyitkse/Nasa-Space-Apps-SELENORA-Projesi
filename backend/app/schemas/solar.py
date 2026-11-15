"""Relative solar-potential contract (Phase 7B).

Built read-only from the authoritative per-epoch states (``/epochs``). Every
index is dimensionless and relative; no field carries an electrical quantity.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.common import ApiModel, DataQuality, HorizonModel, Latitude, Longitude
from app.schemas.epochs import EpochsProvenance

PanelKind = Literal["HORIZONTAL", "FIXED", "AZIMUTH_TRACKING", "DUAL_AXIS"]
HorizonType = Literal["GEOMETRIC", "TERRAIN"]
IndexStatus = Literal["DETERMINED", "RANGE", "UNAVAILABLE"]
AzimuthSource = Literal["REQUESTED", "OPTIMISED_HINDSIGHT_GEOMETRIC"]
IndexUnavailableReason = Literal["NO_DURATION", "NO_EPHEMERIS", "NO_KNOWN_VISIBILITY"]
PanelUnavailableReason = Literal[
    "AZIMUTH_UNDEFINED_AT_POLE",
    "NO_SUNLIT_SAMPLE_TO_OPTIMISE_AZIMUTH",
]
ComparisonStatus = Literal["DISTINGUISHABLE", "NOT_DISTINGUISHABLE", "UNAVAILABLE"]


class IndexEstimate(ApiModel):
    """Relative incidence index for one panel against one horizon type.

    Percent of an ideal dual-axis panel in continuous unobstructed sunlight over
    the whole analysis window. ``index_min_pct`` is the contribution proven by
    known samples; ``index_max_pct`` adds everything the data cannot exclude.
    """

    horizon: HorizonType
    status: IndexStatus
    index_pct: float | None = None
    """Only when the bounds coincide. Never a midpoint of a range."""
    index_min_pct: float | None = None
    index_max_pct: float | None = None
    unavailable_reason: IndexUnavailableReason | None = None
    window_hours: float
    known_hours: float
    """Hours whose Sun visibility state is known for this horizon type."""
    unknown_hours: float
    unknown_fraction: float | None = None
    """``unknown_hours / window_hours`` (time-weighted, not a sample count)."""
    edge_uncertain_hours: float = 0.0
    """Terrain only: hours classified BLOCKED at disc centre whose upper limb may
    still clear the known horizon. Counted in the upper bound only."""


class PanelResult(ApiModel):
    panel: PanelKind
    tilt_deg: float | None = None
    """Angle between the panel normal and the local vertical (0° = horizontal)."""
    azimuth_deg: float | None = None
    """Azimuth of the panel normal, degrees clockwise from true north."""
    azimuth_source: AzimuthSource | None = None
    available: bool = True
    unavailable_reason: PanelUnavailableReason | None = None
    geometric: IndexEstimate | None = None
    terrain: IndexEstimate | None = None
    """Present only for TERRAIN analyses."""


class GeometricSunSummary(ApiModel):
    """Layer 1 — Sun disc centre above the 0° smooth-sphere horizon."""

    above_horizon_hours: float
    below_horizon_hours: float
    missing_ephemeris_hours: float
    above_horizon_fraction_min: float | None = None
    above_horizon_fraction_max: float | None = None


class TerrainSunSummary(ApiModel):
    """Layer 2 — Sun visibility against the available local terrain data."""

    visible_hours: float
    blocked_hours: float
    unknown_hours: float
    visible_fraction_min: float | None = None
    """UNKNOWN counted as not visible."""
    visible_fraction_max: float | None = None
    """UNKNOWN counted as visible."""
    unknown_fraction: float | None = None


class SiteSolarPotential(ApiModel):
    site_index: int
    label: str
    latitude_deg: Latitude
    longitude_deg: Longitude
    landing_site_id: str | None = None
    dem_site_id: str | None = None
    terrain_complete_coverage_fraction: float | None = None
    window_hours: float
    sample_count: int
    sun_above_geometric_horizon: GeometricSunSummary
    sun_terrain_visibility: TerrainSunSummary | None = None
    configurations: list[PanelResult]


class SiteComparison(ApiModel):
    """Whether the sites can be ranked for one panel and horizon type."""

    panel: PanelKind
    horizon: HorizonType
    status: ComparisonStatus
    leading_site_index: int | None = None
    """Set only when that site's lower bound exceeds every other site's upper bound."""


class ElectricalEnergyStatement(ApiModel):
    """Explicit marker: electrical output is not derivable from this geometry."""

    available: Literal[False] = False
    reason: str
    missing_inputs: list[str]


class SolarPotentialResponse(ApiModel):
    analysis_id: str
    mission_name: str
    horizon_model: HorizonModel
    data_quality: DataQuality
    algorithm_version: str
    terrain_engine_version: str | None = None
    solar_contract_version: str
    start_utc: datetime
    end_utc: datetime
    time_step_minutes: int
    generated_at_utc: datetime
    headline_horizon: HorizonType
    """Horizon type the analysis supports: TERRAIN for a TERRAIN analysis. The
    geometric values of a TERRAIN analysis are context, never the headline."""
    index_definition: str
    sun_angular_radius_deg: float
    sites: list[SiteSolarPotential]
    comparisons: list[SiteComparison]
    electrical_energy: ElectricalEnergyStatement
    assumptions: list[str]
    provenance: list[EpochsProvenance]
    limitations: list[str]
