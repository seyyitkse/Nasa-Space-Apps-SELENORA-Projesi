"""Phase 7A — operational Sun/Earth events.

Synthetic state/elevation series below exercise the algorithm only; they are
NOT NASA measurements. The two ``horizons_*_shackleton_a`` fixtures are real
JPL Horizons responses and are used as such.
"""

from __future__ import annotations

import math
import random
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.schemas.epochs import EpochSample, EpochsResponse, SiteEpochs
from app.schemas.events import VisibilityEvent
from app.science import events as ev
from app.services import events_service, terrain_data_service
from tests.test_analysis_service import FakeHorizons, _ephem, _samples_from_fixture

T0 = datetime(2026, 12, 1, tzinfo=UTC)
CODES = {"V": ev.VisState.VISIBLE, "N": ev.VisState.NOT_VISIBLE, "U": ev.VisState.UNKNOWN}


def series(codes: str, step_min: int = 60) -> list[ev.Observation]:
    """SYNTHETIC state series: one character per sample (V / N / U)."""
    return [
        ev.Observation(T0 + timedelta(minutes=i * step_min), CODES[c]) for i, c in enumerate(codes)
    ]


def at(index: float, step_min: int = 60) -> datetime:
    return T0 + timedelta(minutes=index * step_min)


def kinds(codes: str) -> list[str]:
    return [t.kind.value for t in ev.find_transitions(series(codes))]


# --------------------------------------------------------------- confirmed events


def test_confirmed_visible_to_not_visible_is_a_bracketed_set() -> None:
    obs = series("VVNN")
    result = ev.evaluate_track(obs, at(0))
    assert result.status is ev.TrackStatus.EVENT_CONFIRMED
    assert result.current is not None and result.current.state is ev.VisState.VISIBLE
    nxt = result.next_confirmed_event
    assert nxt is not None and nxt.transition.kind is ev.EventKind.SET
    assert nxt.transition.before.t == at(1) and nxt.transition.after.t == at(2)
    assert nxt.transition.bracket_minutes == 60
    assert (nxt.countdown.earliest_minutes, nxt.countdown.latest_minutes) == (60, 120)
    assert nxt.countdown.may_have_occurred is False
    assert nxt.earlier_events_excluded is True
    assert result.next_change is not None and result.next_change.transition is nxt.transition


def test_confirmed_not_visible_to_visible_is_a_bracketed_rise() -> None:
    result = ev.evaluate_track(series("NNNVV"), at(1))
    assert result.status is ev.TrackStatus.EVENT_CONFIRMED
    nxt = result.next_confirmed_event
    assert nxt is not None and nxt.transition.kind is ev.EventKind.RISE
    assert (nxt.transition.before.t, nxt.transition.after.t) == (at(2), at(3))
    assert (nxt.countdown.earliest_minutes, nxt.countdown.latest_minutes) == (60, 120)


def test_no_transition_reports_no_event_in_window_not_a_fabricated_one() -> None:
    result = ev.evaluate_track(series("VVVVV"), at(1.5))
    assert result.status is ev.TrackStatus.NO_EVENT_IN_WINDOW
    assert result.next_change is None and result.next_confirmed_event is None
    assert result.no_change_through == at(4)  # last stored sample, not "forever"
    assert ev.find_transitions(series("VVVVV")) == []
    assert ev.find_transitions(series("NNNN")) == []


# ---------------------------------------------------------------------- UNKNOWN


def test_unknown_between_two_different_known_states_is_never_a_rise_or_set() -> None:
    assert kinds("VUN") == ["BECOMES_UNKNOWN", "RESOLVES_TO_NOT_VISIBLE"]
    assert kinds("NUUV") == ["BECOMES_UNKNOWN", "RESOLVES_TO_VISIBLE"]

    obs = series("VVUUNN")
    result = ev.evaluate_track(obs, at(0))
    assert result.status is ev.TrackStatus.UNKNOWN_AHEAD
    assert result.next_confirmed_event is None  # nothing is confirmed across UNKNOWN
    assert result.next_change is not None
    assert result.next_change.transition.kind is ev.EventKind.BECOMES_UNKNOWN
    assert result.next_change.earlier_events_excluded is None

    resolves = ev.find_transitions(obs)[1]
    assert resolves.kind is ev.EventKind.RESOLVES_TO_NOT_VISIBLE
    assert resolves.confirmed is False
    assert resolves.differs_from_last_known is True
    assert resolves.last_known_before_unknown is not None
    assert resolves.last_known_before_unknown.t == at(1)
    assert resolves.unknown_samples_before == 2


def test_unknown_between_equal_known_states_confirms_nothing() -> None:
    transitions = ev.find_transitions(series("VUV"))
    assert [t.kind.value for t in transitions] == ["BECOMES_UNKNOWN", "RESOLVES_TO_VISIBLE"]
    assert transitions[1].differs_from_last_known is False
    result = ev.evaluate_track(series("VUV"), at(0))
    assert result.status is ev.TrackStatus.UNKNOWN_AHEAD
    assert result.next_confirmed_event is None


def test_confirmed_event_after_unknown_gap_cannot_exclude_earlier_events() -> None:
    result = ev.evaluate_track(series("VUVVN"), at(0))
    assert result.status is ev.TrackStatus.UNKNOWN_AHEAD
    nxt = result.next_confirmed_event
    assert nxt is not None and nxt.transition.kind is ev.EventKind.SET
    assert (nxt.transition.before.t, nxt.transition.after.t) == (at(3), at(4))
    assert nxt.earlier_events_excluded is False
    # Same series, reference after the gap: the gap no longer lies in between.
    later = ev.evaluate_track(series("VUVVN"), at(2))
    assert later.status is ev.TrackStatus.EVENT_CONFIRMED
    assert later.next_confirmed_event is not None
    assert later.next_confirmed_event.earlier_events_excluded is True


def test_entire_interval_unknown_is_insufficient_data() -> None:
    result = ev.evaluate_track(series("UUUU"), at(1))
    assert result.status is ev.TrackStatus.INSUFFICIENT_DATA
    assert result.current is None
    assert result.next_change is None and result.next_confirmed_event is None
    assert ev.find_transitions(series("UUUU")) == []


def test_single_sample_is_insufficient_data() -> None:
    assert ev.evaluate_track(series("V"), at(0)).status is ev.TrackStatus.INSUFFICIENT_DATA


def test_unknown_at_reference_gives_no_countdown() -> None:
    result = ev.evaluate_track(series("VUUNV"), at(1.5))
    assert result.status is ev.TrackStatus.UNKNOWN_AT_REFERENCE
    assert result.next_change is None and result.next_confirmed_event is None
    assert result.next_known is not None
    assert result.next_known.t == at(3) and result.next_known.state is ev.VisState.NOT_VISIBLE
    trailing = ev.evaluate_track(series("VVUU"), at(2))
    assert trailing.status is ev.TrackStatus.UNKNOWN_AT_REFERENCE
    assert trailing.next_known is None


def test_leading_unknown_resolution_has_no_anchor() -> None:
    transitions = ev.find_transitions(series("UUVN"))
    assert [t.kind.value for t in transitions] == ["RESOLVES_TO_VISIBLE", "SET"]
    assert transitions[0].last_known_before_unknown is None
    assert transitions[0].differs_from_last_known is None


# ------------------------------------------------------------------- boundaries


def test_reference_exactly_on_a_sample_and_inside_a_bracket() -> None:
    obs = series("VN")
    on_sample = ev.evaluate_track(obs, at(0)).next_confirmed_event
    assert on_sample is not None
    assert (on_sample.countdown.earliest_minutes, on_sample.countdown.latest_minutes) == (0, 60)
    assert on_sample.countdown.may_have_occurred is False  # bracket is (t0, t1]

    inside = ev.evaluate_track(obs, at(0.5)).next_confirmed_event
    assert inside is not None
    assert (inside.countdown.earliest_minutes, inside.countdown.latest_minutes) == (0, 30)
    assert inside.countdown.may_have_occurred is True


def test_event_in_the_last_bracket_and_reference_on_the_last_sample() -> None:
    obs = series("VVVN")  # the inclusive STOP sample carries the change
    nxt = ev.evaluate_track(obs, at(0)).next_confirmed_event
    assert nxt is not None and nxt.transition.after.t == at(3)
    last = ev.evaluate_track(obs, at(3))
    assert last.status is ev.TrackStatus.NO_EVENT_IN_WINDOW
    assert last.current is not None and last.current.state is ev.VisState.NOT_VISIBLE
    assert last.no_change_through == at(3)


def test_event_in_the_first_bracket() -> None:
    nxt = ev.evaluate_track(series("NVVV"), at(0)).next_confirmed_event
    assert nxt is not None and nxt.transition.kind is ev.EventKind.RISE
    assert (nxt.transition.before.t, nxt.transition.after.t) == (at(0), at(1))


def test_reference_outside_the_sampled_span_is_rejected() -> None:
    obs = series("VVN")
    with pytest.raises(ValueError):
        ev.evaluate_track(obs, T0 - timedelta(minutes=1))
    with pytest.raises(ValueError):
        ev.evaluate_track(obs, at(2) + timedelta(minutes=1))
    with pytest.raises(ValueError):
        ev.evaluate_track(obs, datetime(2026, 12, 1, 0, 30))  # naive


def test_unordered_or_duplicate_samples_are_rejected() -> None:
    obs = series("VN")
    with pytest.raises(ValueError):
        ev.find_transitions([obs[1], obs[0]])
    with pytest.raises(ValueError):
        ev.find_transitions([obs[0], obs[0]])


def test_past_transitions_are_not_reported_as_next() -> None:
    result = ev.evaluate_track(series("VNNVV"), at(1.5))
    assert result.next_confirmed_event is not None
    assert result.next_confirmed_event.transition.kind is ev.EventKind.RISE
    assert result.next_confirmed_event.transition.before.t == at(2)


# ----------------------------------------------------------- time resolutions


def _synthetic_elevation(minutes: float) -> float:
    """SYNTHETIC smooth elevation (deg) with crossings; not an ephemeris."""
    return 1.2 * math.sin(2 * math.pi * (minutes - 703.0) / 9000.0)


def _sampled(step_min: int, total_min: int = 12960) -> list[ev.Observation]:
    out = []
    for m in range(0, total_min + 1, step_min):
        e = _synthetic_elevation(m)
        out.append(
            ev.Observation(
                T0 + timedelta(minutes=m),
                ev.VisState.VISIBLE if e > 0 else ev.VisState.NOT_VISIBLE,
                elevation_deg=e,
                horizon_deg=0.0,
            )
        )
    return out


def test_brackets_are_nested_across_time_resolutions_and_contain_the_true_crossing() -> None:
    true_crossings = [703.0, 5203.0, 9703.0]  # zeros of the synthetic function
    by_step = {}
    for step in (10, 60, 360):
        transitions = ev.find_transitions(_sampled(step))
        assert [t.kind.value for t in transitions] == ["RISE", "SET", "RISE"]
        brackets = [
            (
                (t.before.t - T0).total_seconds() / 60,
                (t.after.t - T0).total_seconds() / 60,
            )
            for t in transitions
        ]
        for (lo, hi), truth in zip(brackets, true_crossings, strict=True):
            assert lo < truth <= hi
            assert hi - lo == step  # uncertainty equals the sampling interval
        by_step[step] = brackets
    for fine, coarse in ((10, 60), (60, 360)):
        for (flo, fhi), (clo, chi) in zip(by_step[fine], by_step[coarse], strict=True):
            assert clo <= flo and fhi <= chi


def test_irregular_sample_spacing_uses_real_timestamps_not_the_nominal_step() -> None:
    obs = [
        ev.Observation(T0, ev.VisState.VISIBLE),
        ev.Observation(T0 + timedelta(minutes=60), ev.VisState.VISIBLE),
        ev.Observation(T0 + timedelta(minutes=240), ev.VisState.NOT_VISIBLE),  # 3 h gap
    ]
    (transition,) = ev.find_transitions(obs)
    assert transition.bracket_minutes == 180


# ------------------------------------------------------ no fabrication (property)


def test_no_event_fabrication_on_random_series() -> None:
    rng = random.Random(7)
    for _ in range(300):
        codes = "".join(rng.choice("VVNNU") for _ in range(rng.randint(2, 40)))
        obs = series(codes)
        transitions = ev.find_transitions(obs)
        expected_confirmed = sum(
            1
            for a, b in zip(codes, codes[1:], strict=False)
            if a != b and "U" not in (a, b)
        )
        confirmed = [t for t in transitions if t.confirmed]
        assert len(confirmed) == expected_confirmed
        for t in transitions:
            assert t.after_index > t.before_index
            assert t.before.t < t.after.t
            if t.confirmed:
                # Adjacent, both known, different: never across UNKNOWN.
                assert t.after_index == t.before_index + 1
                assert ev.VisState.UNKNOWN not in (t.before.state, t.after.state)
                assert t.before.state is not t.after.state
        # Every reference inside the span yields a consistent evaluation.
        ref = at(rng.uniform(0, len(codes) - 1))
        result = ev.evaluate_track(obs, ref, transitions)
        if result.next_confirmed_event is not None:
            assert result.next_confirmed_event.transition.confirmed
            assert result.next_confirmed_event.transition.after.t > ref


def test_disc_crossing_indication_only_for_confirmed_brackets() -> None:
    obs = [
        ev.Observation(T0, ev.VisState.VISIBLE, elevation_deg=0.01, horizon_deg=0.0),
        ev.Observation(at(1), ev.VisState.NOT_VISIBLE, elevation_deg=-0.01, horizon_deg=0.0),
        ev.Observation(at(2), ev.VisState.UNKNOWN),
        ev.Observation(at(3), ev.VisState.VISIBLE, elevation_deg=0.5, horizon_deg=0.0),
    ]
    set_, becomes_unknown, resolves = ev.find_transitions(obs)
    assert ev.elevation_rate_deg_per_hour(set_) == pytest.approx(-0.02)
    # 2 × 0.2666° / 0.02 °/h ≈ 26.7 h: the "sunset" is not an instant.
    assert ev.approx_disc_crossing_hours(set_, 0.2666) == pytest.approx(26.66)
    assert ev.elevation_rate_deg_per_hour(becomes_unknown) is None
    assert ev.approx_disc_crossing_hours(resolves, 0.2666) is None


# ------------------------------------------- service: geometric vs terrain tracks


def _epochs(horizon_model: str, rows: list[dict]) -> EpochsResponse:
    """SYNTHETIC EpochsResponse (contract shape of /epochs); not NASA data."""
    samples = [
        EpochSample(
            t=T0 + timedelta(hours=i),
            sun_azimuth_deg=10.0,
            earth_azimuth_deg=170.0,
            joint_state="UNKNOWN",
            hold_hours=1.0,
            contributes_duration=True,
            **row,
        )
        for i, row in enumerate(rows)
    ]
    return EpochsResponse(
        analysis_id="synthetic",
        mission_name="synthetic",
        horizon_model=horizon_model,  # type: ignore[arg-type]
        data_quality="LOCAL_TERRAIN_PARTIAL" if horizon_model == "TERRAIN" else "EPHEMERIS_GEOMETRIC",
        algorithm_version="test",
        start_utc=T0,
        end_utc=T0 + timedelta(hours=len(rows) - 1),
        time_step_minutes=60,
        sample_count_per_site=len(rows),
        duration_semantics="[start_utc, end_utc)",
        sites=[SiteEpochs(label="S", latitude_deg=-89.0, longitude_deg=0.0, samples=samples)],
        provenance=[],
        limitations=[],
    )


def _row(sun_el: float | None, sun_state: str, sun_geo: str, horizon: float | None = None) -> dict:
    return {
        "sun_elevation_deg": sun_el,
        "earth_elevation_deg": -2.0,
        "sun_state": sun_state,
        "earth_state": "BLOCKED",
        "sun_geometric_state": sun_geo,
        "earth_geometric_state": "BLOCKED",
        "sun_terrain_horizon_deg": horizon,
        "earth_terrain_horizon_deg": 1.0 if horizon is not None else None,
    }


def test_geometric_analysis_has_no_terrain_track_and_never_says_terrain_blocked() -> None:
    rows = [_row(0.4, "VISIBLE", "VISIBLE"), _row(0.1, "VISIBLE", "VISIBLE"),
            _row(-0.2, "BLOCKED", "BLOCKED"), _row(-0.5, "BLOCKED", "BLOCKED")]
    out = events_service.events_from_epochs(_epochs("GEOMETRIC", rows), reference_utc=T0)
    site = out.sites[0]
    assert site.sun.terrain is None and site.earth.terrain is None
    track = site.sun.geometric
    assert track.status == "EVENT_CONFIRMED"
    event = track.next_confirmed_event
    assert event is not None and event.kind == "SET" and event.confirmed is True
    assert event.after.state == "NOT_VISIBLE"
    assert event.after.not_visible_reason == "BELOW_GEOMETRIC_HORIZON"  # H3: not terrain
    assert event.before.elevation_deg == 0.1 and event.after.elevation_deg == -0.2
    assert event.before.horizon_deg == 0.0
    assert event.approx_disc_crossing_hours == 2.0  # 2·0.2666 / 0.3 °/h ≈ 1.8 → 2
    assert "TERRAIN_OCCULTED" not in out.model_dump_json()
    assert site.earth.geometric.status == "NO_EVENT_IN_WINDOW"
    assert site.earth.geometric.current is not None
    assert site.earth.geometric.current.not_visible_reason == "BELOW_GEOMETRIC_HORIZON"
    assert out.reference_mode == "REQUESTED"


def test_terrain_analysis_reports_both_tracks_with_separate_classification() -> None:
    # Geometrically the Sun is up throughout; terrain blocks it, then the DEM cannot decide.
    rows = [
        _row(1.0, "VISIBLE", "VISIBLE", horizon=0.2),
        _row(1.0, "BLOCKED", "VISIBLE", horizon=3.0),
        _row(1.0, "UNKNOWN", "VISIBLE", horizon=0.5),  # clear of known terrain, ray truncated
        _row(1.0, "UNKNOWN", "VISIBLE", horizon=None),  # no DEM data along the ray
        _row(None, "UNKNOWN", "UNKNOWN", horizon=None),  # ephemeris gap
        _row(1.0, "VISIBLE", "VISIBLE", horizon=0.1),
    ]
    out = events_service.events_from_epochs(_epochs("TERRAIN", rows), reference_utc=T0)
    sun = out.sites[0].sun
    assert sun.terrain is not None
    assert sun.geometric.horizon == "GEOMETRIC" and sun.terrain.horizon == "TERRAIN"

    terrain_kinds = [t.kind for t in sun.terrain.transitions]
    assert terrain_kinds == ["SET", "BECOMES_UNKNOWN", "RESOLVES_TO_VISIBLE"]
    set_event = sun.terrain.transitions[0]
    assert set_event.after.not_visible_reason == "TERRAIN_OCCULTED"
    assert set_event.after.horizon_deg == 3.0
    assert set_event.approx_disc_crossing_hours is None  # geometric-only indication
    becomes_unknown = sun.terrain.transitions[1]
    assert becomes_unknown.confirmed is False  # "clears known terrain" is not a sunrise
    assert becomes_unknown.after.unknown_reason == "TERRAIN_COVERAGE_INCOMPLETE"
    resolves = sun.terrain.transitions[2]
    assert resolves.differs_from_last_known is True and resolves.confirmed is False
    assert resolves.before.unknown_reason == "MISSING_EPHEMERIS"

    # Geometric track sees only the ephemeris gap — no terrain semantics.
    assert [t.kind for t in sun.geometric.transitions] == ["BECOMES_UNKNOWN", "RESOLVES_TO_VISIBLE"]
    assert all(t.confirmed is False for t in sun.geometric.transitions)

    reasons = {
        s.unknown_reason
        for s in (sun.terrain.transitions[1].after, sun.terrain.transitions[2].before)
    }
    assert reasons == {"TERRAIN_COVERAGE_INCOMPLETE", "MISSING_EPHEMERIS"}
    assert out.terrain_engine_version == terrain_data_service.HORIZON_ENGINE_VERSION
    assert any("5° azimuth" in note for note in out.limitations)


def test_terrain_unknown_reason_distinguishes_missing_dem() -> None:
    rows = [_row(1.0, "VISIBLE", "VISIBLE", horizon=0.1), _row(1.0, "UNKNOWN", "VISIBLE", horizon=None)]
    out = events_service.events_from_epochs(_epochs("TERRAIN", rows), reference_utc=T0)
    track = out.sites[0].sun.terrain
    assert track is not None and track.next_change is not None
    assert track.next_change.after.unknown_reason == "TERRAIN_DATA_UNAVAILABLE"
    assert track.status == "UNKNOWN_AHEAD"


def test_reference_mode_never_labels_window_start_as_now() -> None:
    rows = [_row(0.4, "VISIBLE", "VISIBLE"), _row(-0.2, "BLOCKED", "BLOCKED"), _row(-0.3, "BLOCKED", "BLOCKED")]
    epochs = _epochs("GEOMETRIC", rows)
    outside = events_service.events_from_epochs(epochs, now=T0 - timedelta(days=30))
    assert outside.reference_mode == "WINDOW_START" and outside.reference_utc == T0
    inside = events_service.events_from_epochs(epochs, now=T0 + timedelta(minutes=30))
    assert inside.reference_mode == "NOW"
    assert inside.reference_utc == T0 + timedelta(minutes=30)
    countdown = inside.sites[0].sun.geometric.next_confirmed_event.countdown  # type: ignore[union-attr]
    assert (countdown.earliest_minutes, countdown.latest_minutes) == (0, 30)
    assert countdown.may_have_occurred is True
    with pytest.raises(events_service.EventsReferenceError):
        events_service.events_from_epochs(epochs, reference_utc=T0 + timedelta(hours=5))
    with pytest.raises(events_service.EventsReferenceError):
        events_service.events_from_epochs(epochs, reference_utc=datetime(2026, 12, 1, 0, 30))


def test_contract_has_no_single_event_timestamp_field() -> None:
    """An event is a bracket; the schema must not grow an 'exact time' field."""
    fields = set(VisibilityEvent.model_fields)
    assert {"bracket_start_utc", "bracket_end_utc", "bracket_minutes"} <= fields
    assert not {f for f in fields if f in {"time_utc", "event_utc", "estimate_utc", "t", "at_utc"}}


# ----------------------------------------------------------------- API (stored)

_BODY = {
    "mission_name": "Events Study",
    "sites": [
        {"label": "A", "latitude_deg": -89.68, "longitude_deg": -166.0},
        {"label": "B", "latitude_deg": -89.44, "longitude_deg": -141.8},
    ],
    "start_utc": "2026-12-01T00:00:00Z",
    "end_utc": "2026-12-02T00:00:00Z",
    "time_step_minutes": 360,
    "horizon_model": "GEOMETRIC",
    "weights": {"sun_visibility": 40, "earth_visibility": 40, "joint_visibility": 20},
}


def _create(client: TestClient, fake: FakeHorizons, **overrides: object) -> str:
    from app.api.deps import horizons_client

    client.app.dependency_overrides[horizons_client] = lambda: fake  # type: ignore[attr-defined]
    created = client.post("/api/v1/analyses", json={**_BODY, **overrides})
    assert created.status_code == 200, created.text
    return created.json()["id"]


def test_events_endpoint_on_real_horizons_fixtures_reports_no_event(client: TestClient) -> None:
    """Real JPL Horizons fixture (Shackleton rim A, 2026-12-01): Sun up, Earth down all day."""
    sun = _samples_from_fixture("horizons_sun_shackleton_a_2026-12-01.json")
    earth = _samples_from_fixture("horizons_earth_shackleton_a_2026-12-01.json")
    fake = FakeHorizons(
        {
            ("SUN", -89.68, -166.0): _ephem("SUN", sun, -89.68, -166.0),
            ("EARTH", -89.68, -166.0): _ephem("EARTH", earth, -89.68, -166.0),
        }
    )
    analysis_id = _create(client, fake)
    r = client.get(f"/api/v1/analyses/{analysis_id}/events")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["horizon_model"] == "GEOMETRIC"
    assert payload["reference_mode"] in {"WINDOW_START", "NOW"}
    assert payload["events_contract_version"] == events_service.EVENTS_CONTRACT_VERSION
    site_a = payload["sites"][0]
    assert site_a["site_index"] == 0 and site_a["label"] == "A"
    for body, state in (("sun", "VISIBLE"), ("earth", "NOT_VISIBLE")):
        track = site_a[body]["geometric"]
        assert site_a[body]["terrain"] is None
        assert track["status"] == "NO_EVENT_IN_WINDOW"
        assert track["current"]["state"] == state
        assert track["next_change"] is None and track["next_confirmed_event"] is None
        assert track["transitions"] == []
        assert track["sample_count"] == 5  # includes the inclusive STOP sample
        assert track["no_change_through_utc"].startswith("2026-12-02T00:00:00")
    assert site_a["earth"]["geometric"]["current"]["not_visible_reason"] == "BELOW_GEOMETRIC_HORIZON"


def test_events_endpoint_brackets_and_reference_parameter(client: TestClient) -> None:
    analysis_id = _create(client, FakeHorizons(), time_step_minutes=60)
    base = f"/api/v1/analyses/{analysis_id}/events"
    r = client.get(base, params={"reference_utc": "2026-12-01T00:30:00Z"})
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["reference_mode"] == "REQUESTED"
    # FakeHorizons (synthetic double): site A Earth alternates +3° / −3° every sample.
    earth = payload["sites"][0]["earth"]["geometric"]
    assert earth["status"] == "EVENT_CONFIRMED"
    event = earth["next_confirmed_event"]
    assert event["kind"] == "SET" and event["confirmed"] is True
    assert event["bracket_start_utc"].startswith("2026-12-01T00:00:00")
    assert event["bracket_end_utc"].startswith("2026-12-01T01:00:00")
    assert event["bracket_minutes"] == 60
    assert event["countdown"] == {"earliest_minutes": 0, "latest_minutes": 30, "may_have_occurred": True}
    assert len(earth["transitions"]) == 24
    assert all(t["countdown"] is None for t in earth["transitions"])
    # Site A Sun stays at +8°: nothing to report, and nothing invented.
    assert payload["sites"][0]["sun"]["geometric"]["status"] == "NO_EVENT_IN_WINDOW"

    assert client.get(base, params={"reference_utc": "2027-01-01T00:00:00Z"}).status_code == 422
    out = client.get(base, params={"reference_utc": "2026-12-01T00:30:00"})
    assert out.status_code == 422 and out.json()["error"]["code"] == "REFERENCE_OUT_OF_WINDOW"
    last = client.get(base, params={"reference_utc": "2026-12-02T00:00:00Z"}).json()
    assert last["sites"][0]["earth"]["geometric"]["status"] == "NO_EVENT_IN_WINDOW"


def test_events_endpoint_unknown_analysis_is_404(client: TestClient) -> None:
    r = client.get("/api/v1/analyses/does-not-exist/events")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_events_route_is_advertised_in_openapi(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/analyses/{analysis_id}/events" in paths


def test_events_endpoint_with_real_lola_terrain(client: TestClient) -> None:
    """Real LOLA 5 m horizon + synthetic ephemeris double: three-valued logic is preserved."""
    if len(terrain_data_service.list_dem_tiles()) < 2:
        pytest.skip("Local LOLA Site01/Site04 GeoTIFFs not present under data/raw/lola/")
    analysis_id = _create(client, FakeHorizons(), horizon_model="TERRAIN", time_step_minutes=60)
    r = client.get(f"/api/v1/analyses/{analysis_id}/events")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["horizon_model"] == "TERRAIN"
    assert payload["terrain_engine_version"]
    epochs = client.get(f"/api/v1/analyses/{analysis_id}/epochs").json()
    for site, site_epochs in zip(payload["sites"], epochs["sites"], strict=True):
        for body in ("sun", "earth"):
            terrain, geometric = site[body]["terrain"], site[body]["geometric"]
            assert terrain is not None and terrain["horizon"] == "TERRAIN"
            assert geometric["horizon"] == "GEOMETRIC"
            raw = [s[f"{body}_state"] for s in site_epochs["samples"]]
            assert terrain["unknown_sample_count"] == raw.count("UNKNOWN")
            expected_confirmed = sum(
                1 for a, b in zip(raw, raw[1:], strict=False) if a != b and "UNKNOWN" not in (a, b)
            )
            assert sum(1 for t in terrain["transitions"] if t["confirmed"]) == expected_confirmed
            for t in terrain["transitions"]:
                if t["confirmed"]:
                    assert "UNKNOWN" not in (t["from_state"], t["to_state"])
                    assert t["bracket_minutes"] == 60
            for t in geometric["transitions"]:
                assert t["after"]["not_visible_reason"] != "TERRAIN_OCCULTED"
                assert t["before"]["not_visible_reason"] != "TERRAIN_OCCULTED"
