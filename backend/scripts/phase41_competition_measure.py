"""Phase 4.1 measurement harness — coverage, convergence, fixture terrain analysis."""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np

import json
from pathlib import Path

from app.integrations.nasa.horizons import (
    EphemerisResult,
    EphemerisSample,
    parse_api_payload,
)
from app.schemas.analysis import AnalysisCreate, DecisionWeights, SiteInput
from app.science.lunar_projection import true_north_grid_azimuth_deg
from app.services import terrain_data_service
from app.services.analysis_service import compute_from_ephemerides

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures"


def _samples(name: str) -> list[EphemerisSample]:
    payload = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    samples, _ = parse_api_payload(payload)
    return samples


def _ephem(target: str, samples: list[EphemerisSample], lat: float, lon: float) -> EphemerisResult:
    return EphemerisResult(
        target=target,  # type: ignore[arg-type]
        latitude_deg=lat,
        longitude_deg=lon,
        samples=samples,
        api_version="1.2",
        retrieved_at=datetime(2026, 11, 14, tzinfo=UTC),
    )

SITES = [
    ("A", -89.68, -166.0),
    ("B", -89.44, -141.8),
]


def main() -> None:
    print("=== Convergence ===")
    for name, lat, lon in SITES:
        g = true_north_grid_azimuth_deg(lon, lat)
        print(f"{name}: gamma={g:.4f} deg (lon%360={lon % 360:.4f})")

    print("=== Ray coverage 12 km / 72 az ===")
    for name, lat, lon in SITES:
        p, _, m = terrain_data_service.get_horizon_profile(
            lat, lon, max_range_m=12_000.0, n_azimuth=72, use_cache=False
        )
        vr = p.valid_range_m[p.has_any_data]
        print(
            f"{name}: any={p.any_data_fraction:.3f} complete={p.complete_coverage_fraction:.3f} "
            f"min_valid={float(vr.min()):.0f} med={float(np.median(vr)):.0f} "
            f"max={float(vr.max()):.0f} "
            f"maxH={float(np.nanmax(p.horizon_elevation_deg)):.2f} "
            f"minH={float(np.nanmin(p.horizon_elevation_deg)):.2f} "
            f"gamma={m['true_north_grid_azimuth_deg']:.2f}"
        )

    print("=== Fixture TERRAIN analysis (Horizons fixtures, real DEM) ===")
    sun = _samples("horizons_sun_shackleton_a_2026-12-01.json")
    earth = _samples("horizons_earth_shackleton_a_2026-12-01.json")
    sun_b = [
        EphemerisSample(s.time_utc, (s.azimuth_deg + 40) % 360, s.elevation_deg - 1) for s in sun
    ]
    earth_b = [
        EphemerisSample(s.time_utc, (s.azimuth_deg + 20) % 360, s.elevation_deg + 2) for s in earth
    ]
    req = AnalysisCreate(
        mission_name="P41",
        sites=[
            SiteInput(label="A", latitude_deg=-89.68, longitude_deg=-166.0),
            SiteInput(label="B", latitude_deg=-89.44, longitude_deg=-141.8),
        ],
        start_utc=datetime(2026, 12, 1, tzinfo=UTC),
        end_utc=datetime(2026, 12, 2, tzinfo=UTC),
        time_step_minutes=360,
        horizon_model="TERRAIN",
        weights=DecisionWeights(),
    )
    site_ephems = [
        {
            "SUN": _ephem("SUN", sun, -89.68, -166.0),
            "EARTH": _ephem("EARTH", earth, -89.68, -166.0),
        },
        {
            "SUN": _ephem("SUN", sun_b, -89.44, -141.8),
            "EARTH": _ephem("EARTH", earth_b, -89.44, -141.8),
        },
    ]
    result, _, _ = compute_from_ephemerides(req, "p41", site_ephems)
    print(
        f"quality={result.data_quality} algo={result.algorithm_version} "
        f"recommended={result.recommended_site_label}"
    )
    for s in result.sites:
        t = s.terrain
        g = s.geometric_comparison
        assert t and g
        print(f"--- {s.label} score={s.score} rank={s.rank} ---")
        print("terrain", s.metrics.model_dump())
        print("geometric", g.geometric.model_dump())
        print(
            "deltas",
            {
                "sun": g.sun_visibility_pct_delta,
                "earth": g.earth_visibility_pct_delta,
                "joint": g.joint_visibility_pct_delta,
                "darkness_h": g.longest_darkness_hours_delta,
                "comm_gap_h": g.longest_communication_gap_hours_delta,
            },
        )
        print(
            "coverage",
            {
                "any": t.any_data_fraction,
                "complete": t.complete_coverage_fraction,
                "unknown_h": t.unknown_hours,
                "known_frac": t.known_sample_fraction,
                "gamma": t.true_north_grid_azimuth_deg,
                "min_range": t.min_valid_range_m,
                "med_range": t.median_valid_range_m,
            },
        )


if __name__ == "__main__":
    main()
