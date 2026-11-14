"""LRO / LOLA topography integration — interface only (Phase 4).

Planned responsibilities (see docs/DATA_SOURCES.md):
* Load a south-polar LOLA DEM (polar stereographic GeoTIFF) via Rasterio.
* Sample terrain elevation at a site.
* Compute a local horizon profile: max elevation angle of terrain per azimuth.
* Feed the profile to the visibility engine (``EPHEMERIS_TERRAIN`` quality).

Until implemented, callers must treat terrain as unavailable and label results
``EPHEMERIS_GEOMETRIC`` — never silently pretend terrain was considered.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np


class HorizonProfileProvider(Protocol):
    def horizon_elevation_deg(
        self, latitude_deg: float, longitude_deg: float, azimuth_deg: np.ndarray
    ) -> np.ndarray:
        """Terrain horizon elevation (deg) for each azimuth (deg, clockwise from north)."""
        ...


class GeometricHorizon:
    """Smooth-sphere horizon: 0° everywhere. Used until LOLA is integrated."""

    def horizon_elevation_deg(
        self, latitude_deg: float, longitude_deg: float, azimuth_deg: np.ndarray
    ) -> np.ndarray:
        return np.zeros_like(np.asarray(azimuth_deg, dtype=float))
