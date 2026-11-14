"""Fixed metre-aligned map tiles; independent of all scientific calculations."""

from __future__ import annotations

from app.services.raster_preview_service import MapServiceError

GRID_VERSION = "sps-768km-v1"
WORLD_HALF_M = 768_000
WAC_LAYER = "lroc-wac-south-summer"
NAC_LAYER = "lroc-nac-2m-south-pole"
HILL_LAYER = "ldem-80s-80mpp-hill"


def tile_spec(layer_id: str, level: int, x: int, y: int) -> tuple[tuple[float, float, float, float], int]:
    maximum = 10 if layer_id == NAC_LAYER else 5
    if layer_id not in {WAC_LAYER, NAC_LAYER, HILL_LAYER}:
        raise MapServiceError("This layer is not in the polar tile allowlist.")
    if not 0 <= level <= maximum or not 0 <= x < 2 ** (level + 1) or not 0 <= y < 2 ** (level + 1):
        raise MapServiceError("Polar tile coordinate is out of range.")
    span = WORLD_HALF_M / 2 ** level
    left, top = -WORLD_HALF_M + x * span, WORLD_HALF_M - y * span
    # WAC reaches exactly 100 m/px at level 5; NAC reaches 2 m/px at level 10.
    return (left, top - span, left + span, top), 375 if layer_id == NAC_LAYER else 240
