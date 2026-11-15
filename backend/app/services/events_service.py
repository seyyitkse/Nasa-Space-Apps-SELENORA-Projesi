"""Operational Sun/Earth events for a stored analysis (Phase 7A).

Read-only over the authoritative per-epoch states produced by
``epochs_service.load_epochs``. This module deliberately does **not** import
``visibility.summarize``, scoring, or any stored result metrics / window
lists, so the known H1/H2 defects in those code paths cannot leak in here.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.schemas.epochs import EpochSample, EpochsResponse, SiteEpochs
from app.schemas.events import (
    BodyEvents,
    EventCountdown,
    EventSample,
    EventsResponse,
    EventTrack,
    SiteEvents,
    VisibilityEvent,
)
from app.science import events as ev
from app.services import epochs_service, terrain_data_service

EVENTS_CONTRACT_VERSION = "7a.1"
MAX_TRANSITIONS_PER_TRACK = 500

# Nominal apparent angular radii as seen from the Moon (deg). Used only for the
# "disc crossing is not an instant" indication — never for state classification.
NOMINAL_ANGULAR_RADIUS_DEG = {"SUN": 0.2666, "EARTH": 0.95}

EVENT_TIME_SEMANTICS = (
    "Each event lies in the half-open bracket (bracket_start_utc, bracket_end_utc] "
    "between two stored samples; no event time is interpolated. bracket_minutes is "
    "the timing uncertainty. Countdowns are ranges measured from reference_utc."
)


class EventsReferenceError(AppError):
    status_code = 422
    code = "REFERENCE_OUT_OF_WINDOW"


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise EventsReferenceError("reference_utc must include a timezone (use UTC).")
    return value.astimezone(UTC)


def _geometric_observation(sample: EpochSample, body: str) -> ev.Observation:
    raw = sample.sun_geometric_state if body == "SUN" else sample.earth_geometric_state
    elevation = sample.sun_elevation_deg if body == "SUN" else sample.earth_elevation_deg
    if raw is None:
        # Older payloads: derive with the engine's own strict > 0° rule.
        raw = "UNKNOWN" if elevation is None else ("VISIBLE" if elevation > 0.0 else "BLOCKED")
    if raw == "VISIBLE":
        return ev.Observation(sample.t, ev.VisState.VISIBLE, elevation, 0.0)
    if raw == "BLOCKED":
        # Geometric "BLOCKED" means below the 0° sphere horizon — not terrain.
        return ev.Observation(
            sample.t,
            ev.VisState.NOT_VISIBLE,
            elevation,
            0.0,
            not_visible_reason="BELOW_GEOMETRIC_HORIZON",
        )
    return ev.Observation(
        sample.t, ev.VisState.UNKNOWN, elevation, 0.0, unknown_reason="MISSING_EPHEMERIS"
    )


def _terrain_observation(sample: EpochSample, body: str) -> ev.Observation:
    if body == "SUN":
        raw, elevation = sample.sun_state, sample.sun_elevation_deg
        azimuth, horizon = sample.sun_azimuth_deg, sample.sun_terrain_horizon_deg
    else:
        raw, elevation = sample.earth_state, sample.earth_elevation_deg
        azimuth, horizon = sample.earth_azimuth_deg, sample.earth_terrain_horizon_deg
    if raw == "VISIBLE":
        return ev.Observation(sample.t, ev.VisState.VISIBLE, elevation, horizon)
    if raw == "BLOCKED":
        return ev.Observation(
            sample.t,
            ev.VisState.NOT_VISIBLE,
            elevation,
            horizon,
            not_visible_reason="TERRAIN_OCCULTED",
        )
    if elevation is None or azimuth is None:
        reason = "MISSING_EPHEMERIS"
    elif horizon is None:
        reason = "TERRAIN_DATA_UNAVAILABLE"
    else:
        reason = "TERRAIN_COVERAGE_INCOMPLETE"
    return ev.Observation(sample.t, ev.VisState.UNKNOWN, elevation, horizon, unknown_reason=reason)


def _sample(obs: ev.Observation | None) -> EventSample | None:
    if obs is None:
        return None
    return EventSample(
        t=obs.t,
        state=obs.state.value,  # type: ignore[arg-type]
        elevation_deg=obs.elevation_deg,
        horizon_deg=obs.horizon_deg,
        not_visible_reason=obs.not_visible_reason,  # type: ignore[arg-type]
        unknown_reason=obs.unknown_reason,  # type: ignore[arg-type]
    )


def _event(
    tr: ev.Transition,
    *,
    body: str,
    horizon: str,
    nxt: ev.NextEvent | None = None,
) -> VisibilityEvent:
    rate = ev.elevation_rate_deg_per_hour(tr)
    disc = None
    if horizon == "GEOMETRIC":
        raw = ev.approx_disc_crossing_hours(tr, NOMINAL_ANGULAR_RADIUS_DEG[body])
        # One significant step only: this is an indication, not a prediction.
        disc = None if raw is None else float(max(1, round(raw)))
    before = _sample(tr.before)
    after = _sample(tr.after)
    assert before is not None and after is not None
    return VisibilityEvent(
        kind=tr.kind.value,  # type: ignore[arg-type]
        confirmed=tr.confirmed,
        from_state=tr.from_state.value,  # type: ignore[arg-type]
        to_state=tr.to_state.value,  # type: ignore[arg-type]
        bracket_start_utc=tr.before.t,
        bracket_end_utc=tr.after.t,
        bracket_minutes=round(tr.bracket_minutes, 3),
        before=before,
        after=after,
        last_known_before_unknown=_sample(tr.last_known_before_unknown),
        differs_from_last_known=tr.differs_from_last_known,
        unknown_samples_before=tr.unknown_samples_before,
        elevation_rate_deg_per_hour=None if rate is None else round(rate, 6),
        approx_disc_crossing_hours=disc,
        countdown=(
            None
            if nxt is None
            else EventCountdown(
                earliest_minutes=round(nxt.countdown.earliest_minutes, 3),
                latest_minutes=round(nxt.countdown.latest_minutes, 3),
                may_have_occurred=nxt.countdown.may_have_occurred,
            )
        ),
        earlier_events_excluded=None if nxt is None else nxt.earlier_events_excluded,
    )


def build_track(
    observations: list[ev.Observation],
    reference: datetime,
    *,
    body: str,
    horizon: str,
) -> EventTrack:
    transitions = ev.find_transitions(observations)
    evaluation = ev.evaluate_track(observations, reference, transitions)
    return EventTrack(
        horizon=horizon,  # type: ignore[arg-type]
        status=evaluation.status.value,  # type: ignore[arg-type]
        current=_sample(evaluation.current),
        next_change=(
            None
            if evaluation.next_change is None
            else _event(
                evaluation.next_change.transition,
                body=body,
                horizon=horizon,
                nxt=evaluation.next_change,
            )
        ),
        next_confirmed_event=(
            None
            if evaluation.next_confirmed_event is None
            else _event(
                evaluation.next_confirmed_event.transition,
                body=body,
                horizon=horizon,
                nxt=evaluation.next_confirmed_event,
            )
        ),
        next_known=_sample(evaluation.next_known),
        no_change_through_utc=evaluation.no_change_through,
        sample_count=evaluation.sample_count,
        unknown_sample_count=evaluation.unknown_sample_count,
        transitions=[
            _event(tr, body=body, horizon=horizon)
            for tr in transitions[:MAX_TRANSITIONS_PER_TRACK]
        ],
        transitions_truncated=len(transitions) > MAX_TRANSITIONS_PER_TRACK,
    )


def _body_events(
    site: SiteEpochs, body: str, reference: datetime, *, terrain: bool
) -> BodyEvents:
    geometric = build_track(
        [_geometric_observation(s, body) for s in site.samples],
        reference,
        body=body,
        horizon="GEOMETRIC",
    )
    terrain_track = None
    if terrain:
        terrain_track = build_track(
            [_terrain_observation(s, body) for s in site.samples],
            reference,
            body=body,
            horizon="TERRAIN",
        )
    return BodyEvents(
        body=body,  # type: ignore[arg-type]
        nominal_angular_radius_deg=NOMINAL_ANGULAR_RADIUS_DEG[body],
        geometric=geometric,
        terrain=terrain_track,
    )


def resolve_reference(
    requested: datetime | None,
    *,
    first_sample: datetime,
    last_sample: datetime,
    now: datetime,
) -> tuple[datetime, str]:
    """Pick the reference epoch. Window start is never labelled "now"."""
    if requested is not None:
        ref = _as_utc(requested)
        if ref < first_sample or ref > last_sample:
            raise EventsReferenceError(
                "reference_utc is outside the stored samples of this analysis; "
                "no visibility state is known there.",
                details={
                    "first_sample_utc": first_sample.isoformat(),
                    "last_sample_utc": last_sample.isoformat(),
                },
            )
        return ref, "REQUESTED"
    current = now.astimezone(UTC)
    if first_sample <= current <= last_sample:
        return current, "NOW"
    return first_sample, "WINDOW_START"


def events_from_epochs(
    epochs: EpochsResponse,
    *,
    reference_utc: datetime | None = None,
    now: datetime | None = None,
) -> EventsResponse:
    """Pure transformation ``EpochsResponse`` → ``EventsResponse`` (unit-testable)."""
    clock = (now or datetime.now(UTC)).astimezone(UTC)
    terrain = epochs.horizon_model == "TERRAIN"
    if not epochs.sites or not epochs.sites[0].samples:
        raise EventsReferenceError("Analysis has no stored samples to derive events from.")
    first_sample = min(s.samples[0].t for s in epochs.sites if s.samples).astimezone(UTC)
    last_sample = max(s.samples[-1].t for s in epochs.sites if s.samples).astimezone(UTC)
    reference, mode = resolve_reference(
        reference_utc, first_sample=first_sample, last_sample=last_sample, now=clock
    )

    sites = [
        SiteEvents(
            site_index=i,
            label=site.label,
            latitude_deg=site.latitude_deg,
            longitude_deg=site.longitude_deg,
            landing_site_id=site.landing_site_id,
            dem_site_id=site.dem_site_id,
            terrain_complete_coverage_fraction=site.terrain_complete_coverage_fraction,
            sun=_body_events(site, "SUN", reference, terrain=terrain),
            earth=_body_events(site, "EARTH", reference, terrain=terrain),
        )
        for i, site in enumerate(epochs.sites)
    ]

    limitations = [
        "Events are derived only from stored per-epoch states; no new ephemeris is "
        "fetched and no event time is interpolated.",
        "A confirmed RISE/SET requires two adjacent known samples. It proves a net "
        "state change inside the bracket, not exactly one crossing.",
        "Nothing is confirmed across UNKNOWN samples: a state that differs after an "
        "UNKNOWN run is reported as RESOLVES_* with differs_from_last_known, never as "
        "a rise or set.",
        "NO_EVENT_IN_WINDOW means no state change at the sampled epochs after the "
        "reference; shorter excursions between samples cannot be excluded.",
        "Geometric events are disc-CENTRE crossings of the 0° smooth-sphere horizon. "
        "At polar sites the full disc can take many hours to cross "
        "(approx_disc_crossing_hours); the bracket is not a moment of darkness or light.",
        "Sun rise/set here is line-of-sight to the disc centre only — not power output. "
        "Earth events are Direct-to-Earth visibility potential — not a link budget.",
    ]
    if terrain:
        limitations.extend(
            [
                "Terrain states use the local LOLA 5 m horizon recomputed at request time "
                f"(engine {terrain_data_service.HORIZON_ENGINE_VERSION}). UNKNOWN means "
                "the DEM cannot decide — it is never treated as visible or blocked.",
                "The terrain horizon is sampled in 5° azimuth bins (nearest bin). Terrain "
                "event brackets can be created or shifted by bin boundaries; this "
                "uncertainty is not included in bracket_minutes.",
                "Terrain beyond the local DEM range is not modelled; a terrain VISIBLE "
                "state means clear of terrain within the modelled range only.",
            ]
        )
    else:
        limitations.append(
            "GEOMETRIC analysis: NOT_VISIBLE means below the smooth-sphere horizon. "
            "Terrain obstruction is not modelled and no terrain events are reported."
        )

    return EventsResponse(
        analysis_id=epochs.analysis_id,
        mission_name=epochs.mission_name,
        horizon_model=epochs.horizon_model,
        data_quality=epochs.data_quality,
        algorithm_version=epochs.algorithm_version,
        terrain_engine_version=terrain_data_service.HORIZON_ENGINE_VERSION if terrain else None,
        start_utc=epochs.start_utc,
        end_utc=epochs.end_utc,
        first_sample_utc=first_sample,
        last_sample_utc=last_sample,
        time_step_minutes=epochs.time_step_minutes,
        reference_utc=reference,
        reference_mode=mode,  # type: ignore[arg-type]
        generated_at_utc=clock,
        events_contract_version=EVENTS_CONTRACT_VERSION,
        event_time_semantics=EVENT_TIME_SEMANTICS,
        sites=sites,
        provenance=list(epochs.provenance),
        limitations=limitations,
    )


def load_events(
    session: Session,
    analysis_id: str,
    *,
    reference_utc: datetime | None = None,
    now: datetime | None = None,
) -> EventsResponse:
    epochs = epochs_service.load_epochs(session, analysis_id)
    return events_from_epochs(epochs, reference_utc=reference_utc, now=now)
