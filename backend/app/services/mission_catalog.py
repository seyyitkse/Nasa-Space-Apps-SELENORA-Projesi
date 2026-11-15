"""Phase 7E — verified lunar mission catalog service (read-only).

Loads and validates the versioned static JSON catalog in
``backend/app/data/mission_catalog.v1.json`` and enriches each record with
MOON_ME spherical Cartesian coordinates via ``app/science/lunar_sphere.py``
— the same scientific conversion used by ``GET /api/v1/globe/sites``.

This service NEVER writes to the research-site seed database and NEVER feeds
mission records into research-candidate scoring (``terrain_scoring_supported``
is always False). Apollo historical sites are never treated as south-polar
Explorer basemap pins (``explorer_coverage`` is geographic map coverage only).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.schemas.missions import (
    ABORTED_OUTCOMES,
    PARTIAL_OUTCOMES,
    PLANNED_OUTCOMES,
    SUCCESSFUL_OUTCOMES,
    UNSUCCESSFUL_OR_ABORTED_OUTCOMES,
    UNSUCCESSFUL_OUTCOMES,
    MissionItem,
)
from app.science.lunar_sphere import (
    SOUTH_POLAR_LAT_MAX_DEG,
    is_south_polar,
    lonlat_to_cartesian,
    normalize_longitude_deg,
)

CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "mission_catalog.v1.json"

MISSION_DISCLAIMER = (
    "Historical, unsuccessful and planned lunar missions from NASA NSSDC, "
    "LROC (Wagner et al. 2016) and NASA CLPS pages. Planned targets are "
    "feature-region references only. NOT a NASA landing-site recommendation; "
    "mission records are kept separate from SELENORA research-candidate scoring. "
    "Apollo historical sites appear only on the global 3D Moon."
)

LONGITUDE_CONVENTION = "East-positive planetocentric, stored -180..180 deg"

MAP_LAT_BOUND_DEG = -80.0
"""Lunar Explorer south-polar stereographic map coverage bound (lat <= -80)."""


def _load_raw() -> dict[str, Any]:
    with CATALOG_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def _validated_items() -> tuple[MissionItem, ...]:
    """Parse + validate the catalog once; raise on any rule violation."""
    raw = _load_raw()
    items: list[MissionItem] = []
    for entry in raw["missions"]:
        items.append(MissionItem.model_validate(entry))
    ids = [item.id for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("mission catalog contains duplicate ids")
    return tuple(items)


def _enrich(item: MissionItem) -> MissionItem:
    """Compute normalized longitude, ME Cartesian, marker kind and coverage flags."""
    enriched = item.model_copy()
    if item.latitude_deg is not None and item.longitude_deg is not None:
        enriched.longitude_normalized_deg = normalize_longitude_deg(item.longitude_deg)
        cart = lonlat_to_cartesian(item.longitude_deg, item.latitude_deg)
        enriched.cartesian_me = {
            "x_m": cart.x_m,
            "y_m": cart.y_m,
            "z_m": cart.z_m,
            "radius_m": cart.radius_m,
            "frame": "MOON_ME_SPHERE_SCIENTIFIC",
        }
        enriched.marker_kind = "ACTUAL_LANDING"
        enriched.south_polar = is_south_polar(item.latitude_deg)
        # Geographic map coverage is NOT scientific terrain coverage: the
        # Explorer renders the south-polar stereographic basemap for lat <= -80,
        # but LOLA DEM (and therefore scoring) coverage is separate.
        # Apollo sites are never south of -80 and must not be Explorer pins.
        enriched.explorer_coverage = bool(item.latitude_deg <= MAP_LAT_BOUND_DEG)
    else:
        target = item.planned_target
        if (
            target is not None
            and target.latitude_deg is not None
            and target.longitude_deg is not None
            and item.region_representation == "FEATURE_CENTROID_APPROXIMATE"
        ):
            enriched.longitude_normalized_deg = normalize_longitude_deg(
                target.longitude_deg
            )
            cart = lonlat_to_cartesian(target.longitude_deg, target.latitude_deg)
            enriched.cartesian_me = {
                "x_m": cart.x_m,
                "y_m": cart.y_m,
                "z_m": cart.z_m,
                "radius_m": cart.radius_m,
                "frame": "MOON_ME_SPHERE_SCIENTIFIC",
            }
            enriched.marker_kind = "PLANNED_TARGET_REGION"
            enriched.south_polar = is_south_polar(target.latitude_deg)
            enriched.explorer_coverage = bool(target.latitude_deg <= MAP_LAT_BOUND_DEG)
        else:
            enriched.marker_kind = "LIST_ONLY"
    enriched.terrain_scoring_supported = False
    return enriched


def catalog() -> dict[str, Any]:
    """Full validated + enriched catalog payload."""
    items = [_enrich(i) for i in _validated_items()]
    raw = _load_raw()
    return {
        "title": "SELENORA verified lunar mission catalog",
        "catalog_version": raw["catalog_version"],
        "generated_date": raw["generated_date"],
        "coordinate_frame": raw["coordinate_frame"],
        "coordinate_convention": raw["coordinate_convention"],
        "me_pa_policy": raw.get(
            "me_pa_policy",
            "Sources cite Mean Earth/Polar Axis as one lunar body-fixed system; "
            "no unverified ME↔PA remapping is applied.",
        ),
        "longitude_convention": LONGITUDE_CONVENTION,
        "sphere_radius_m": raw["sphere_radius_m"],
        "south_polar_threshold_deg": SOUTH_POLAR_LAT_MAX_DEG,
        "disclaimer": MISSION_DISCLAIMER,
        "filters": {
            "program": ["APOLLO", "CLPS"],
            "outcome": [
                "successful",
                "partial",
                "unsuccessful",
                "aborted",
                "planned",
                "unsuccessful_or_aborted",
            ],
            "confidence": ["EXACT_VERIFIED", "APPROXIMATE_REGION"],
        },
        "related_endpoints": {
            "globe_sites": "/api/v1/globe/sites",
            "sites": "/api/v1/sites",
        },
        "total": len(items),
        "items": [i.model_dump(mode="json") for i in items],
    }


def _outcome_bucket(outcome: str) -> str:
    if outcome in SUCCESSFUL_OUTCOMES:
        return "successful"
    if outcome in PARTIAL_OUTCOMES:
        return "partial"
    if outcome in UNSUCCESSFUL_OUTCOMES:
        return "unsuccessful"
    if outcome in ABORTED_OUTCOMES:
        return "aborted"
    if outcome in PLANNED_OUTCOMES:
        return "planned"
    raise ValueError(f"unknown landing_outcome: {outcome}")


def _matches_outcome_filter(landing_outcome: str, outcome_filter: str) -> bool:
    if outcome_filter == "unsuccessful_or_aborted":
        return landing_outcome in UNSUCCESSFUL_OR_ABORTED_OUTCOMES
    return _outcome_bucket(landing_outcome) == outcome_filter


def filtered_catalog(
    *,
    program: str | None = None,
    outcome: str | None = None,
    confidence: str | None = None,
) -> dict[str, Any]:
    """Filtered view of the catalog."""
    payload = catalog()
    items = payload["items"]
    if program:
        items = [i for i in items if i["program"] == program]
    if outcome:
        items = [i for i in items if _matches_outcome_filter(i["landing_outcome"], outcome)]
    if confidence:
        items = [i for i in items if i["confidence"] == confidence]
    payload = dict(payload)
    payload["total"] = len(items)
    payload["items"] = items
    return payload
