"""Operational Sun/Earth event contract (Phase 7A).

Built read-only from the authoritative per-epoch states (``/epochs``). Every
event is a bracket between two stored samples; no timestamp is interpolated.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.common import ApiModel, DataQuality, HorizonModel, Latitude, Longitude
from app.schemas.epochs import EpochsProvenance

EventState = Literal["VISIBLE", "NOT_VISIBLE", "UNKNOWN"]
HorizonType = Literal["GEOMETRIC", "TERRAIN"]
Body = Literal["SUN", "EARTH"]
EventKind = Literal[
    "RISE",
    "SET",
    "BECOMES_UNKNOWN",
    "RESOLVES_TO_VISIBLE",
    "RESOLVES_TO_NOT_VISIBLE",
]
TrackStatus = Literal[
    "EVENT_CONFIRMED",
    "UNKNOWN_AHEAD",
    "NO_EVENT_IN_WINDOW",
    "UNKNOWN_AT_REFERENCE",
    "INSUFFICIENT_DATA",
]
NotVisibleReason = Literal["BELOW_GEOMETRIC_HORIZON", "TERRAIN_OCCULTED"]
UnknownReason = Literal[
    "MISSING_EPHEMERIS",
    "TERRAIN_COVERAGE_INCOMPLETE",
    "TERRAIN_DATA_UNAVAILABLE",
]
ReferenceMode = Literal["NOW", "WINDOW_START", "REQUESTED"]


class EventSample(ApiModel):
    """A stored ephemeris sample bounding an event (source values, not interpolated)."""

    t: datetime
    state: EventState
    elevation_deg: float | None = None
    horizon_deg: float | None = None
    """0.0 for the geometric sphere; LOLA horizon at the body's azimuth for terrain."""
    not_visible_reason: NotVisibleReason | None = None
    unknown_reason: UnknownReason | None = None


class EventCountdown(ApiModel):
    """Minutes from ``reference_utc`` to the event bracket — always a range."""

    earliest_minutes: float
    latest_minutes: float
    may_have_occurred: bool
    """True when the reference lies inside the bracket: the event may already be past."""


class VisibilityEvent(ApiModel):
    kind: EventKind
    confirmed: bool
    """True only for RISE/SET between two adjacent known samples."""
    from_state: EventState
    to_state: EventState
    bracket_start_utc: datetime
    """Exclusive: last sample still in ``from_state``."""
    bracket_end_utc: datetime
    """Inclusive: first sample in ``to_state``."""
    bracket_minutes: float
    """Timing uncertainty = sample spacing across the bracket."""
    before: EventSample
    after: EventSample
    last_known_before_unknown: EventSample | None = None
    differs_from_last_known: bool | None = None
    """RESOLVES_* only. True means the state differs from the last known sample
    before the UNKNOWN run — reported as a fact, never as a confirmed rise/set."""
    unknown_samples_before: int = 0
    elevation_rate_deg_per_hour: float | None = None
    approx_disc_crossing_hours: float | None = None
    """Geometric RISE/SET only: ≈ 2ρ / |rate|. The disc-centre event is not an instant."""
    countdown: EventCountdown | None = None
    """Present only on ``next_change`` / ``next_confirmed_event``."""
    earlier_events_excluded: bool | None = None
    """RISE/SET in ``next_*`` only. False when UNKNOWN samples lie between the
    reference and the bracket, so an earlier unobserved event cannot be excluded."""


class EventTrack(ApiModel):
    """One body against one horizon type."""

    horizon: HorizonType
    status: TrackStatus
    current: EventSample | None = None
    """State at the last stored sample at or before the reference."""
    next_change: VisibilityEvent | None = None
    """First state change of any kind after the current sample (may be BECOMES_UNKNOWN)."""
    next_confirmed_event: VisibilityEvent | None = None
    """First RISE/SET between adjacent known samples after the current sample."""
    next_known: EventSample | None = None
    """UNKNOWN_AT_REFERENCE only: first later sample with a known state (not an event)."""
    no_change_through_utc: datetime | None = None
    """NO_EVENT_IN_WINDOW only: last stored sample still showing the current state."""
    sample_count: int
    unknown_sample_count: int
    transitions: list[VisibilityEvent]
    """Every state change in the stored window, in time order (no countdown)."""
    transitions_truncated: bool = False


class BodyEvents(ApiModel):
    body: Body
    nominal_angular_radius_deg: float
    geometric: EventTrack
    terrain: EventTrack | None = None
    """Present only for TERRAIN analyses."""


class SiteEvents(ApiModel):
    site_index: int
    label: str
    latitude_deg: Latitude
    longitude_deg: Longitude
    landing_site_id: str | None = None
    dem_site_id: str | None = None
    terrain_complete_coverage_fraction: float | None = None
    sun: BodyEvents
    earth: BodyEvents


class EventsResponse(ApiModel):
    analysis_id: str
    mission_name: str
    horizon_model: HorizonModel
    data_quality: DataQuality
    algorithm_version: str
    terrain_engine_version: str | None = None
    start_utc: datetime
    end_utc: datetime
    first_sample_utc: datetime
    last_sample_utc: datetime
    time_step_minutes: int
    reference_utc: datetime
    reference_mode: ReferenceMode
    generated_at_utc: datetime
    events_contract_version: str
    event_time_semantics: str
    sites: list[SiteEvents]
    provenance: list[EpochsProvenance]
    limitations: list[str]
