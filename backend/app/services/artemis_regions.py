"""Artemis III candidate landing *regions* — documentation reference only.

NASA published **13** south-polar candidate regions in **2022**, then narrowed the
historical Artemis III shortlist to **nine** regions in **October 2024**.

SELENORA exposes both lists with explicit source dates and classifications.
Polygons are never invented. Historical research seeds (Shackleton Rim Point A /
Connecting Ridge Point B) remain separate APPROXIMATE_REFERENCE demo coordinates.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

RegionClass = Literal[
    "ARTEMIS_III_2022_CANDIDATE",
    "ARTEMIS_III_2024_SHORTLIST",
]

NASA_REGIONS_2022_URL = (
    "https://www.nasa.gov/news-release/"
    "nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/"
)
NASA_REGIONS_2024_URL = (
    "https://www.nasa.gov/news-release/"
    "nasa-provides-update-on-artemis-iii-moon-landing-regions/"
)
ARTEMIS_III_MISSION_URL = "https://www.nasa.gov/mission/artemis-iii/"
NTRS_2024_ABSTRACT = "https://ntrs.nasa.gov/citations/20250011660"


@dataclass(frozen=True, slots=True)
class ArtemisRegion:
    id: str
    name: str
    classification: RegionClass
    source_date: str  # YYYY-MM-DD
    source_url: str
    notes: str
    still_on_2024_shortlist: bool | None = None
    """Only meaningful for 2022 rows; True if the same name remains on the 2024 list."""


# Exact 2022 public candidate-region labels (NASA news release).
REGIONS_2022: tuple[ArtemisRegion, ...] = (
    ArtemisRegion(
        "faustini-rim-a",
        "Faustini Rim A",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label. Not on the Oct 2024 shortlist.",
        still_on_2024_shortlist=False,
    ),
    ArtemisRegion(
        "peak-near-shackleton",
        "Peak Near Shackleton",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label. Not on the Oct 2024 shortlist.",
        still_on_2024_shortlist=False,
    ),
    ArtemisRegion(
        "connecting-ridge",
        "Connecting Ridge",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label. Not on the Oct 2024 shortlist.",
        still_on_2024_shortlist=False,
    ),
    ArtemisRegion(
        "connecting-ridge-extension",
        "Connecting Ridge Extension",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label. Not on the Oct 2024 shortlist.",
        still_on_2024_shortlist=False,
    ),
    ArtemisRegion(
        "de-gerlache-rim-1",
        "de Gerlache Rim 1",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label. Not on the Oct 2024 shortlist.",
        still_on_2024_shortlist=False,
    ),
    ArtemisRegion(
        "de-gerlache-rim-2",
        "de Gerlache Rim 2",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label; retained on the Oct 2024 shortlist.",
        still_on_2024_shortlist=True,
    ),
    ArtemisRegion(
        "de-gerlache-kocher-massif",
        "de Gerlache-Kocher Massif",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label. Not on the Oct 2024 shortlist.",
        still_on_2024_shortlist=False,
    ),
    ArtemisRegion(
        "haworth",
        "Haworth",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label; retained on the Oct 2024 shortlist.",
        still_on_2024_shortlist=True,
    ),
    ArtemisRegion(
        "malapert-massif",
        "Malapert Massif",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label; retained on the Oct 2024 shortlist.",
        still_on_2024_shortlist=True,
    ),
    ArtemisRegion(
        "leibnitz-beta-plateau",
        "Leibnitz Beta Plateau",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label. Not on the Oct 2024 shortlist.",
        still_on_2024_shortlist=False,
    ),
    ArtemisRegion(
        "nobile-rim-1",
        "Nobile Rim 1",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label; retained on the Oct 2024 shortlist.",
        still_on_2024_shortlist=True,
    ),
    ArtemisRegion(
        "nobile-rim-2",
        "Nobile Rim 2",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label; retained on the Oct 2024 shortlist.",
        still_on_2024_shortlist=True,
    ),
    ArtemisRegion(
        "amundsen-rim",
        "Amundsen Rim",
        "ARTEMIS_III_2022_CANDIDATE",
        "2022-08-19",
        NASA_REGIONS_2022_URL,
        "2022 NASA Artemis III candidate-region label. Not on the Oct 2024 shortlist.",
        still_on_2024_shortlist=False,
    ),
)


# NASA Oct 28, 2024 shortlist (nine regions; no priority order).
REGIONS_2024: tuple[ArtemisRegion, ...] = (
    ArtemisRegion(
        "peak-near-cabeus-b",
        "Peak near Cabeus B",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (new relative to the 2022 thirteen).",
    ),
    ArtemisRegion(
        "haworth-2024",
        "Haworth",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (also on the 2022 list).",
    ),
    ArtemisRegion(
        "malapert-massif-2024",
        "Malapert Massif",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (also on the 2022 list).",
    ),
    ArtemisRegion(
        "mons-mouton-plateau",
        "Mons Mouton Plateau",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (new relative to the 2022 thirteen).",
    ),
    ArtemisRegion(
        "mons-mouton",
        "Mons Mouton",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (new relative to the 2022 thirteen).",
    ),
    ArtemisRegion(
        "nobile-rim-1-2024",
        "Nobile Rim 1",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (also on the 2022 list).",
    ),
    ArtemisRegion(
        "nobile-rim-2-2024",
        "Nobile Rim 2",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (also on the 2022 list).",
    ),
    ArtemisRegion(
        "de-gerlache-rim-2-2024",
        "de Gerlache Rim 2",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (also on the 2022 list).",
    ),
    ArtemisRegion(
        "slater-plain",
        "Slater Plain",
        "ARTEMIS_III_2024_SHORTLIST",
        "2024-10-28",
        NASA_REGIONS_2024_URL,
        "Oct 2024 Artemis III shortlist region (new relative to the 2022 thirteen).",
    ),
)


# Backward-compatible alias used by older tests / imports.
REGIONS: tuple[ArtemisRegion, ...] = REGIONS_2022


def _region_dict(r: ArtemisRegion) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "classification": r.classification,
        "source_date": r.source_date,
        "source_url": r.source_url,
        "notes": r.notes,
        "still_on_2024_shortlist": r.still_on_2024_shortlist,
        "polygon": None,
        "geometry": None,
    }


def catalog() -> dict:
    return {
        "title": "Artemis III candidate landing regions (reference)",
        "architecture_note": (
            "NASA mission architecture and site-selection constraints have evolved since "
            "the 2022 announcement (HLS/NRHO availability, lighting, communications). "
            "Do not present the 2022 thirteen regions as the current Artemis III plan."
        ),
        "disclaimer": (
            "These are NASA-published *region* names for Artemis III planning context. "
            "They are NOT precise landing ellipses and are NOT identical to SELENORA's "
            "historical research seed coordinates (Shackleton Rim Point A / Connecting "
            "Ridge Point B). SELENORA does not fabricate polygon geometries from "
            "illustrative NASA graphics."
        ),
        "official_sources": [
            {
                "id": "nasa-regions-2022",
                "url": NASA_REGIONS_2022_URL,
                "source_date": "2022-08-19",
                "label": "2022 thirteen candidate regions",
            },
            {
                "id": "nasa-regions-2024",
                "url": NASA_REGIONS_2024_URL,
                "source_date": "2024-10-28",
                "label": "2024 nine-region Artemis III update",
            },
            {
                "id": "ntrs-2024-downselection",
                "url": NTRS_2024_ABSTRACT,
                "source_date": "2024-10",
                "label": "NTRS abstract: downselection from thirteen to nine",
            },
            {"id": "artemis-iii-mission", "url": ARTEMIS_III_MISSION_URL},
        ],
        "geometry": None,
        "geometry_status": "UNAVAILABLE_OFFICIAL_POLYGONS_NOT_DIGITIZED",
        "historical_2022_count": len(REGIONS_2022),
        "current_2024_shortlist_count": len(REGIONS_2024),
        "historical_2022_regions": [_region_dict(r) for r in REGIONS_2022],
        "current_2024_shortlist": [_region_dict(r) for r in REGIONS_2024],
        # Combined list for clients that iterate `regions` — each row carries classification.
        "regions": [_region_dict(r) for r in (*REGIONS_2022, *REGIONS_2024)],
        "selenora_historical_seeds_note": (
            "Seed sites shackleton-rim-a and connecting-ridge-b remain APPROXIMATE_REFERENCE "
            "research points for Horizons/LOLA demos; do not label them as official "
            "Artemis III shortlist footprints."
        ),
    }
