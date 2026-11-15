"""Phase 7C API contract: one site compared across multiple UTC windows."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.analysis import DecisionWeights, Provenance, SiteResult
from app.schemas.common import ApiModel, DataQuality, HorizonModel, Latitude, Longitude

MIN_SCENARIOS = 2
MAX_SCENARIOS = 10
MAX_SCENARIO_DAYS = 30
MAX_TOTAL_SAMPLES = 30_000


class ScenarioSiteInput(ApiModel):
    """Stable site identity shared by every date scenario in the request."""

    site_id: str = Field(min_length=1, max_length=96, pattern=r"^[A-Za-z0-9_.:-]+$")
    label: str = Field(min_length=1, max_length=160)
    latitude_deg: Latitude
    longitude_deg: Longitude
    landing_site_id: str | None = Field(default=None, max_length=64)


class ScenarioWindowInput(ApiModel):
    scenario_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")
    label: str = Field(min_length=1, max_length=120)
    start_utc: datetime
    end_utc: datetime

    @field_validator("start_utc", "end_utc")
    @classmethod
    def _normalise_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("Scenario timestamps must include a UTC offset.")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def _valid_window(self) -> ScenarioWindowInput:
        if self.end_utc <= self.start_utc:
            raise ValueError("Scenario end_utc must be after start_utc.")
        if self.end_utc - self.start_utc > timedelta(days=MAX_SCENARIO_DAYS):
            raise ValueError(
                f"Scenario window cannot exceed {MAX_SCENARIO_DAYS} days."
            )
        return self

    def sample_count(self, step_minutes: int) -> int:
        span_minutes = (self.end_utc - self.start_utc).total_seconds() / 60.0
        return int(span_minutes // step_minutes) + 1


class ScenarioComparisonCreate(ApiModel):
    name: str = Field(min_length=2, max_length=160)
    site: ScenarioSiteInput
    scenarios: list[ScenarioWindowInput] = Field(
        min_length=MIN_SCENARIOS, max_length=MAX_SCENARIOS
    )
    time_step_minutes: int = Field(default=60, ge=10, le=1440)
    horizon_model: HorizonModel = "GEOMETRIC"
    weights: DecisionWeights = Field(default_factory=DecisionWeights)

    @model_validator(mode="after")
    def _comparable_scenarios(self) -> ScenarioComparisonCreate:
        ids = [item.scenario_id for item in self.scenarios]
        if len(set(ids)) != len(ids):
            raise ValueError("Scenario IDs must be unique.")
        labels = [item.label.strip().casefold() for item in self.scenarios]
        if len(set(labels)) != len(labels):
            raise ValueError("Scenario labels must be unique.")
        ranges = [(item.start_utc, item.end_utc) for item in self.scenarios]
        if len(set(ranges)) != len(ranges):
            raise ValueError("Duplicate scenario date ranges are not allowed.")
        durations = {item.end_utc - item.start_utc for item in self.scenarios}
        if len(durations) != 1:
            raise ValueError("All scenario windows must have equal duration.")
        total_samples = sum(
            item.sample_count(self.time_step_minutes) for item in self.scenarios
        )
        if total_samples > MAX_TOTAL_SAMPLES:
            raise ValueError(
                f"Scenario request exceeds the {MAX_TOTAL_SAMPLES} sample limit."
            )
        return self

    @property
    def window_duration_hours(self) -> float:
        first = self.scenarios[0]
        return (first.end_utc - first.start_utc).total_seconds() / 3600.0


class ScenarioEvidence(ApiModel):
    scenario_id: str
    label: str
    start_utc: datetime
    end_utc: datetime
    sample_count: int
    data_quality: DataQuality
    algorithm_version: str
    site: SiteResult
    assumptions: list[str]
    limitations: list[str]
    provenance: list[Provenance]


class ScenarioComparisonResult(ApiModel):
    id: str
    name: str
    status: Literal["COMPLETED"]
    cache_status: Literal["MISS", "HIT", "STORED"]
    site: ScenarioSiteInput
    time_step_minutes: int
    horizon_model: HorizonModel
    weights: DecisionWeights
    window_duration_hours: float
    scenarios: list[ScenarioEvidence]
    recommended_scenario_id: str | None
    recommendation_available: bool
    recommendation_note: str
    created_at: datetime


class ScenarioComparisonStatus(ApiModel):
    id: str
    name: str
    status: Literal["RUNNING", "COMPLETED", "FAILED"]
    site_id: str
    scenario_count: int
    horizon_model: HorizonModel
    created_at: datetime
    error_message: str | None = None
