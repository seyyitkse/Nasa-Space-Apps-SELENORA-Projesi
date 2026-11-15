"""Relative solar potential for a stored analysis (Phase 7B).

Read-only over ``epochs_service.load_epochs`` — the same authoritative
per-epoch Sun azimuth/elevation and three-valued states as ``/epochs`` and
``/events``. No new JPL Horizons request, no change to the visibility or
terrain engines, and no use of ``visibility.summarize``, scoring or stored
result metrics.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.schemas.epochs import EpochsProvenance, EpochsResponse, SiteEpochs
from app.schemas.solar import (
    ElectricalEnergyStatement,
    GeometricSunSummary,
    IndexEstimate,
    PanelResult,
    SiteComparison,
    SiteSolarPotential,
    SolarPotentialResponse,
    TerrainSunSummary,
)
from app.science import solar_potential as sp
from app.services import epochs_service, terrain_data_service

SOLAR_CONTRACT_VERSION = "7b.1"
DEFAULT_FIXED_TILT_DEG = 90.0
DEFAULT_TRACKING_TILT_DEG = 90.0
POLE_EPSILON_DEG = 1e-9
ALL_PANELS: tuple[sp.PanelKind, ...] = (
    sp.PanelKind.HORIZONTAL,
    sp.PanelKind.FIXED,
    sp.PanelKind.AZIMUTH_TRACKING,
    sp.PanelKind.DUAL_AXIS,
)

INDEX_DEFINITION = (
    "index = Σ f·cosθ·hold_hours / Σ hold_hours, in percent. f is the fraction of the "
    "solar disc above the horizon, θ the angle between the panel normal and the Sun. "
    "100 % is a dual-axis tracking panel in continuous unobstructed sunlight for the "
    "whole analysis window. Dimensionless and relative: not irradiance, not watts, "
    "not kWh."
)


class SolarConfigurationError(AppError):
    status_code = 422
    code = "INVALID_PANEL_CONFIGURATION"


class SolarSourceError(AppError):
    status_code = 422
    code = "SOLAR_POTENTIAL_UNAVAILABLE"


@dataclass(frozen=True, slots=True)
class SolarOptions:
    panels: tuple[sp.PanelKind, ...] = ALL_PANELS
    fixed_tilt_deg: float = DEFAULT_FIXED_TILT_DEG
    fixed_azimuth_deg: float | None = None
    """None → one hindsight-optimised azimuth per site (geometric horizon)."""
    tracking_tilt_deg: float = DEFAULT_TRACKING_TILT_DEG


def parse_options(
    *,
    panel: str | None = None,
    azimuth_deg: float | None = None,
    tilt_deg: float | None = None,
    tracking_tilt_deg: float | None = None,
) -> SolarOptions:
    """Validate query values. Anything outside the supported range is refused."""
    if panel is None:
        panels = ALL_PANELS
    else:
        try:
            panels = (sp.PanelKind(panel.strip().upper()),)
        except ValueError as exc:
            raise SolarConfigurationError(
                f"Unknown panel '{panel}'.",
                details={"allowed": [k.value.lower() for k in ALL_PANELS]},
            ) from exc
    fixed_tilt = DEFAULT_FIXED_TILT_DEG if tilt_deg is None else float(tilt_deg)
    tracking_tilt = (
        DEFAULT_TRACKING_TILT_DEG if tracking_tilt_deg is None else float(tracking_tilt_deg)
    )
    try:
        # Constructing the specs is the single source of range validation.
        sp.PanelSpec(sp.PanelKind.FIXED, fixed_tilt, 0.0 if azimuth_deg is None else azimuth_deg)
        sp.PanelSpec(sp.PanelKind.AZIMUTH_TRACKING, tracking_tilt)
    except sp.PanelConfigurationError as exc:
        raise SolarConfigurationError(str(exc)) from exc
    if sp.PanelKind.FIXED not in panels and (azimuth_deg is not None or tilt_deg is not None):
        raise SolarConfigurationError("azimuth_deg and tilt_deg apply to the fixed panel only.")
    if sp.PanelKind.AZIMUTH_TRACKING not in panels and tracking_tilt_deg is not None:
        raise SolarConfigurationError(
            "tracking_tilt_deg applies to the azimuth-tracking panel only."
        )
    return SolarOptions(
        panels=panels,
        fixed_tilt_deg=fixed_tilt,
        fixed_azimuth_deg=None if azimuth_deg is None else float(azimuth_deg),
        tracking_tilt_deg=tracking_tilt,
    )


def _pct(value: float | None) -> float | None:
    return None if value is None else round(100.0 * value, 4)


def _hours(value: float) -> float:
    return round(float(value), 4)


def _estimate(horizon: str, bounds: sp.IndexBounds) -> IndexEstimate:
    fraction = bounds.unknown_fraction
    return IndexEstimate(
        horizon=horizon,  # type: ignore[arg-type]
        status=bounds.status.value,  # type: ignore[arg-type]
        index_pct=_pct(bounds.value),
        index_min_pct=_pct(bounds.lower),
        index_max_pct=_pct(bounds.upper),
        unavailable_reason=bounds.unavailable_reason,  # type: ignore[arg-type]
        window_hours=_hours(bounds.window_hours),
        known_hours=_hours(bounds.known_hours),
        unknown_hours=_hours(bounds.unknown_hours),
        unknown_fraction=None if fraction is None else round(fraction, 6),
        edge_uncertain_hours=_hours(bounds.edge_uncertain_hours),
    )


@dataclass(frozen=True, slots=True)
class _SiteSeries:
    azimuth: np.ndarray
    elevation: np.ndarray
    hours: np.ndarray
    geometric: sp.SunFactor
    terrain: sp.SunFactor | None
    geo_states: list[str]
    terrain_states: list[str] | None


def _series(site: SiteEpochs, *, terrain: bool) -> _SiteSeries:
    def arr(values: list[float | None]) -> np.ndarray:
        return np.array([np.nan if v is None else float(v) for v in values], dtype=float)

    azimuth = arr([s.sun_azimuth_deg for s in site.samples])
    elevation = arr([s.sun_elevation_deg for s in site.samples])
    hours = np.array([max(0.0, float(s.hold_hours)) for s in site.samples], dtype=float)
    geo_states = [
        s.sun_geometric_state
        or (
            "UNKNOWN"
            if s.sun_elevation_deg is None
            else ("VISIBLE" if s.sun_elevation_deg > 0.0 else "BLOCKED")
        )
        for s in site.samples
    ]
    terrain_factor = None
    terrain_states = None
    if terrain:
        terrain_states = [s.sun_state for s in site.samples]
        terrain_factor = sp.terrain_sun_factor(
            elevation,
            arr([s.sun_terrain_horizon_deg for s in site.samples]),
            [sp.SunState(s) for s in terrain_states],
        )
    return _SiteSeries(
        azimuth=azimuth,
        elevation=elevation,
        hours=hours,
        geometric=sp.geometric_sun_factor(elevation),
        terrain=terrain_factor,
        geo_states=geo_states,
        terrain_states=terrain_states,
    )


def _state_hours(states: list[str], hours: np.ndarray, value: str) -> float:
    mask = np.array([s == value for s in states], dtype=bool)
    return float(hours[mask].sum()) if mask.size else 0.0


def _panel_result(
    kind: sp.PanelKind,
    site: SiteEpochs,
    series: _SiteSeries,
    options: SolarOptions,
) -> tuple[PanelResult, sp.IndexBounds | None, sp.IndexBounds | None]:
    tilt: float | None = None
    azimuth: float | None = None
    source: str | None = None
    if kind is sp.PanelKind.FIXED:
        tilt = options.fixed_tilt_deg
        if abs(site.latitude_deg) >= 90.0 - POLE_EPSILON_DEG:
            # "Clockwise from true north" has no meaning exactly at a pole.
            return (
                PanelResult(
                    panel=kind.value,
                    tilt_deg=tilt,
                    available=False,
                    unavailable_reason="AZIMUTH_UNDEFINED_AT_POLE",
                ),
                None,
                None,
            )
        if options.fixed_azimuth_deg is not None:
            azimuth, source = options.fixed_azimuth_deg, "REQUESTED"
        else:
            # One azimuth per site, reused for every horizon type and bound.
            azimuth = sp.optimise_fixed_azimuth(
                series.azimuth, series.elevation, series.hours, tilt
            )
            source = "OPTIMISED_HINDSIGHT_GEOMETRIC"
            if azimuth is None:
                return (
                    PanelResult(
                        panel=kind.value,
                        tilt_deg=tilt,
                        available=False,
                        unavailable_reason="NO_SUNLIT_SAMPLE_TO_OPTIMISE_AZIMUTH",
                    ),
                    None,
                    None,
                )
    elif kind is sp.PanelKind.AZIMUTH_TRACKING:
        tilt = options.tracking_tilt_deg

    spec = sp.PanelSpec(kind, tilt, azimuth)
    cos = sp.incidence_cosine(spec, series.azimuth, series.elevation)
    geo = sp.integrate_index(series.geometric, cos, series.hours)
    ter = None if series.terrain is None else sp.integrate_index(series.terrain, cos, series.hours)
    return (
        PanelResult(
            panel=kind.value,
            tilt_deg=tilt,
            azimuth_deg=azimuth,
            azimuth_source=source,  # type: ignore[arg-type]
            geometric=_estimate("GEOMETRIC", geo),
            terrain=None if ter is None else _estimate("TERRAIN", ter),
        ),
        geo,
        ter,
    )


def _fraction(numerator: float, total: float) -> float | None:
    return None if total <= 0 else round(numerator / total, 6)


def _comparison(
    kind: sp.PanelKind, horizon: str, per_site: list[sp.IndexBounds | None]
) -> SiteComparison:
    ranges: list[tuple[float, float] | None] = [
        None
        if b is None or b.status is sp.IndexStatus.UNAVAILABLE or b.lower is None or b.upper is None
        else (b.lower, b.upper)
        for b in per_site
    ]
    if len(ranges) < 2 or any(r is None for r in ranges):
        return SiteComparison(panel=kind.value, horizon=horizon, status="UNAVAILABLE")  # type: ignore[arg-type]
    leader = sp.compare_bounds(ranges)
    return SiteComparison(
        panel=kind.value,
        horizon=horizon,  # type: ignore[arg-type]
        status="NOT_DISTINGUISHABLE" if leader is None else "DISTINGUISHABLE",
        leading_site_index=leader,
    )


def solar_from_epochs(
    epochs: EpochsResponse,
    options: SolarOptions | None = None,
    *,
    now: datetime | None = None,
) -> SolarPotentialResponse:
    """Pure transformation ``EpochsResponse`` → ``SolarPotentialResponse``."""
    opts = options or SolarOptions()
    if epochs.data_quality == "SYNTHETIC_DEMO":
        raise SolarSourceError(
            "Solar potential is derived from JPL Horizons geometry only; this analysis "
            "is a synthetic demonstration and has none."
        )
    if not epochs.sites or not any(site.samples for site in epochs.sites):
        raise SolarSourceError("Analysis has no stored samples to derive solar potential from.")
    terrain = epochs.horizon_model == "TERRAIN"

    sites: list[SiteSolarPotential] = []
    bounds_by_panel: dict[tuple[sp.PanelKind, str], list[sp.IndexBounds | None]] = {}
    for index, site in enumerate(epochs.sites):
        series = _series(site, terrain=terrain)
        window = float(series.hours.sum())
        above = _state_hours(series.geo_states, series.hours, "VISIBLE")
        below = _state_hours(series.geo_states, series.hours, "BLOCKED")
        missing = _state_hours(series.geo_states, series.hours, "UNKNOWN")
        terrain_summary = None
        if series.terrain_states is not None:
            visible = _state_hours(series.terrain_states, series.hours, "VISIBLE")
            blocked = _state_hours(series.terrain_states, series.hours, "BLOCKED")
            unknown = _state_hours(series.terrain_states, series.hours, "UNKNOWN")
            terrain_summary = TerrainSunSummary(
                visible_hours=_hours(visible),
                blocked_hours=_hours(blocked),
                unknown_hours=_hours(unknown),
                visible_fraction_min=_fraction(visible, window),
                visible_fraction_max=_fraction(visible + unknown, window),
                unknown_fraction=_fraction(unknown, window),
            )
        configurations: list[PanelResult] = []
        for kind in opts.panels:
            result, geo, ter = _panel_result(kind, site, series, opts)
            configurations.append(result)
            bounds_by_panel.setdefault((kind, "GEOMETRIC"), []).append(geo)
            if terrain:
                bounds_by_panel.setdefault((kind, "TERRAIN"), []).append(ter)
        sites.append(
            SiteSolarPotential(
                site_index=index,
                label=site.label,
                latitude_deg=site.latitude_deg,
                longitude_deg=site.longitude_deg,
                landing_site_id=site.landing_site_id,
                dem_site_id=site.dem_site_id,
                terrain_complete_coverage_fraction=site.terrain_complete_coverage_fraction,
                window_hours=_hours(window),
                sample_count=len(site.samples),
                sun_above_geometric_horizon=GeometricSunSummary(
                    above_horizon_hours=_hours(above),
                    below_horizon_hours=_hours(below),
                    missing_ephemeris_hours=_hours(missing),
                    above_horizon_fraction_min=_fraction(above, window),
                    above_horizon_fraction_max=_fraction(above + missing, window),
                ),
                sun_terrain_visibility=terrain_summary,
                configurations=configurations,
            )
        )

    comparisons = [
        _comparison(kind, horizon, per_site)
        for (kind, horizon), per_site in bounds_by_panel.items()
    ]

    assumptions = [
        "Sun azimuth and elevation are the stored JPL Horizons apparent values for each "
        "site (airless body, no refraction). Azimuth is clockwise from local true north.",
        "Panel tilt is the angle between the panel normal and the local vertical on the "
        "reference sphere (0° horizontal, 90° vertical). Local surface slope is not applied.",
        "Fixed panel: constant tilt and azimuth for the whole window. When no azimuth is "
        "given, one azimuth per site is chosen with hindsight to maximise the "
        "geometric-horizon index (1° grid) and reused for every horizon type and bound.",
        "Azimuth tracking: the panel rotates about the local vertical and always faces the "
        "Sun's azimuth at a constant tilt. Dual-axis: the panel always faces the Sun.",
        "The Sun is a uniform disc of nominal radius "
        f"{sp.SUN_NOMINAL_ANGULAR_RADIUS_DEG}° cut by a straight horizon; limb darkening "
        "and the ±1.7 % seasonal change in apparent radius are ignored.",
        "Each sample holds for min(step, end − t) hours (sample-and-hold over "
        "[start_utc, end_utc)); a sample at the window end has zero weight.",
        "Only direct sunlight is considered: no earthshine, no light reflected from "
        "terrain, no self-shading by the lander or by neighbouring panels.",
    ]
    limitations = [
        "This is geometry only. It is not irradiance and not electrical output: Sun "
        "distance, cell efficiency, panel area, temperature, dust, degradation and "
        "storage are not modelled.",
        "Temporal sampling: the Sun's azimuth moves about 0.5° per hour at the lunar "
        "poles and the state is held constant between samples, so changes shorter than "
        f"the {epochs.time_step_minutes}-minute step are not resolved.",
        "Sites are comparable only within this analysis (same window and step). Ranges "
        "that overlap do not support a ranking.",
        "A range (minimum to maximum) is not a probability distribution; no value inside "
        "it is more likely than another.",
    ]
    if terrain:
        limitations.extend(
            [
                "Terrain visibility uses the local LOLA 5 m model recomputed at request "
                f"time (engine {terrain_data_service.HORIZON_ENGINE_VERSION}). UNKNOWN "
                "means the available DEM cannot decide; it adds nothing to the minimum "
                "and everything it cannot exclude to the maximum.",
                "Local LOLA coverage: the horizon is traced to 12 km at most and the DEM "
                "tiles often end sooner. Terrain beyond that is not modelled, so even "
                "VISIBLE means clear of terrain inside the modelled range only.",
                "The terrain horizon is stored in 5° azimuth bins (nearest bin). The "
                "0.53° solar disc is much narrower than a bin, so the partial-disc factor "
                "and state changes near terrain edges are approximate; this is not "
                "included in the reported range.",
                "Where an UNKNOWN sample has no terrain horizon value at all, the maximum "
                "assumes the terrain is not below the 0° sphere horizon in that direction.",
                "The terrain horizon is computed for the engine's default observer "
                "height (2 m); a panel on a taller mast would see a lower horizon.",
                "The known terrain horizon can lie below 0° where the ground falls away. "
                "The terrain maximum can therefore include hours when the Sun is below "
                "the smooth-sphere horizon, and can exceed the geometric value.",
                "The geometric-horizon values of a TERRAIN analysis ignore all terrain "
                "and are shown for context only.",
            ]
        )
    else:
        limitations.append(
            "GEOMETRIC analysis: the horizon is the smooth 0° lunar sphere. Terrain "
            "shadowing is not modelled, so real illumination at polar sites can be far "
            "lower. No terrain-aware value is reported."
        )

    provenance = [p for p in epochs.provenance]
    provenance.append(
        EpochsProvenance(
            source_id="selenora-solar-potential",
            description=(
                "Relative incidence index derived from the stored Sun azimuth/elevation "
                "and per-epoch visibility states; no new ephemeris request."
            ),
            version=SOLAR_CONTRACT_VERSION,
        )
    )

    return SolarPotentialResponse(
        analysis_id=epochs.analysis_id,
        mission_name=epochs.mission_name,
        horizon_model=epochs.horizon_model,
        data_quality=epochs.data_quality,
        algorithm_version=epochs.algorithm_version,
        terrain_engine_version=terrain_data_service.HORIZON_ENGINE_VERSION if terrain else None,
        solar_contract_version=SOLAR_CONTRACT_VERSION,
        start_utc=epochs.start_utc,
        end_utc=epochs.end_utc,
        time_step_minutes=epochs.time_step_minutes,
        generated_at_utc=(now or datetime.now(UTC)).astimezone(UTC),
        headline_horizon="TERRAIN" if terrain else "GEOMETRIC",
        index_definition=INDEX_DEFINITION,
        sun_angular_radius_deg=sp.SUN_NOMINAL_ANGULAR_RADIUS_DEG,
        sites=sites,
        comparisons=comparisons,
        electrical_energy=ElectricalEnergyStatement(
            reason=(
                "Electrical output cannot be derived from illumination geometry alone."
            ),
            missing_inputs=[
                "solar irradiance at the Moon for the date (Sun distance)",
                "panel area and cell efficiency",
                "panel temperature, dust and degradation",
                "power electronics and storage",
            ],
        ),
        assumptions=assumptions,
        provenance=provenance,
        limitations=limitations,
    )


def load_solar_potential(
    session: Session,
    analysis_id: str,
    options: SolarOptions | None = None,
    *,
    now: datetime | None = None,
) -> SolarPotentialResponse:
    epochs = epochs_service.load_epochs(session, analysis_id)
    return solar_from_epochs(epochs, options, now=now)
