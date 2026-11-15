"""API contract for mission analyses.

Phase 2: POST /analyses runs the real JPL Horizons → visibility → scoring
pipeline and persists results. Phase 3 adds AI explanation (/explain).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel, DataQuality, HorizonModel, Latitude, Longitude

MAX_ANALYSIS_DAYS = 30
MAX_SITES = 10


class SiteInput(ApiModel):
    label: str = Field(min_length=1, max_length=160)
    latitude_deg: Latitude
    longitude_deg: Longitude
    landing_site_id: str | None = Field(default=None, max_length=64)


class DecisionWeights(ApiModel):
    """Weights in percent; must sum to 100."""

    sun_visibility: float = Field(default=40.0, ge=0, le=100)
    earth_visibility: float = Field(default=40.0, ge=0, le=100)
    joint_visibility: float = Field(default=20.0, ge=0, le=100)

    @model_validator(mode="after")
    def _sum_to_100(self) -> DecisionWeights:
        total = self.sun_visibility + self.earth_visibility + self.joint_visibility
        if abs(total - 100.0) > 0.01:
            raise ValueError(f"Decision weights must sum to 100 (got {total:g}).")
        return self


class AnalysisCreate(ApiModel):
    mission_name: str = Field(min_length=2, max_length=160)
    sites: list[SiteInput] = Field(min_length=2, max_length=MAX_SITES)
    start_utc: datetime
    end_utc: datetime
    time_step_minutes: int = Field(default=60, ge=10, le=1440)
    horizon_model: HorizonModel = "GEOMETRIC"
    weights: DecisionWeights = Field(default_factory=DecisionWeights)

    @field_validator("start_utc", "end_utc")
    @classmethod
    def _require_tz(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("Timestamps must include a timezone (use UTC, e.g. 2026-12-01T00:00:00Z).")
        return value

    @model_validator(mode="after")
    def _check_range(self) -> AnalysisCreate:
        if self.end_utc <= self.start_utc:
            raise ValueError("end_utc must be after start_utc.")
        if self.end_utc - self.start_utc > timedelta(days=MAX_ANALYSIS_DAYS):
            raise ValueError(f"Analysis window cannot exceed {MAX_ANALYSIS_DAYS} days.")
        coords = {(round(s.latitude_deg, 6), round(s.longitude_deg, 6)) for s in self.sites}
        if len(coords) != len(self.sites):
            raise ValueError("Each site must have distinct coordinates.")
        return self

    @property
    def analysis_duration_hours(self) -> float:
        """Length of the half-open analysis window ``[start_utc, end_utc)``."""
        return (self.end_utc - self.start_utc).total_seconds() / 3600.0

    @property
    def sample_count(self) -> int:
        """Horizons-style inclusive STOP estimate: ``floor(span/step) + 1``.

        Duration math uses ``[start, end)`` hold hours, so a sample exactly at
        ``end_utc`` contributes 0 h even when Horizons returns it.
        """
        span = (self.end_utc - self.start_utc).total_seconds() / 60
        return int(span // self.time_step_minutes) + 1


class Interval(ApiModel):
    start_utc: datetime
    end_utc: datetime
    duration_hours: float


class VisibilityMetrics(ApiModel):
    """Per-body percentages are null when no scientifically valid samples exist."""

    sun_visibility_pct: float | None
    earth_visibility_pct: float | None
    joint_visibility_pct: float | None
    longest_sunlight_hours: float
    longest_darkness_hours: float
    longest_earth_visibility_hours: float
    longest_communication_gap_hours: float
    longest_joint_visibility_hours: float


class ScoreContribution(ApiModel):
    metric: Literal["sun_visibility", "earth_visibility", "joint_visibility"]
    weight_pct: float
    value_pct: float
    contribution: float


class TerrainSiteMeta(ApiModel):
    """LOLA horizon provenance for one site (present when horizon_model=TERRAIN)."""

    dem_file: str | None = None
    dem_site_id: str | None = None
    resolution_m: float | None = None
    horizon_coverage_fraction: float | None = None  # complete requested-range fraction
    any_data_fraction: float | None = None
    complete_coverage_fraction: float | None = None
    median_valid_range_m: float | None = None
    min_valid_range_m: float | None = None
    max_range_m: float | None = None
    true_north_grid_azimuth_deg: float | None = None
    observer_height_m: float | None = None
    surface_z_m: float | None = None
    dataset_version: str | None = None
    sun_unknown_fraction: float | None = None
    earth_unknown_fraction: float | None = None
    unknown_hours: float | None = None
    known_sample_fraction: float | None = None


class GeometricVsTerrain(ApiModel):
    """Side-by-side geometric (0°) vs terrain-adjusted visibility for one site."""

    geometric: VisibilityMetrics
    longest_darkness_hours_delta: float
    longest_communication_gap_hours_delta: float
    sun_visibility_pct_delta: float | None
    earth_visibility_pct_delta: float | None
    joint_visibility_pct_delta: float | None


class SiteResult(ApiModel):
    label: str
    latitude_deg: float
    longitude_deg: float
    landing_site_id: str | None
    metrics: VisibilityMetrics
    score: float | None
    rank: int | None
    contributions: list[ScoreContribution]
    darkness_windows: list[Interval]
    communication_gaps: list[Interval]
    joint_windows: list[Interval]
    terrain: TerrainSiteMeta | None = None
    geometric_comparison: GeometricVsTerrain | None = None


class Provenance(ApiModel):
    source_id: str
    description: str
    retrieved_at: datetime | None
    version: str | None


class AnalysisStatus(ApiModel):
    id: str
    status: Literal["PENDING", "RUNNING", "COMPLETED", "FAILED"]
    data_quality: DataQuality


class AnalysisResult(ApiModel):
    id: str
    mission_name: str
    status: Literal["PENDING", "RUNNING", "COMPLETED", "FAILED"]
    data_quality: DataQuality
    algorithm_version: str
    start_utc: datetime
    end_utc: datetime
    time_step_minutes: int
    horizon_model: HorizonModel
    weights: DecisionWeights
    sites: list[SiteResult]
    recommended_site_label: str | None = Field(
        description="Chosen by the deterministic scoring engine — never by the AI layer."
    )
    assumptions: list[str]
    limitations: list[str]
    provenance: list[Provenance]
    created_at: datetime


class TimelinePoint(ApiModel):
    t: datetime
    sun_elevation_deg: float | None
    earth_elevation_deg: float | None


class SiteTimeline(ApiModel):
    label: str
    points: list[TimelinePoint]


class TimelineResponse(ApiModel):
    analysis_id: str
    data_quality: DataQuality
    downsampled: bool
    step_minutes: int
    sites: list[SiteTimeline]


class ExplainRequest(ApiModel):
    language: Literal["en", "tr"] = "en"
    regenerate: bool = False


class AIMissionReport(ApiModel):
    """Structured AI output. Validated with Pydantic; numbers are cross-checked."""

    summary: str = Field(min_length=1, max_length=4000)
    key_findings: list[str] = Field(default_factory=list, max_length=12)
    site_advantages: dict[str, list[str]] = Field(default_factory=dict)
    site_disadvantages: dict[str, list[str]] = Field(default_factory=dict)
    comparison_explanation: str = Field(default="", max_length=4000)
    mission_tradeoffs: list[str] = Field(default_factory=list, max_length=12)
    scientific_limitations: list[str] = Field(default_factory=list, max_length=12)
    data_quality_notes: list[str] = Field(default_factory=list, max_length=12)


class ExplainResponse(ApiModel):
    analysis_id: str
    language: Literal["en", "tr"]
    model: str
    prompt_version: str
    recommended_site_label: str | None = Field(
        description="From the deterministic engine only — never from the AI text."
    )
    report: AIMissionReport
    unsupported_numbers: list[str] = Field(
        description="Numbers in the AI text that do not appear in the computed results."
    )
    cached: bool = False
    generated_at: datetime
