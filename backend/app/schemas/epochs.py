"""Authoritative per-epoch visibility contract (Phase 5E — R1).

Built from stored ``VisibilityTimeline`` rows (full Az/El). Terrain states are
recomputed from the local LOLA horizon when ``horizon_model=TERRAIN``; no new
Horizons round-trip is performed.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.common import ApiModel, DataQuality, HorizonModel, Latitude, Longitude

BodyState = Literal["VISIBLE", "BLOCKED", "UNKNOWN"]
JointState = Literal["VISIBLE", "NOT_VISIBLE", "UNKNOWN"]


class EpochSample(ApiModel):
    t: datetime
    sun_azimuth_deg: float | None
    sun_elevation_deg: float | None
    earth_azimuth_deg: float | None
    earth_elevation_deg: float | None
    sun_state: BodyState
    earth_state: BodyState
    joint_state: JointState
    sun_terrain_horizon_deg: float | None = None
    earth_terrain_horizon_deg: float | None = None
    sun_geometric_state: BodyState | None = None
    earth_geometric_state: BodyState | None = None
    hold_hours: float
    contributes_duration: bool
    """False when ``t >= analysis end`` (inclusive Horizons STOP); never pads durations."""


class SiteEpochs(ApiModel):
    label: str
    latitude_deg: Latitude
    longitude_deg: Longitude
    landing_site_id: str | None = None
    dem_site_id: str | None = None
    terrain_complete_coverage_fraction: float | None = None
    true_north_grid_azimuth_deg: float | None = None
    samples: list[EpochSample]


class EpochsProvenance(ApiModel):
    source_id: str
    description: str
    version: str | None = None


class EpochsResponse(ApiModel):
    analysis_id: str
    mission_name: str
    horizon_model: HorizonModel
    data_quality: DataQuality
    algorithm_version: str
    start_utc: datetime
    end_utc: datetime
    time_step_minutes: int
    sample_count_per_site: int
    duration_semantics: str
    """Always ``[start_utc, end_utc)`` sample-and-hold."""
    sites: list[SiteEpochs]
    provenance: list[EpochsProvenance]
    limitations: list[str]
