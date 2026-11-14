"""LRO / LOLA topography integration (Phase 4).

Uses local NASA PGDA 5 m/pix GeoTIFFs under ``data/raw/lola/``. Horizon
profiles are computed in ``app.science.horizon_profile`` via
``app.services.terrain_data_service``.
"""

from __future__ import annotations

import numpy as np

from app.services import terrain_data_service


class GeometricHorizon:
    """Smooth-sphere horizon: 0° everywhere (Phase 2/3 geometric mode)."""

    def horizon_elevation_deg(
        self, latitude_deg: float, longitude_deg: float, azimuth_deg: np.ndarray
    ) -> np.ndarray:
        return np.zeros_like(np.asarray(azimuth_deg, dtype=float))


class LolaHorizon:
    """LOLA-derived local terrain horizon (requires covering DEM on disk)."""

    def __init__(self, *, observer_height_m: float = 2.0) -> None:
        self.observer_height_m = observer_height_m
        self._profile = None
        self._lat = None
        self._lon = None

    def horizon_elevation_deg(
        self, latitude_deg: float, longitude_deg: float, azimuth_deg: np.ndarray
    ) -> np.ndarray:
        if self._profile is None or self._lat != latitude_deg or self._lon != longitude_deg:
            profile, _, _ = terrain_data_service.get_horizon_profile(
                latitude_deg,
                longitude_deg,
                observer_height_m=self.observer_height_m,
            )
            self._profile = profile
            self._lat = latitude_deg
            self._lon = longitude_deg
        out = np.empty(len(azimuth_deg), dtype=float)
        for i, az in enumerate(np.asarray(azimuth_deg, dtype=float)):
            h, ok = self._profile.elevation_at_azimuth(float(az))
            out[i] = h if ok else np.nan
        return out


def lola_available() -> bool:
    return len(terrain_data_service.list_dem_tiles()) > 0
