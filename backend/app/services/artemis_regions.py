"""Artemis III candidate landing *regions* — documentation reference only.

Names below were extracted from NASA's public candidate-regions news release
(verified HTTP fetch 2026-11-14). SELENORA does **not** invent polygon
footprints. Historical research seeds (Shackleton Rim Point A / Connecting
Ridge Point B) remain separate APPROXIMATE_REFERENCE demo coordinates.
"""

from __future__ import annotations

from dataclasses import dataclass

NASA_REGIONS_URL = (
    "https://www.nasa.gov/news-release/"
    "nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/"
)
ARTEMIS_III_MISSION_URL = "https://www.nasa.gov/mission/artemis-iii/"


@dataclass(frozen=True, slots=True)
class ArtemisRegion:
    id: str
    name: str
    notes: str


# Exact labels as listed under "NASA identified the following candidate regions…"
# on the official news release (2026-11-14 fetch). Count may exceed earlier
# "nine regions" summaries if NASA updated the public list.
REGIONS: tuple[ArtemisRegion, ...] = (
    ArtemisRegion("faustini-rim-a", "Faustini Rim A", "Official NASA candidate-region label."),
    ArtemisRegion("peak-near-shackleton", "Peak Near Shackleton", "Official NASA candidate-region label."),
    ArtemisRegion("connecting-ridge", "Connecting Ridge", "Official NASA candidate-region label."),
    ArtemisRegion(
        "connecting-ridge-extension",
        "Connecting Ridge Extension",
        "Official NASA candidate-region label.",
    ),
    ArtemisRegion("de-gerlache-rim-1", "de Gerlache Rim 1", "Official NASA candidate-region label."),
    ArtemisRegion("de-gerlache-rim-2", "de Gerlache Rim 2", "Official NASA candidate-region label."),
    ArtemisRegion(
        "de-gerlache-kocher-massif",
        "de Gerlache-Kocher Massif",
        "Official NASA candidate-region label.",
    ),
    ArtemisRegion("haworth", "Haworth", "Official NASA candidate-region label."),
    ArtemisRegion("malapert-massif", "Malapert Massif", "Official NASA candidate-region label."),
    ArtemisRegion(
        "leibnitz-beta-plateau",
        "Leibnitz Beta Plateau",
        "Official NASA candidate-region label.",
    ),
    ArtemisRegion("nobile-rim-1", "Nobile Rim 1", "Official NASA candidate-region label."),
    ArtemisRegion("nobile-rim-2", "Nobile Rim 2", "Official NASA candidate-region label."),
    ArtemisRegion("amundsen-rim", "Amundsen Rim", "Official NASA candidate-region label."),
)


def catalog() -> dict:
    return {
        "title": "Artemis III candidate landing regions (reference)",
        "source_retrieved_note": "Region names scraped from NASA news release HTML on 2026-11-14.",
        "disclaimer": (
            "These are NASA-published *region* names for Artemis III planning context. "
            "They are NOT precise landing ellipses and are NOT identical to SELENORA's "
            "historical research seed coordinates (Shackleton Rim Point A / Connecting "
            "Ridge Point B). SELENORA does not fabricate polygon geometries from "
            "illustrative NASA graphics."
        ),
        "official_sources": [
            {"id": "nasa-regions-release", "url": NASA_REGIONS_URL},
            {"id": "artemis-iii-mission", "url": ARTEMIS_III_MISSION_URL},
        ],
        "geometry": None,
        "geometry_status": "UNAVAILABLE_OFFICIAL_POLYGONS_NOT_DIGITIZED",
        "regions": [
            {"id": r.id, "name": r.name, "notes": r.notes, "polygon": None} for r in REGIONS
        ],
        "selenora_historical_seeds_note": (
            "Seed sites shackleton-rim-a and connecting-ridge-b remain APPROXIMATE_REFERENCE "
            "research points for Horizons/LOLA demos; do not label them as official "
            "Artemis III shortlist footprints."
        ),
    }
