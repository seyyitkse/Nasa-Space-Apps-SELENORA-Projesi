"""Seed data: reference landing locations for the demo.

IMPORTANT — scientific honesty:
These are *approximate* coordinates of well-known south-polar features, rounded
and intended for demonstration and UI testing. They are NOT the official
Artemis III candidate-region polygons. Verify every coordinate against the IAU
Gazetteer of Planetary Nomenclature (https://planetarynames.wr.usgs.gov/) and
the cited literature before scientific use. `coordinate_status` makes this
explicit to every API consumer.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.site import LandingSite

APPROX = "APPROXIMATE_REFERENCE"

SEED_SITES: list[dict[str, object]] = [
    {
        "id": "shackleton-rim-a",
        "name": "Shackleton Rim — Point A",
        "latitude_deg": -89.68,
        "longitude_deg": -166.0,
        "description": "Rim location frequently cited for long solar illumination periods.",
        "coordinate_source": "Approximate; after Bussey et al. (2010), Icarus 208, "
        "'Illumination conditions of the south pole of the Moon derived using Kaguya "
        "topography' (Point A). Verify before use.",
    },
    {
        "id": "connecting-ridge-b",
        "name": "Shackleton–de Gerlache Ridge — Point B",
        "latitude_deg": -89.44,
        "longitude_deg": -141.8,
        "description": "Ridge between Shackleton and de Gerlache craters.",
        "coordinate_source": "Approximate; after Bussey et al. (2010), Icarus 208 (Point B). "
        "Verify before use.",
    },
    {
        "id": "shackleton-floor",
        "name": "Shackleton Crater (center)",
        "latitude_deg": -89.67,
        "longitude_deg": 129.78,
        "description": "Crater interior; useful contrast case (permanently shadowed floor "
        "is expected once terrain is modelled).",
        "coordinate_source": "Approximate feature center, IAU Gazetteer (rounded). Verify before use.",
    },
    {
        "id": "de-gerlache",
        "name": "de Gerlache Crater (center)",
        "latitude_deg": -88.5,
        "longitude_deg": -87.1,
        "description": "Crater adjacent to Shackleton.",
        "coordinate_source": "Approximate feature center, IAU Gazetteer (rounded). Verify before use.",
    },
    {
        "id": "malapert-massif",
        "name": "Malapert Massif (approx.)",
        "latitude_deg": -86.0,
        "longitude_deg": 2.9,
        "description": "Massif on the Earth-facing side of the south polar region.",
        "coordinate_source": "Approximate location (rounded). Verify before use.",
    },
    {
        "id": "nobile",
        "name": "Nobile Crater (center)",
        "latitude_deg": -85.2,
        "longitude_deg": 53.5,
        "description": "Large crater in the south polar region.",
        "coordinate_source": "Approximate feature center, IAU Gazetteer (rounded). Verify before use.",
    },
    # Bussey et al. (2010) alternate illumination sites — separate from historical Point A/B.
    # Phase 5C LOLA Site04 analysis shows seeded Point A sits below nearby rim terrain;
    # these literature points are added as additional candidates only (A/B unchanged).
    {
        "id": "bussey-2010-point-c",
        "name": "Bussey 2010 Point C — de Gerlache rim",
        "latitude_deg": -88.71,
        "longitude_deg": -68.7,
        "description": "Literature illumination candidate on the de Gerlache crater rim "
        "(Bussey et al. 2010). Not a replacement for Point A/B. Local Site01/04 LOLA "
        "5 m DEM coverage is not expected; use GEOMETRIC analysis unless a covering DEM is added.",
        "coordinate_source": "Bussey et al. (2010), Icarus 208, Point C (88.71°S, 68.7°W). "
        "Kaguya-derived illumination study; verify before scientific use.",
    },
    {
        "id": "bussey-2010-point-d",
        "name": "Bussey 2010 Point D — Shackleton ridge (most lit in 2020 map)",
        "latitude_deg": -88.74,
        "longitude_deg": 124.5,
        "description": "Literature site reported as the single most illuminated location "
        "in the Bussey et al. (2010) 2020 annual average map (~86% of year). Separate "
        "candidate only — Point A/B coordinates are preserved. Outside Site01/04 local "
        "DEM footprints; TERRAIN mode will report no local coverage.",
        "coordinate_source": "Bussey et al. (2010), Icarus 208 / abstract: 88.74°S, 124.5°E "
        "(Point D / most-illuminated place near Shackleton). Verify before scientific use.",
    },
]


def seed_landing_sites(session: Session) -> int:
    existing = set(session.scalars(select(LandingSite.id)).all())
    added = 0
    for data in SEED_SITES:
        if data["id"] in existing:
            continue
        session.add(LandingSite(**data, coordinate_status=APPROX))
        added += 1
    session.commit()
    return added
