"""Operational visibility events from sampled three-valued states (Phase 7A).

Pure functions over an ordered series of *observations* (one per stored
ephemeris sample). Nothing here fetches data, interpolates ephemerides or
touches the scoring / terrain-metric code paths.

Semantics
---------
* States are three-valued: ``VISIBLE``, ``NOT_VISIBLE``, ``UNKNOWN``.
  ``UNKNOWN`` is never coerced to either known state.
* An event is only ever located **between two samples**. It is reported as the
  half-open bracket ``(before.t, after.t]`` — never as a single timestamp.
* A **confirmed** ``RISE``/``SET`` exists only between two *adjacent known*
  samples. It proves a *net* state change inside the bracket (an odd number of
  crossings), not exactly one crossing.
* Two equal samples do not prove that nothing happened between them; "no
  event" therefore always means "no change at the sampled epochs".
* Nothing is ever confirmed across an UNKNOWN interval.
  ``VISIBLE → UNKNOWN … → NOT_VISIBLE`` is reported as ``BECOMES_UNKNOWN``
  followed by ``RESOLVES_TO_NOT_VISIBLE`` with ``differs_from_last_known =
  True`` and the last known sample attached, so a consumer can see that the
  state differs after the gap without the engine asserting when (or how many
  times) it changed. It is **not** a set.
* ``VISIBLE → UNKNOWN … → VISIBLE`` confirms nothing either. Any confirmed
  event found *after* an UNKNOWN run carries ``unknown_gap_before = True``:
  an earlier unobserved event cannot be ruled out. (``False`` only says there
  were no UNKNOWN samples in between — equal samples still prove nothing about
  the time between them.)
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum


class VisState(str, Enum):
    VISIBLE = "VISIBLE"
    NOT_VISIBLE = "NOT_VISIBLE"
    UNKNOWN = "UNKNOWN"


class EventKind(str, Enum):
    RISE = "RISE"  # NOT_VISIBLE → VISIBLE between adjacent known samples
    SET = "SET"  # VISIBLE → NOT_VISIBLE between adjacent known samples
    BECOMES_UNKNOWN = "BECOMES_UNKNOWN"  # known → UNKNOWN (never a rise/set)
    RESOLVES_TO_VISIBLE = "RESOLVES_TO_VISIBLE"  # UNKNOWN → VISIBLE (not a rise)
    RESOLVES_TO_NOT_VISIBLE = "RESOLVES_TO_NOT_VISIBLE"  # UNKNOWN → NOT_VISIBLE (not a set)


CONFIRMED_KINDS = frozenset({EventKind.RISE, EventKind.SET})


class TrackStatus(str, Enum):
    EVENT_CONFIRMED = "EVENT_CONFIRMED"
    UNKNOWN_AHEAD = "UNKNOWN_AHEAD"
    NO_EVENT_IN_WINDOW = "NO_EVENT_IN_WINDOW"
    UNKNOWN_AT_REFERENCE = "UNKNOWN_AT_REFERENCE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    REFERENCE_OUTSIDE_SAMPLES = "REFERENCE_OUTSIDE_SAMPLES"


@dataclass(frozen=True, slots=True)
class Observation:
    """One stored sample of one body against one horizon type."""

    t: datetime
    state: VisState
    elevation_deg: float | None = None
    horizon_deg: float | None = None
    not_visible_reason: str | None = None
    unknown_reason: str | None = None


@dataclass(frozen=True, slots=True)
class Transition:
    kind: EventKind
    before_index: int  # last sample still in ``from_state``
    after_index: int  # first sample in ``to_state``
    before: Observation
    after: Observation
    # RESOLVES_* only: the last known sample before the UNKNOWN run (if any) and
    # whether the resolved state differs from it. Informational — NOT an event.
    last_known_before_unknown: Observation | None = None
    differs_from_last_known: bool | None = None
    unknown_samples_before: int = 0

    @property
    def confirmed(self) -> bool:
        """True only for a rise/set bracketed by two adjacent known samples."""
        return self.kind in CONFIRMED_KINDS

    @property
    def from_state(self) -> VisState:
        return self.before.state

    @property
    def to_state(self) -> VisState:
        return self.after.state

    @property
    def bracket_minutes(self) -> float:
        return (self.after.t - self.before.t).total_seconds() / 60.0


@dataclass(frozen=True, slots=True)
class Countdown:
    """Time from the reference to an event bracket (never a single number)."""

    earliest_minutes: float
    latest_minutes: float
    may_have_occurred: bool


@dataclass(frozen=True, slots=True)
class NextEvent:
    transition: Transition
    countdown: Countdown
    # None for BECOMES_UNKNOWN / RESOLVES_*; for RISE/SET: True when UNKNOWN
    # samples lie between the reference and the bracket (earlier events possible).
    unknown_gap_before: bool | None


@dataclass(frozen=True, slots=True)
class TrackEvaluation:
    status: TrackStatus
    reference_index: int | None
    current: Observation | None
    next_change: NextEvent | None
    next_confirmed_event: NextEvent | None
    next_known: Observation | None  # first known sample after an UNKNOWN reference
    no_change_through: datetime | None  # last sample confirming the current state
    sample_count: int
    unknown_sample_count: int


def _utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError("timestamps must be timezone-aware")
    return dt.astimezone(UTC)


def validate_observations(observations: Sequence[Observation]) -> None:
    previous: datetime | None = None
    for obs in observations:
        t = _utc(obs.t)
        if previous is not None and t <= previous:
            raise ValueError("observations must be strictly increasing in time")
        previous = t


def find_transitions(observations: Sequence[Observation]) -> list[Transition]:
    """All state changes between consecutive samples, in time order.

    ``RISE``/``SET`` are emitted only for two adjacent known samples. Around an
    UNKNOWN run the output is ``BECOMES_UNKNOWN`` then ``RESOLVES_*`` — never a
    rise or set, even when the state after the run differs from the one before.
    """
    validate_observations(observations)
    out: list[Transition] = []
    last_known_index: int | None = None
    for i, obs in enumerate(observations):
        if i == 0:
            if obs.state is not VisState.UNKNOWN:
                last_known_index = 0
            continue
        prev = observations[i - 1]
        if obs.state is VisState.UNKNOWN:
            if prev.state is not VisState.UNKNOWN:
                out.append(
                    Transition(
                        kind=EventKind.BECOMES_UNKNOWN,
                        before_index=i - 1,
                        after_index=i,
                        before=prev,
                        after=obs,
                    )
                )
            continue

        # ``obs`` is a known state from here on.
        if prev.state is VisState.UNKNOWN:
            anchor = observations[last_known_index] if last_known_index is not None else None
            out.append(
                Transition(
                    kind=(
                        EventKind.RESOLVES_TO_VISIBLE
                        if obs.state is VisState.VISIBLE
                        else EventKind.RESOLVES_TO_NOT_VISIBLE
                    ),
                    before_index=i - 1,
                    after_index=i,
                    before=prev,
                    after=obs,
                    last_known_before_unknown=anchor,
                    differs_from_last_known=(
                        None if anchor is None else anchor.state is not obs.state
                    ),
                    unknown_samples_before=(
                        i - last_known_index - 1 if last_known_index is not None else i
                    ),
                )
            )
        elif prev.state is not obs.state:
            out.append(
                Transition(
                    kind=EventKind.RISE if obs.state is VisState.VISIBLE else EventKind.SET,
                    before_index=i - 1,
                    after_index=i,
                    before=prev,
                    after=obs,
                )
            )
        last_known_index = i
    return out


def reference_index(observations: Sequence[Observation], reference: datetime) -> int:
    """Index of the last sample at or before ``reference``.

    Raises ``ValueError`` when the reference lies outside the sampled span —
    no state is known there and none may be assumed.
    """
    if not observations:
        raise ValueError("no observations")
    ref = _utc(reference)
    if ref < _utc(observations[0].t) or ref > _utc(observations[-1].t):
        raise ValueError("reference is outside the sampled span")
    lo, hi = 0, len(observations) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if _utc(observations[mid].t) <= ref:
            lo = mid
        else:
            hi = mid - 1
    return lo


def _countdown(transition: Transition, reference: datetime) -> Countdown:
    ref = _utc(reference)
    start = _utc(transition.before.t)
    end = _utc(transition.after.t)
    earliest = max(0.0, (start - ref).total_seconds() / 60.0)
    latest = max(0.0, (end - ref).total_seconds() / 60.0)
    # The event lies in (start, end]: it may predate the reference only when the
    # reference is strictly inside the bracket.
    return Countdown(
        earliest_minutes=earliest,
        latest_minutes=latest,
        may_have_occurred=start < ref <= end,
    )


def evaluate_track(
    observations: Sequence[Observation],
    reference: datetime,
    transitions: Sequence[Transition] | None = None,
) -> TrackEvaluation:
    """Current state and next events for one body / horizon type at ``reference``."""
    n = len(observations)
    unknown_count = sum(1 for o in observations if o.state is VisState.UNKNOWN)
    if n < 2 or unknown_count == n:
        return TrackEvaluation(
            status=TrackStatus.INSUFFICIENT_DATA,
            reference_index=None,
            current=None,
            next_change=None,
            next_confirmed_event=None,
            next_known=None,
            no_change_through=None,
            sample_count=n,
            unknown_sample_count=unknown_count,
        )
    if transitions is None:
        transitions = find_transitions(observations)
    ref = _utc(reference)
    if ref < _utc(observations[0].t) or ref > _utc(observations[-1].t):
        # No state is known at the reference for this track; assume nothing.
        return TrackEvaluation(
            status=TrackStatus.REFERENCE_OUTSIDE_SAMPLES,
            reference_index=None,
            current=None,
            next_change=None,
            next_confirmed_event=None,
            next_known=None,
            no_change_through=None,
            sample_count=n,
            unknown_sample_count=unknown_count,
        )
    idx = reference_index(observations, reference)
    current = observations[idx]

    if current.state is VisState.UNKNOWN:
        next_known = next(
            (o for o in observations[idx + 1 :] if o.state is not VisState.UNKNOWN), None
        )
        return TrackEvaluation(
            status=TrackStatus.UNKNOWN_AT_REFERENCE,
            reference_index=idx,
            current=current,
            next_change=None,
            next_confirmed_event=None,
            next_known=next_known,
            no_change_through=None,
            sample_count=n,
            unknown_sample_count=unknown_count,
        )

    # Brackets are (before, after], so a transition is still ahead of the
    # current sample exactly when after_index > idx.
    ahead = [tr for tr in transitions if tr.after_index > idx]
    if not ahead:
        return TrackEvaluation(
            status=TrackStatus.NO_EVENT_IN_WINDOW,
            reference_index=idx,
            current=current,
            next_change=None,
            next_confirmed_event=None,
            next_known=None,
            no_change_through=observations[-1].t,
            sample_count=n,
            unknown_sample_count=unknown_count,
        )

    def wrap(tr: Transition) -> NextEvent:
        gap: bool | None = None
        if tr.confirmed:
            # An UNKNOWN run between the reference and this bracket hides
            # possible earlier events.
            gap = any(
                observations[k].state is VisState.UNKNOWN
                for k in range(idx + 1, tr.before_index + 1)
            )
        return NextEvent(
            transition=tr,
            countdown=_countdown(tr, reference),
            unknown_gap_before=gap,
        )

    first = ahead[0]
    confirmed = next((tr for tr in ahead if tr.confirmed), None)
    return TrackEvaluation(
        status=TrackStatus.EVENT_CONFIRMED if first.confirmed else TrackStatus.UNKNOWN_AHEAD,
        reference_index=idx,
        current=current,
        next_change=wrap(first),
        next_confirmed_event=wrap(confirmed) if confirmed is not None else None,
        next_known=None,
        no_change_through=None,
        sample_count=n,
        unknown_sample_count=unknown_count,
    )


def elevation_rate_deg_per_hour(transition: Transition) -> float | None:
    """Mean elevation rate across a confirmed bracket (source values only)."""
    if not transition.confirmed:
        return None
    e0, e1 = transition.before.elevation_deg, transition.after.elevation_deg
    if e0 is None or e1 is None:
        return None
    hours = transition.bracket_minutes / 60.0
    if hours <= 0:
        return None
    return (e1 - e0) / hours


def approx_disc_crossing_hours(
    transition: Transition, angular_radius_deg: float
) -> float | None:
    """≈ time for the whole disc to cross a straight horizon at the bracket's mean rate.

    ``2ρ / |de/dt|``. A first-order indication that a disc-centre event is not
    an instant; only meaningful for the smooth geometric horizon.
    """
    rate = elevation_rate_deg_per_hour(transition)
    if rate is None or abs(rate) < 1e-9:
        return None
    return 2.0 * angular_radius_deg / abs(rate)
