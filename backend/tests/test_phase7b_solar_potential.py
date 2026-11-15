"""Phase 7B — relative solar potential.

Every Sun series built in this file is a SYNTHETIC mathematical fixture that
exercises the geometry and the three-valued bookkeeping. They are NOT NASA
observations. The two ``horizons_*_shackleton_a`` fixtures used in the API
tests are real JPL Horizons responses and are labelled as such.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.schemas.epochs import EpochSample, EpochsResponse, SiteEpochs
from app.schemas.solar import SolarPotentialResponse
from app.science import solar_potential as sp
from app.science.lunar_sphere import unit_normal
from app.services import solar_service, terrain_data_service
from tests.test_analysis_service import FakeHorizons, _ephem, _samples_from_fixture

T0 = datetime(2026, 12, 1, tzinfo=UTC)
RHO = sp.SUN_NOMINAL_ANGULAR_RADIUS_DEG

HORIZONTAL = sp.PanelSpec(sp.PanelKind.HORIZONTAL)
DUAL = sp.PanelSpec(sp.PanelKind.DUAL_AXIS)


def fixed(tilt: float, azimuth: float) -> sp.PanelSpec:
    return sp.PanelSpec(sp.PanelKind.FIXED, tilt, azimuth)


def tracking(tilt: float) -> sp.PanelSpec:
    return sp.PanelSpec(sp.PanelKind.AZIMUTH_TRACKING, tilt)


def cos1(panel: sp.PanelSpec, az: float, el: float) -> float:
    return float(sp.incidence_cosine(panel, np.array([az]), np.array([el]))[0])


# ------------------------------------------------------------ incidence geometry


def test_disc_fraction_limits_and_symmetry() -> None:
    assert sp.disc_fraction(-RHO) == pytest.approx(0.0)
    assert sp.disc_fraction(0.0) == pytest.approx(0.5)
    assert sp.disc_fraction(RHO) == pytest.approx(1.0)
    assert sp.disc_fraction(-5.0) == 0.0 and sp.disc_fraction(5.0) == 1.0
    for m in (0.01, 0.1, 0.2):
        assert sp.disc_fraction(m) + sp.disc_fraction(-m) == pytest.approx(1.0)
    values = sp.disc_fraction(np.linspace(-0.4, 0.4, 81))
    assert np.all(np.diff(values) >= 0)
    # Independent check: area of a circular segment by numerical integration.
    x = 0.37
    ys = np.linspace(-1.0, x, 200_001)
    widths = 2.0 * np.sqrt(1.0 - ys**2)
    area = float(((widths[1:] + widths[:-1]) / 2.0 * np.diff(ys)).sum()) / math.pi
    assert sp.disc_fraction(x * RHO) == pytest.approx(area, abs=1e-6)


def test_incidence_identities_for_each_panel() -> None:
    assert cos1(HORIZONTAL, 123.0, 30.0) == pytest.approx(0.5)
    assert cos1(HORIZONTAL, 0.0, -5.0) == 0.0  # Sun behind the panel → clamped
    assert cos1(DUAL, 10.0, 1.5) == 1.0
    assert cos1(tracking(90.0), 77.0, 1.5) == pytest.approx(math.cos(math.radians(1.5)))
    assert cos1(tracking(0.0), 77.0, 20.0) == pytest.approx(cos1(HORIZONTAL, 77.0, 20.0))
    assert cos1(tracking(60.0), 5.0, 30.0) == pytest.approx(1.0)  # tilt = 90° − elevation
    assert cos1(fixed(0.0, 200.0), 10.0, 25.0) == pytest.approx(cos1(HORIZONTAL, 10.0, 25.0))
    assert cos1(fixed(90.0, 45.0), 45.0, 0.0) == pytest.approx(1.0)
    assert cos1(fixed(90.0, 45.0), 135.0, 0.0) == pytest.approx(0.0, abs=1e-12)
    assert cos1(fixed(90.0, 45.0), 225.0, 0.0) == 0.0  # back of the panel


def test_azimuth_is_clockwise_from_north_east_is_90() -> None:
    """East/west discriminator: a mirrored (counter-clockwise) convention fails this."""
    sun_east = (90.0, 0.0)
    assert cos1(fixed(90.0, 90.0), *sun_east) == pytest.approx(1.0)
    assert cos1(fixed(90.0, 270.0), *sun_east) == 0.0
    assert cos1(fixed(90.0, 0.0), *sun_east) == pytest.approx(0.0, abs=1e-12)
    # Wrap-around: 350° and 10° are 20° apart.
    assert cos1(fixed(90.0, 350.0), 10.0, 0.0) == pytest.approx(math.cos(math.radians(20.0)))


def _enu(lon_deg: float, lat_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Local east / north / up in the MOON_ME frame, built from the project's own sphere."""
    up_point = unit_normal(lon_deg, lat_deg)
    up = np.array([up_point.x_m, up_point.y_m, up_point.z_m])
    lon, lat = math.radians(lon_deg), math.radians(lat_deg)
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    assert np.allclose(np.cross(east, north), up, atol=1e-12)  # right-handed E, N, U
    return east, north, up


@pytest.mark.parametrize(
    ("lat", "lon"),
    [(-89.99, -166.0), (-89.44, -141.8), (-85.0, 31.0), (89.9, 100.0), (12.0, -45.0)],
)
def test_incidence_matches_independent_3d_dot_product(lat: float, lon: float) -> None:
    """cos θ from (azimuth, elevation) equals n·s computed in body-fixed Cartesian axes.

    SYNTHETIC Sun directions: fixed body-frame unit vectors near the lunar equatorial
    plane, as the real Sun is. Includes a site 0.01° from the pole.
    """
    east, north, up = _enu(lon, lat)
    rng = np.random.default_rng(7)
    checked = 0
    for _ in range(200):
        sun_lon = rng.uniform(0.0, 2.0 * math.pi)
        sun_lat = math.radians(rng.uniform(-1.6, 1.6))
        s = np.array(
            [math.cos(sun_lat) * math.cos(sun_lon), math.cos(sun_lat) * math.sin(sun_lon), math.sin(sun_lat)]
        )
        el = math.degrees(math.asin(float(s @ up)))
        az = math.degrees(math.atan2(float(s @ east), float(s @ north))) % 360.0
        tilt = float(rng.uniform(0.0, 90.0))
        a0 = float(rng.uniform(0.0, 360.0))
        normal = math.sin(math.radians(tilt)) * (
            math.cos(math.radians(a0)) * north + math.sin(math.radians(a0)) * east
        ) + math.cos(math.radians(tilt)) * up
        assert cos1(fixed(tilt, a0), az, el) == pytest.approx(max(0.0, float(normal @ s)), abs=1e-9)
        tracked = math.sin(math.radians(tilt)) * (
            math.cos(math.radians(az)) * north + math.sin(math.radians(az)) * east
        ) + math.cos(math.radians(tilt)) * up
        assert cos1(tracking(tilt), az, el) == pytest.approx(max(0.0, float(tracked @ s)), abs=1e-9)
        assert cos1(HORIZONTAL, az, el) == pytest.approx(max(0.0, float(up @ s)), abs=1e-9)
        checked += 1
    assert checked == 200


def test_near_pole_sun_circles_the_horizon() -> None:
    """SYNTHETIC polar day: Sun at +1.5° sweeping all azimuths once (uniform in time)."""
    az = np.arange(0.0, 360.0, 1.0)
    el = np.full(az.shape, 1.5)
    hours = np.ones(az.shape)
    factor = sp.geometric_sun_factor(el)

    def index(panel: sp.PanelSpec) -> float:
        out = sp.integrate_index(factor, sp.incidence_cosine(panel, az, el), hours)
        assert out.status is sp.IndexStatus.DETERMINED and out.value is not None
        return out.value

    assert index(DUAL) == pytest.approx(1.0)
    assert index(tracking(90.0)) == pytest.approx(math.cos(math.radians(1.5)))
    assert index(HORIZONTAL) == pytest.approx(math.sin(math.radians(1.5)))  # ≈ 2.6 %
    # A fixed vertical panel sees the Sun for half the turn: mean of max(0, cos) = 1/π.
    for a0 in (0.0, 123.0, 359.0):
        assert index(fixed(90.0, a0)) == pytest.approx(math.cos(math.radians(1.5)) / math.pi, rel=1e-3)


def test_ordering_identities_that_actually_hold() -> None:
    """Dual-axis ≥ everything; tracking ≥ fixed only at the SAME tilt. SYNTHETIC series."""
    rng = np.random.default_rng(11)
    az = rng.uniform(0.0, 360.0, 500)
    el = rng.uniform(-3.0, 8.0, 500)
    hours = rng.uniform(0.1, 2.0, 500)
    factor = sp.geometric_sun_factor(el)

    def index(panel: sp.PanelSpec) -> float:
        return sp.integrate_index(factor, sp.incidence_cosine(panel, az, el), hours).lower  # type: ignore[return-value]

    dual = index(DUAL)
    for tilt in (0.0, 30.0, 60.0, 90.0):
        track = index(tracking(tilt))
        assert dual >= track - 1e-12
        for a0 in (0.0, 90.0, 222.0):
            assert track >= index(fixed(tilt, a0)) - 1e-12
    assert dual >= index(HORIZONTAL) >= 0.0
    # Not an identity: horizontal can beat a vertical tracker (Sun high) …
    high = sp.incidence_cosine(HORIZONTAL, np.array([0.0]), np.array([80.0]))[0]
    assert high > sp.incidence_cosine(tracking(90.0), np.array([0.0]), np.array([80.0]))[0]


def test_invalid_panel_configuration_is_rejected() -> None:
    for kwargs in (
        {"kind": sp.PanelKind.FIXED, "tilt_deg": 91.0, "azimuth_deg": 0.0},
        {"kind": sp.PanelKind.FIXED, "tilt_deg": -1.0, "azimuth_deg": 0.0},
        {"kind": sp.PanelKind.FIXED, "tilt_deg": 45.0, "azimuth_deg": 360.0},
        {"kind": sp.PanelKind.FIXED, "tilt_deg": 45.0, "azimuth_deg": -0.1},
        {"kind": sp.PanelKind.FIXED, "tilt_deg": float("nan"), "azimuth_deg": 0.0},
        {"kind": sp.PanelKind.FIXED, "tilt_deg": 45.0, "azimuth_deg": float("inf")},
        {"kind": sp.PanelKind.FIXED, "tilt_deg": 45.0},
        {"kind": sp.PanelKind.AZIMUTH_TRACKING},
        {"kind": sp.PanelKind.AZIMUTH_TRACKING, "tilt_deg": 45.0, "azimuth_deg": 10.0},
        {"kind": sp.PanelKind.HORIZONTAL, "tilt_deg": 10.0},
        {"kind": sp.PanelKind.DUAL_AXIS, "azimuth_deg": 10.0},
    ):
        with pytest.raises(sp.PanelConfigurationError):
            sp.PanelSpec(**kwargs)  # type: ignore[arg-type]
    with pytest.raises(solar_service.SolarConfigurationError):
        solar_service.parse_options(panel="triple_axis")
    with pytest.raises(solar_service.SolarConfigurationError):
        solar_service.parse_options(panel="horizontal", azimuth_deg=10.0)
    with pytest.raises(solar_service.SolarConfigurationError):
        solar_service.parse_options(panel="dual_axis", tracking_tilt_deg=10.0)
    with pytest.raises(solar_service.SolarConfigurationError):
        solar_service.parse_options(tilt_deg=120.0)
    assert solar_service.parse_options(panel="Fixed", azimuth_deg=0.0).panels == (sp.PanelKind.FIXED,)


# ---------------------------------------------------------- three-valued factor


def test_terrain_factor_bounds_per_state() -> None:
    el = np.array([2.0, 0.1, 0.5, -0.1, 2.0, 2.0, np.nan, 0.5])
    hz = np.array([0.5, 0.0, 3.0, 0.0, 0.5, np.nan, np.nan, 1.0])
    states = [
        sp.SunState.VISIBLE,  # clear of terrain, complete coverage → known, full disc
        sp.SunState.VISIBLE,  # 0.1° above the horizon → known partial disc
        sp.SunState.BLOCKED,  # far below a known obstacle → known zero
        sp.SunState.BLOCKED,  # centre just below: upper limb may show → edge
        sp.SunState.UNKNOWN,  # clear of known terrain, ray truncated
        sp.SunState.UNKNOWN,  # no DEM value at all
        sp.SunState.UNKNOWN,  # ephemeris gap
        sp.SunState.UNKNOWN,  # known obstacle already covers the disc
    ]
    f = sp.terrain_sun_factor(el, hz, states)
    partial = float(sp.disc_fraction(0.1))
    sliver = float(sp.disc_fraction(-0.1))
    assert f.lower.tolist() == pytest.approx([1.0, partial, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    assert f.upper.tolist() == pytest.approx([1.0, partial, 0.0, sliver, 1.0, 1.0, 1.0, 0.0])
    assert 0.0 < sliver < 0.5 < partial < 1.0
    assert f.state_unknown.tolist() == [False, False, False, False, True, True, True, True]
    assert f.edge_uncertain.tolist() == [False, False, False, True, False, False, False, False]
    assert f.ephemeris_missing.tolist() == [False] * 6 + [True, False]
    assert np.all(f.lower <= f.upper)


def test_unknown_upper_bound_uses_known_horizon_not_the_sphere() -> None:
    """Known terrain already hides part of the disc: the upper bound must respect it."""
    el, hz = np.array([1.0]), np.array([0.9])
    f = sp.terrain_sun_factor(el, hz, [sp.SunState.UNKNOWN])
    assert f.upper[0] == pytest.approx(float(sp.disc_fraction(0.1)))
    assert f.upper[0] < sp.geometric_sun_factor(el).upper[0] == 1.0


def test_partial_unknown_gives_ordered_bounds_and_no_point_value() -> None:
    """SYNTHETIC: 4 h visible, 3 h unknown, 3 h blocked; Sun at 2° over a 0.5° horizon."""
    n = 10
    el, hz = np.full(n, 2.0), np.full(n, 0.5)
    states = [sp.SunState.VISIBLE] * 4 + [sp.SunState.UNKNOWN] * 3 + [sp.SunState.BLOCKED] * 3
    hz[7:] = 5.0
    factor = sp.terrain_sun_factor(el, hz, states)
    out = sp.integrate_index(factor, sp.incidence_cosine(DUAL, np.zeros(n), el), np.ones(n))
    assert out.status is sp.IndexStatus.RANGE
    assert out.value is None  # never a midpoint
    assert out.lower == pytest.approx(0.4) and out.upper == pytest.approx(0.7)
    assert out.unknown_hours == 3.0 and out.known_hours == 7.0
    assert out.unknown_fraction == pytest.approx(0.3)
    # UNKNOWN is neither visible nor blocked: both extreme coercions differ from the bounds' roles.
    as_visible = sp.integrate_index(
        sp.terrain_sun_factor(el, hz, [sp.SunState.VISIBLE] * 7 + [sp.SunState.BLOCKED] * 3),
        np.ones(n), np.ones(n),
    )
    as_blocked = sp.integrate_index(
        sp.terrain_sun_factor(el, np.where(np.arange(n) >= 4, 5.0, 0.5),
                              [sp.SunState.VISIBLE] * 4 + [sp.SunState.BLOCKED] * 6),
        np.ones(n), np.ones(n),
    )
    assert as_blocked.value == pytest.approx(out.lower) and as_visible.value == pytest.approx(out.upper)
    assert as_blocked.status is as_visible.status is sp.IndexStatus.DETERMINED


def test_all_unknown_is_unavailable_not_an_invented_value() -> None:
    n = 6
    el = np.full(n, 3.0)
    terrain = sp.terrain_sun_factor(el, np.full(n, np.nan), [sp.SunState.UNKNOWN] * n)
    out = sp.integrate_index(terrain, np.ones(n), np.ones(n))
    assert out.status is sp.IndexStatus.UNAVAILABLE
    assert (out.lower, out.upper, out.value) == (None, None, None)
    assert out.unavailable_reason == "NO_KNOWN_VISIBILITY" and out.unknown_fraction == 1.0

    gap = sp.geometric_sun_factor(np.full(n, np.nan))
    out = sp.integrate_index(gap, np.full(n, np.nan), np.ones(n))
    assert out.status is sp.IndexStatus.UNAVAILABLE and out.unavailable_reason == "NO_EPHEMERIS"

    empty = sp.integrate_index(sp.geometric_sun_factor(el), np.ones(n), np.zeros(n))
    assert empty.status is sp.IndexStatus.UNAVAILABLE and empty.unavailable_reason == "NO_DURATION"


def test_missing_ephemeris_is_bounded_zero_to_one() -> None:
    el = np.array([5.0, np.nan, 5.0, 5.0])
    az = np.array([0.0, np.nan, 0.0, 0.0])
    out = sp.integrate_index(
        sp.geometric_sun_factor(el), sp.incidence_cosine(HORIZONTAL, az, el), np.ones(4)
    )
    s = math.sin(math.radians(5.0))
    assert out.status is sp.IndexStatus.RANGE and out.value is None
    assert out.lower == pytest.approx(0.75 * s)
    assert out.upper == pytest.approx(0.75 * s + 0.25)  # the gap could be anything up to 1
    assert out.unknown_hours == 1.0


# ------------------------------------------------------------ temporal weighting


def test_temporal_weighting_uses_hold_hours_not_sample_counts() -> None:
    """SYNTHETIC irregular spacing: one 9 h sample outweighs nine 10-minute samples."""
    el = np.array([10.0] + [-10.0] * 9)
    hours = np.array([9.0] + [1.0 / 6.0] * 9)
    out = sp.integrate_index(sp.geometric_sun_factor(el), np.ones(10), hours)
    assert out.value == pytest.approx(9.0 / 10.5)  # by samples it would be 0.1
    assert out.window_hours == pytest.approx(10.5)

    states = [sp.SunState.UNKNOWN] + [sp.SunState.BLOCKED] * 9
    ter = sp.integrate_index(
        sp.terrain_sun_factor(np.full(10, 1.0), np.full(10, 4.0), states), np.ones(10), hours
    )
    assert ter.unknown_fraction == pytest.approx(9.0 / 10.5)  # not 1/10


def test_zero_hold_stop_sample_adds_nothing() -> None:
    el = np.array([4.0, 4.0, 4.0])
    base = sp.integrate_index(sp.geometric_sun_factor(el[:2]), np.array([0.5, 0.5]), np.array([1.0, 1.0]))
    with_stop = sp.integrate_index(
        sp.geometric_sun_factor(el), np.array([0.5, 0.5, 1.0]), np.array([1.0, 1.0, 0.0])
    )
    assert with_stop.value == pytest.approx(base.value) == pytest.approx(0.5)
    # An UNKNOWN stop sample must not create a range either.
    unknown_stop = sp.integrate_index(
        sp.terrain_sun_factor(el, np.zeros(3), [sp.SunState.VISIBLE] * 2 + [sp.SunState.UNKNOWN]),
        np.ones(3), np.array([1.0, 1.0, 0.0]),
    )
    assert unknown_stop.status is sp.IndexStatus.DETERMINED and unknown_stop.unknown_hours == 0.0
    with pytest.raises(ValueError):
        sp.integrate_index(sp.geometric_sun_factor(el), np.ones(3), np.array([1.0, -1.0, 1.0]))


def test_fixed_azimuth_optimisation_is_weighted_and_deterministic() -> None:
    """SYNTHETIC: Sun spends 9 h at azimuth 200° and 1 h at 20°."""
    az = np.array([200.0, 20.0])
    el = np.array([1.0, 1.0])
    assert sp.optimise_fixed_azimuth(az, el, np.array([9.0, 1.0]), 90.0) == 200.0
    assert sp.optimise_fixed_azimuth(az, el, np.array([1.0, 9.0]), 90.0) == 20.0
    assert sp.optimise_fixed_azimuth(az, np.array([-5.0, -5.0]), np.ones(2), 90.0) is None
    assert sp.optimise_fixed_azimuth(az, np.array([np.nan, np.nan]), np.ones(2), 90.0) is None
    best = sp.optimise_fixed_azimuth(az, el, np.array([9.0, 1.0]), 90.0)
    factor = sp.geometric_sun_factor(el)

    def index(a0: float) -> float:
        return sp.integrate_index(  # type: ignore[return-value]
            factor, sp.incidence_cosine(fixed(90.0, a0), az, el), np.array([9.0, 1.0])
        ).lower

    assert all(index(best) >= index(a) - 1e-12 for a in np.arange(0.0, 360.0, 1.0))  # type: ignore[arg-type]


def test_compare_bounds_only_ranks_disjoint_ranges() -> None:
    assert sp.compare_bounds([(0.5, 0.6), (0.1, 0.4)]) == 0
    assert sp.compare_bounds([(0.1, 0.4), (0.5, 0.6), (0.0, 0.45)]) == 1
    assert sp.compare_bounds([(0.3, 0.6), (0.1, 0.4)]) is None  # overlap
    assert sp.compare_bounds([(0.4, 0.4), (0.4, 0.4)]) is None  # tie
    assert sp.compare_bounds([(0.5, 0.6), None]) is None
    assert sp.compare_bounds([(0.5, 0.6)]) is None
    assert sp.compare_bounds([(0.337, 0.337), (0.335, 0.335)]) == 0
    assert (
        sp.compare_bounds(
            [(0.337, 0.337), (0.335, 0.335)],
            minimum_gap=0.005,
        )
        is None
    )
    assert (
        sp.compare_bounds(
            [(0.345, 0.345), (0.335, 0.335)],
            minimum_gap=0.005,
        )
        == 0
    )
    with pytest.raises(ValueError):
        sp.compare_bounds([(0.1, 0.2), (0.3, 0.4)], minimum_gap=-1.0)


# ------------------------------------------------- service on the /epochs shape


def _site(
    label: str,
    rows: list[tuple[float | None, float | None, str, float | None]],
    *,
    lat: float = -89.0,
    lon: float = 0.0,
    hold: list[float] | None = None,
) -> SiteEpochs:
    """SYNTHETIC site. Row = (sun_azimuth, sun_elevation, terrain state, terrain horizon)."""
    samples = []
    for i, (az, el, state, horizon) in enumerate(rows):
        geo = "UNKNOWN" if el is None else ("VISIBLE" if el > 0 else "BLOCKED")
        hours = 1.0 if hold is None else hold[i]
        samples.append(
            EpochSample(
                t=T0 + timedelta(hours=i),
                sun_azimuth_deg=az,
                sun_elevation_deg=el,
                earth_azimuth_deg=170.0,
                earth_elevation_deg=-2.0,
                sun_state=state,  # type: ignore[arg-type]
                earth_state="BLOCKED",
                joint_state="UNKNOWN",
                sun_terrain_horizon_deg=horizon,
                earth_terrain_horizon_deg=None,
                sun_geometric_state=geo,  # type: ignore[arg-type]
                earth_geometric_state="BLOCKED",
                hold_hours=hours,
                contributes_duration=hours > 0,
            )
        )
    return SiteEpochs(label=label, latitude_deg=lat, longitude_deg=lon, samples=samples)


def _epochs(horizon_model: str, sites: list[SiteEpochs], quality: str | None = None) -> EpochsResponse:
    """SYNTHETIC EpochsResponse (contract shape of /epochs); not NASA data."""
    n = len(sites[0].samples)
    return EpochsResponse(
        analysis_id="synthetic",
        mission_name="synthetic",
        horizon_model=horizon_model,  # type: ignore[arg-type]
        data_quality=quality  # type: ignore[arg-type]
        or ("LOCAL_TERRAIN_PARTIAL" if horizon_model == "TERRAIN" else "EPHEMERIS_GEOMETRIC"),
        algorithm_version="test",
        start_utc=T0,
        end_utc=T0 + timedelta(hours=n),
        time_step_minutes=60,
        sample_count_per_site=n,
        duration_semantics="[start_utc, end_utc)",
        sites=sites,
        provenance=[],
        limitations=[],
    )


def _config(site, panel: str):  # type: ignore[no-untyped-def]
    return next(c for c in site.configurations if c.panel == panel)


def test_geometric_analysis_reports_four_configurations_and_no_terrain_value() -> None:
    rows = [(float(a), 1.5, "VISIBLE", None) for a in range(0, 360, 10)]
    out = solar_service.solar_from_epochs(_epochs("GEOMETRIC", [_site("A", rows), _site("B", rows, lon=10.0)]))
    assert out.headline_horizon == "GEOMETRIC"
    site = out.sites[0]
    assert [c.panel for c in site.configurations] == ["HORIZONTAL", "FIXED", "AZIMUTH_TRACKING", "DUAL_AXIS"]
    assert site.sun_terrain_visibility is None
    assert all(c.terrain is None and c.geometric is not None for c in site.configurations)
    assert _config(site, "DUAL_AXIS").geometric.index_pct == 100.0
    assert _config(site, "HORIZONTAL").geometric.index_pct == pytest.approx(100 * math.sin(math.radians(1.5)), abs=1e-3)
    assert _config(site, "AZIMUTH_TRACKING").tilt_deg == 90.0
    fixed_cfg = _config(site, "FIXED")
    assert fixed_cfg.azimuth_source == "OPTIMISED_HINDSIGHT_GEOMETRIC" and fixed_cfg.tilt_deg == 90.0
    assert fixed_cfg.geometric.index_pct == pytest.approx(100 * math.cos(math.radians(1.5)) / math.pi, rel=2e-2)
    assert site.sun_above_geometric_horizon.above_horizon_hours == 36.0
    assert site.sun_above_geometric_horizon.above_horizon_fraction_min == 1.0
    assert out.electrical_energy.available is False and out.electrical_energy.missing_inputs
    assert not any(c.horizon == "TERRAIN" for c in out.comparisons)
    assert any("GEOMETRIC analysis" in note for note in out.limitations)


def test_terrain_analysis_separates_the_four_concepts() -> None:
    """SYNTHETIC: Sun geometrically up all 10 h; terrain blocks 3 h, DEM cannot decide 3 h."""
    rows = (
        [(10.0, 2.0, "VISIBLE", 0.5)] * 4
        + [(10.0, 2.0, "UNKNOWN", 0.5)] * 2
        + [(10.0, 2.0, "UNKNOWN", None)]
        + [(10.0, 2.0, "BLOCKED", 5.0)] * 3
    )
    out = solar_service.solar_from_epochs(_epochs("TERRAIN", [_site("A", rows), _site("B", rows, lon=5.0)]))
    assert out.headline_horizon == "TERRAIN" and out.terrain_engine_version
    site = out.sites[0]
    # 1. above the geometric horizon
    assert site.sun_above_geometric_horizon.above_horizon_hours == 10.0
    # 2. visible considering terrain data — a range, with UNKNOWN in neither class
    vis = site.sun_terrain_visibility
    assert (vis.visible_hours, vis.blocked_hours, vis.unknown_hours) == (4.0, 3.0, 3.0)
    assert (vis.visible_fraction_min, vis.visible_fraction_max, vis.unknown_fraction) == (0.4, 0.7, 0.3)
    # 3. incidence on a panel
    dual = _config(site, "DUAL_AXIS")
    assert dual.geometric.status == "DETERMINED" and dual.geometric.index_pct == 100.0
    assert dual.terrain.status == "RANGE" and dual.terrain.index_pct is None
    assert (dual.terrain.index_min_pct, dual.terrain.index_max_pct) == (40.0, 70.0)
    assert dual.terrain.unknown_fraction == 0.3 and dual.terrain.known_hours == 7.0
    horizontal = _config(site, "HORIZONTAL").terrain
    s = 100 * math.sin(math.radians(2.0))
    assert horizontal.index_min_pct == pytest.approx(0.4 * s, abs=1e-3)
    assert horizontal.index_max_pct == pytest.approx(0.7 * s, abs=1e-3)
    for cfg in site.configurations:
        assert cfg.terrain.index_min_pct <= cfg.terrain.index_max_pct
        assert cfg.terrain.index_max_pct <= dual.terrain.index_max_pct + 1e-9
    # 4. electrical energy — explicitly not available
    assert out.electrical_energy.available is False
    notes = " ".join(out.limitations)
    for phrase in ("5° azimuth bins", "Local LOLA coverage", "Temporal sampling", "observer"):
        assert phrase in notes
    assert any("hindsight" in a for a in out.assumptions)


def test_fixed_azimuth_is_chosen_once_and_reused_for_every_bound() -> None:
    rows = [(200.0, 2.0, "UNKNOWN", 0.5)] * 6 + [(20.0, 2.0, "VISIBLE", 0.5)] * 2
    out = solar_service.solar_from_epochs(_epochs("TERRAIN", [_site("A", rows), _site("B", rows, lon=5.0)]))
    cfg = _config(out.sites[0], "FIXED")
    # Optimised on the geometric series (6 h at 200°), not re-optimised for the terrain minimum.
    assert cfg.azimuth_deg == pytest.approx(200.0, abs=20.0) and cfg.azimuth_source == "OPTIMISED_HINDSIGHT_GEOMETRIC"
    spec = fixed(90.0, cfg.azimuth_deg)
    lo = 2 * cos1(spec, 20.0, 2.0) / 8
    hi = lo + 6 * cos1(spec, 200.0, 2.0) / 8
    assert cfg.terrain.index_min_pct == pytest.approx(100 * lo, abs=1e-3)
    assert cfg.terrain.index_max_pct == pytest.approx(100 * hi, abs=1e-3)

    requested = solar_service.solar_from_epochs(
        _epochs("TERRAIN", [_site("A", rows), _site("B", rows, lon=5.0)]),
        solar_service.parse_options(panel="fixed", azimuth_deg=20.0, tilt_deg=90.0),
    )
    only = requested.sites[0].configurations
    assert [c.panel for c in only] == ["FIXED"]
    assert only[0].azimuth_source == "REQUESTED" and only[0].azimuth_deg == 20.0
    assert only[0].terrain.index_min_pct == pytest.approx(100 * 2 * math.cos(math.radians(2.0)) / 8, abs=1e-3)


def test_all_unknown_terrain_site_is_unavailable_but_geometric_context_remains() -> None:
    rows = [(10.0, 2.0, "UNKNOWN", None)] * 5
    known = [(10.0, 2.0, "VISIBLE", 0.1)] * 5
    out = solar_service.solar_from_epochs(_epochs("TERRAIN", [_site("A", rows), _site("B", known, lon=5.0)]))
    for cfg in out.sites[0].configurations:
        assert cfg.terrain.status == "UNAVAILABLE" and cfg.terrain.unavailable_reason == "NO_KNOWN_VISIBILITY"
        assert cfg.terrain.index_pct is cfg.terrain.index_min_pct is cfg.terrain.index_max_pct is None
        assert cfg.terrain.unknown_fraction == 1.0
        assert cfg.geometric.status == "DETERMINED"
    assert out.sites[0].sun_terrain_visibility.unknown_fraction == 1.0
    terrain_cmp = [c for c in out.comparisons if c.horizon == "TERRAIN"]
    assert terrain_cmp and all(c.status == "UNAVAILABLE" and c.leading_site_index is None for c in terrain_cmp)


def test_site_comparison_needs_disjoint_ranges() -> None:
    strong = [(10.0, 3.0, "VISIBLE", 0.1)] * 9 + [(10.0, 3.0, "UNKNOWN", 0.1)]
    weak = [(10.0, 3.0, "VISIBLE", 0.1)] * 2 + [(10.0, 3.0, "BLOCKED", 6.0)] * 7 + [(10.0, 3.0, "UNKNOWN", 0.1)]
    murky = [(10.0, 3.0, "VISIBLE", 0.1)] * 2 + [(10.0, 3.0, "UNKNOWN", 0.1)] * 8

    out = solar_service.solar_from_epochs(_epochs("TERRAIN", [_site("weak", weak), _site("strong", strong, lon=5.0)]))
    dual = next(c for c in out.comparisons if c.panel == "DUAL_AXIS" and c.horizon == "TERRAIN")
    assert dual.status == "DISTINGUISHABLE" and dual.leading_site_index == 1  # 90–100 % vs 20–30 %

    out = solar_service.solar_from_epochs(_epochs("TERRAIN", [_site("murky", murky), _site("strong", strong, lon=5.0)]))
    dual = next(c for c in out.comparisons if c.panel == "DUAL_AXIS" and c.horizon == "TERRAIN")
    assert dual.status == "NOT_DISTINGUISHABLE" and dual.leading_site_index is None  # 20–100 % vs 90–100 %
    # Geometrically identical sites tie: still no leader.
    geo = next(c for c in out.comparisons if c.panel == "DUAL_AXIS" and c.horizon == "GEOMETRIC")
    assert geo.status == "NOT_DISTINGUISHABLE"

    # A sub-resolution lead must not become a user-facing recommendation.
    close_a = [(10.0, 3.0, "VISIBLE", None)] * 1000
    close_b = (
        [(10.0, 3.0, "VISIBLE", None)] * 997
        + [(10.0, -3.0, "BLOCKED", None)] * 3
    )
    out = solar_service.solar_from_epochs(
        _epochs(
            "GEOMETRIC",
            [_site("a", close_a), _site("b", close_b, lon=5.0)],
        )
    )
    dual = next(c for c in out.comparisons if c.panel == "DUAL_AXIS")
    assert dual.status == "NOT_DISTINGUISHABLE"  # 100 % vs 99.7 %
    assert any("0.5 percentage points" in note for note in out.limitations)


def test_fixed_panel_is_unavailable_exactly_at_the_pole() -> None:
    rows = [(float(a), 1.0, "VISIBLE", None) for a in range(0, 360, 30)]
    out = solar_service.solar_from_epochs(
        _epochs("GEOMETRIC", [_site("pole", rows, lat=-90.0), _site("near", rows, lat=-89.99)])
    )
    pole = _config(out.sites[0], "FIXED")
    assert pole.available is False and pole.unavailable_reason == "AZIMUTH_UNDEFINED_AT_POLE"
    assert pole.geometric is None and pole.azimuth_deg is None
    assert _config(out.sites[0], "AZIMUTH_TRACKING").geometric.status == "DETERMINED"
    assert _config(out.sites[1], "FIXED").available is True
    fixed_cmp = next(c for c in out.comparisons if c.panel == "FIXED")
    assert fixed_cmp.status == "UNAVAILABLE"


def test_fixed_panel_without_any_sunlit_sample_has_no_invented_azimuth() -> None:
    rows = [(10.0, -4.0, "BLOCKED", None)] * 4
    out = solar_service.solar_from_epochs(_epochs("GEOMETRIC", [_site("A", rows), _site("B", rows, lon=5.0)]))
    cfg = _config(out.sites[0], "FIXED")
    assert cfg.available is False and cfg.unavailable_reason == "NO_SUNLIT_SAMPLE_TO_OPTIMISE_AZIMUTH"
    assert _config(out.sites[0], "DUAL_AXIS").geometric.index_pct == 0.0


def test_synthetic_demo_source_is_refused() -> None:
    rows = [(10.0, 2.0, "VISIBLE", None)] * 3
    with pytest.raises(solar_service.SolarSourceError):
        solar_service.solar_from_epochs(
            _epochs("GEOMETRIC", [_site("A", rows), _site("B", rows, lon=5.0)], quality="SYNTHETIC_DEMO")
        )


def _field_names(model: type[BaseModel], seen: set[type] | None = None) -> set[str]:
    seen = seen if seen is not None else set()
    if model in seen:
        return set()
    seen.add(model)
    names = set(model.model_fields)
    for field in model.model_fields.values():
        stack = [field.annotation]
        while stack:
            ann = stack.pop()
            if isinstance(ann, type) and issubclass(ann, BaseModel):
                names |= _field_names(ann, seen)
            stack.extend(getattr(ann, "__args__", ()))
    return names


def test_contract_carries_no_electrical_quantity() -> None:
    """Relative geometry only: no watts / kWh / power / irradiance field may appear."""
    names = _field_names(SolarPotentialResponse)
    assert {"index_min_pct", "index_max_pct", "unknown_fraction", "electrical_energy"} <= names
    banned = ("watt", "kwh", "wh", "power", "irradiance", "joule", "energy")
    offenders = {n for n in names if any(b in n.lower() for b in banned)} - {"electrical_energy"}
    assert offenders == set()


# ----------------------------------------------------------------- API (stored)

_BODY = {
    "mission_name": "Solar Study",
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
ROUTE = "/api/v1/analyses/{id}/solar-potential"


def _create(client: TestClient, fake: FakeHorizons, **overrides: object) -> str:
    from app.api.deps import horizons_client

    client.app.dependency_overrides[horizons_client] = lambda: fake  # type: ignore[attr-defined]
    created = client.post("/api/v1/analyses", json={**_BODY, **overrides})
    assert created.status_code == 200, created.text
    return created.json()["id"]


def test_endpoint_on_real_horizons_fixture(client: TestClient) -> None:
    """Real JPL Horizons fixture (Shackleton rim A, 2026-12-01): Sun ≈ 1.6° up all day."""
    sun = _samples_from_fixture("horizons_sun_shackleton_a_2026-12-01.json")
    earth = _samples_from_fixture("horizons_earth_shackleton_a_2026-12-01.json")
    fake = FakeHorizons(
        {
            ("SUN", -89.68, -166.0): _ephem("SUN", sun, -89.68, -166.0),
            ("EARTH", -89.68, -166.0): _ephem("EARTH", earth, -89.68, -166.0),
        }
    )
    analysis_id = _create(client, fake)
    r = client.get(ROUTE.format(id=analysis_id))
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["solar_contract_version"] == solar_service.SOLAR_CONTRACT_VERSION
    assert payload["horizon_model"] == payload["headline_horizon"] == "GEOMETRIC"
    assert payload["electrical_energy"]["available"] is False
    assert {p["source_id"] for p in payload["provenance"]} >= {"jpl-horizons", "selenora-solar-potential"}
    site = payload["sites"][0]
    assert site["label"] == "A" and site["window_hours"] == 24.0 and site["sample_count"] == 5
    by_panel = {c["panel"]: c for c in site["configurations"]}
    elevations = [s.elevation_deg for s in sun[:4]]  # the STOP sample has zero weight
    assert all(e > 0.5 for e in elevations)  # full disc above the sphere all day
    assert by_panel["DUAL_AXIS"]["geometric"]["index_pct"] == 100.0
    expected_h = 100 * float(np.mean(np.sin(np.radians(elevations))))
    expected_t = 100 * float(np.mean(np.cos(np.radians(elevations))))
    assert by_panel["HORIZONTAL"]["geometric"]["index_pct"] == pytest.approx(expected_h, abs=1e-3)
    assert by_panel["AZIMUTH_TRACKING"]["geometric"]["index_pct"] == pytest.approx(expected_t, abs=1e-3)
    fixed_cfg = by_panel["FIXED"]
    assert fixed_cfg["azimuth_source"] == "OPTIMISED_HINDSIGHT_GEOMETRIC"
    assert 0 < fixed_cfg["geometric"]["index_pct"] <= by_panel["AZIMUTH_TRACKING"]["geometric"]["index_pct"]
    for cfg in by_panel.values():
        assert cfg["terrain"] is None and cfg["geometric"]["status"] == "DETERMINED"
        assert cfg["geometric"]["unknown_fraction"] == 0.0


def test_endpoint_parameters_and_errors(client: TestClient) -> None:
    analysis_id = _create(client, FakeHorizons(), time_step_minutes=60)
    route = ROUTE.format(id=analysis_id)
    r = client.get(route, params={"panel": "fixed", "azimuth_deg": 90, "tilt_deg": 45})
    assert r.status_code == 200, r.text
    cfgs = r.json()["sites"][0]["configurations"]
    assert [c["panel"] for c in cfgs] == ["FIXED"]
    assert (cfgs[0]["azimuth_deg"], cfgs[0]["tilt_deg"], cfgs[0]["azimuth_source"]) == (90.0, 45.0, "REQUESTED")
    r = client.get(route, params={"tracking_tilt_deg": 30})
    tracker = next(c for c in r.json()["sites"][0]["configurations"] if c["panel"] == "AZIMUTH_TRACKING")
    # FakeHorizons (synthetic double): site A Sun fixed at +8°.
    assert tracker["tilt_deg"] == 30.0
    assert tracker["geometric"]["index_pct"] == pytest.approx(100 * math.sin(math.radians(38.0)), abs=1e-3)

    for params in (
        {"panel": "sideways"},
        {"tilt_deg": 91},
        {"tilt_deg": -5},
        {"azimuth_deg": 360},
        {"azimuth_deg": -1},
        {"tracking_tilt_deg": 200},
        {"panel": "horizontal", "tilt_deg": 10},
        {"panel": "dual_axis", "azimuth_deg": 10},
    ):
        bad = client.get(route, params=params)
        assert bad.status_code == 422, params
        assert bad.json()["error"]["code"] == "INVALID_PANEL_CONFIGURATION"
    not_number = client.get(route, params={"azimuth_deg": "north"})
    assert not_number.status_code == 422 and not_number.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.get(route, params={"azimuth_deg": "nan"}).status_code == 422

    missing = client.get(ROUTE.format(id="does-not-exist"))
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "NOT_FOUND"
    assert "/api/v1/analyses/{analysis_id}/solar-potential" in client.get("/openapi.json").json()["paths"]


def test_endpoint_site_comparison_geometric(client: TestClient) -> None:
    """FakeHorizons (synthetic double): A's Sun is always up, B's is down a third of the time."""
    sites = [_BODY["sites"][0], {"label": "B", "latitude_deg": -88.0, "longitude_deg": -141.8}]  # type: ignore[index]
    analysis_id = _create(client, FakeHorizons(), time_step_minutes=60, sites=sites)
    payload = client.get(ROUTE.format(id=analysis_id)).json()
    dual = next(c for c in payload["comparisons"] if c["panel"] == "DUAL_AXIS")
    assert dual == {"panel": "DUAL_AXIS", "horizon": "GEOMETRIC", "status": "DISTINGUISHABLE", "leading_site_index": 0}
    a, b = (next(c for c in s["configurations"] if c["panel"] == "DUAL_AXIS") for s in payload["sites"])
    assert a["geometric"]["index_pct"] == 100.0
    assert b["geometric"]["index_pct"] == pytest.approx(100 * 16 / 24, abs=1e-3)


def test_endpoint_with_real_lola_terrain(client: TestClient) -> None:
    """Real LOLA 5 m horizon + synthetic ephemeris double: bounds stay consistent with /epochs."""
    if len(terrain_data_service.list_dem_tiles()) < 2:
        pytest.skip("Local LOLA Site01/Site04 GeoTIFFs not present under data/raw/lola/")
    analysis_id = _create(client, FakeHorizons(), horizon_model="TERRAIN", time_step_minutes=60)
    r = client.get(ROUTE.format(id=analysis_id))
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["headline_horizon"] == "TERRAIN" and payload["terrain_engine_version"]
    assert any(p["source_id"] == "lro-lola" for p in payload["provenance"])
    epochs = client.get(f"/api/v1/analyses/{analysis_id}/epochs").json()
    for site, site_epochs in zip(payload["sites"], epochs["sites"], strict=True):
        hours = {"VISIBLE": 0.0, "BLOCKED": 0.0, "UNKNOWN": 0.0}
        for s in site_epochs["samples"]:
            hours[s["sun_state"]] += s["hold_hours"]
        vis = site["sun_terrain_visibility"]
        assert vis["visible_hours"] == pytest.approx(hours["VISIBLE"], abs=1e-3)
        assert vis["blocked_hours"] == pytest.approx(hours["BLOCKED"], abs=1e-3)
        assert vis["unknown_hours"] == pytest.approx(hours["UNKNOWN"], abs=1e-3)
        dual = next(c for c in site["configurations"] if c["panel"] == "DUAL_AXIS")["terrain"]
        if hours["VISIBLE"] + hours["BLOCKED"] == 0:
            assert dual["status"] == "UNAVAILABLE" and dual["index_min_pct"] is None
            continue
        assert dual["status"] in {"DETERMINED", "RANGE"}
        assert dual["index_min_pct"] <= dual["index_max_pct"]
        # Proven contribution can never exceed the VISIBLE share of the window.
        assert dual["index_min_pct"] <= 100 * vis["visible_fraction_min"] + 1e-3
        assert dual["index_max_pct"] <= 100 * vis["visible_fraction_max"] + 100 * site["window_hours"] ** -1 * dual["edge_uncertain_hours"] + 1e-3
        if dual["status"] == "RANGE":
            assert dual["index_pct"] is None
        for cfg in site["configurations"]:
            if cfg["available"] and cfg["terrain"]["status"] != "UNAVAILABLE":
                assert cfg["terrain"]["index_max_pct"] <= dual["index_max_pct"] + 1e-6
