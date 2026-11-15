"""Globe-ready site catalog — thin read-only view over seed LandingSite rows.

Does **not** invent coordinates or Artemis polygons. Reuses the same DB seed
IDs / lon/lat consumed by Mission Planner and ``GET /api/v1/sites``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.seed import SEED_SITES
from app.models.site import LandingSite
from app.science.lunar_sphere import (
    SOUTH_POLAR_LAT_MAX_DEG,
    is_south_polar,
    lonlat_to_cartesian,
    normalize_longitude_deg,
)
from app.services.site_service import COORDINATE_FRAME, DISCLAIMER, LONGITUDE_CONVENTION
from app.services.terrain_data_service import check_coverage

# Stable expected seed IDs — tests lock these so the globe cannot silently drift.
EXPECTED_SEED_IDS: tuple[str, ...] = tuple(str(s["id"]) for s in SEED_SITES)

GLOBE_DISCLAIMER = (
    "Globe markers reuse SELENORA APPROXIMATE_REFERENCE research/demo sites. "
    "They are NOT official NASA Artemis III landing recommendations, ellipses, "
    "or prioritized shortlist footprints. Prefer GET /api/v1/artemis/regions for "
    "NASA-published region *names* (no fabricated polygons)."
)

SVS_GLB_NOTE = (
    "Inspected NASA SVS #14959 moon_small.glb (2026-11-14): mesh node has "
    "identity transform; POSITION AABB is centered; +Z≈north pole, −Z≈south "
    "pole, +X≈lon 0° equator, +Y≈lon +90°E — matching scientific MOON_ME. "
    "UV is NOT vanilla equirect (equator samples show v≈0.375; poles pinched "
    "per SVS notes). Place markers with lonlat→ME Cartesian on the mesh root; "
    "do not infer lon/lat from UV alone. Re-validate after any engine/Y-up "
    "import transform."
)

SVS_GLB_ORIENTATION_STATUS = "GEOMETRY_AXES_MATCH_MOON_ME_UV_CAVEATS"

# Local PGDA LOLA 5 m tiles known to cover seed sites (from COORDINATE_SYSTEMS.md).
# Sites outside these footprints remain GEOMETRIC-only for terrain analysis.
KNOWN_LOLA_COVERAGE: dict[str, str] = {
    "shackleton-rim-a": "Site04",
    "connecting-ridge-b": "Site01",
}


@dataclass(frozen=True, slots=True)
class GlobeSiteRecord:
    id: str
    name: str
    latitude_deg: float
    longitude_deg: float
    longitude_normalized_deg: float
    region: str
    description: str
    coordinate_source: str
    coordinate_status: str
    south_polar: bool
    local_lola_coverage: bool
    local_lola_tile: str | None
    geometric_analysis_supported: bool
    cartesian_me: dict[str, float]
    not_nasa_landing_recommendation: bool


def _probe_lola(lat: float, lon: float) -> tuple[bool, str | None]:
    """Best-effort local DEM coverage; never invents True when DEM absent."""
    try:
        cov = check_coverage(lat, lon)
    except Exception:
        return False, None
    if cov.covered and cov.dem is not None:
        return True, cov.dem.site_id
    return False, None


def _enrich_row(row: LandingSite) -> GlobeSiteRecord:
    lon_n = normalize_longitude_deg(row.longitude_deg)
    covered, tile = _probe_lola(row.latitude_deg, row.longitude_deg)
    # When DEM files are absent (typical CI), surface the *expected* tile from
    # docs/COORDINATE_SYSTEMS.md without claiming live coverage.
    expected_tile = KNOWN_LOLA_COVERAGE.get(row.id)
    if not covered and expected_tile is not None:
        tile = f"{expected_tile} (expected when local DEM installed)"
    cart = lonlat_to_cartesian(row.longitude_deg, row.latitude_deg)
    return GlobeSiteRecord(
        id=row.id,
        name=row.name,
        latitude_deg=float(row.latitude_deg),
        longitude_deg=float(row.longitude_deg),
        longitude_normalized_deg=lon_n,
        region=row.region,
        description=row.description,
        coordinate_source=row.coordinate_source,
        coordinate_status=row.coordinate_status,
        south_polar=is_south_polar(row.latitude_deg),
        local_lola_coverage=covered,
        local_lola_tile=tile,
        geometric_analysis_supported=True,  # All seed sites are valid Horizons observers
        cartesian_me={
            "x_m": cart.x_m,
            "y_m": cart.y_m,
            "z_m": cart.z_m,
            "radius_m": cart.radius_m,
            "frame": "MOON_ME_SPHERE_SCIENTIFIC",
        },
        not_nasa_landing_recommendation=True,
    )


def catalog(session: Session) -> dict[str, Any]:
    rows = session.scalars(select(LandingSite).order_by(LandingSite.latitude_deg)).all()
    items = [_enrich_row(r) for r in rows]
    return {
        "title": "SELENORA globe markers (research / demo)",
        "coordinate_frame": COORDINATE_FRAME,
        "longitude_convention": LONGITUDE_CONVENTION,
        "sphere_radius_m": 1_737_400.0,
        "south_polar_threshold_deg": SOUTH_POLAR_LAT_MAX_DEG,
        "cartesian_convention": (
            "Planetocentric ME sphere: +Z north pole, +X lon=0° (mean Earth), "
            "+Y lon=+90°E; radius 1737400 m."
        ),
        "svs_glb_orientation_status": SVS_GLB_ORIENTATION_STATUS,
        "svs_glb_note": SVS_GLB_NOTE,
        "disclaimer": GLOBE_DISCLAIMER,
        "sites_disclaimer": DISCLAIMER,
        "related_endpoints": {
            "sites": "/api/v1/sites",
            "artemis_regions": "/api/v1/artemis/regions",
        },
        "total": len(items),
        "items": [
            {
                "id": i.id,
                "name": i.name,
                "latitude_deg": i.latitude_deg,
                "longitude_deg": i.longitude_deg,
                "longitude_normalized_deg": i.longitude_normalized_deg,
                "region": i.region,
                "description": i.description,
                "coordinate_source": i.coordinate_source,
                "coordinate_status": i.coordinate_status,
                "south_polar": i.south_polar,
                "local_lola_coverage": i.local_lola_coverage,
                "local_lola_tile": i.local_lola_tile,
                "geometric_analysis_supported": i.geometric_analysis_supported,
                "cartesian_me": i.cartesian_me,
                "not_nasa_landing_recommendation": i.not_nasa_landing_recommendation,
            }
            for i in items
        ],
    }


def seed_id_set() -> set[str]:
    return set(EXPECTED_SEED_IDS)
