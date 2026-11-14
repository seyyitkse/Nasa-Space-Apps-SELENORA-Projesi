"""Catalogue of scientific data sources and their *actual* integration status."""

from __future__ import annotations

from app.core.config import Settings
from app.integrations.nasa.lola import lola_available
from app.schemas.data_source import DataSourceList, DataSourceOut
from app.services import terrain_data_service


def list_data_sources(settings: Settings) -> DataSourceList:
    lola_ready = lola_available()
    return DataSourceList(
        items=[
            DataSourceOut(
                id="jpl-horizons",
                name="JPL Horizons System",
                provider="NASA / JPL Solar System Dynamics",
                category="EPHEMERIS",
                description=(
                    "Topocentric apparent azimuth/elevation of the Sun and Earth for an "
                    "observer at a lunar surface coordinate."
                ),
                url="https://ssd.jpl.nasa.gov/horizons/",
                documentation_url="https://ssd-api.jpl.nasa.gov/doc/horizons.html",
                integration_status="INTEGRATED",
                used_for=["Sun elevation timeline", "Earth elevation timeline", "Visibility windows"],
                phase=2,
                notes=(
                    "POST /api/v1/analyses fetches live observer Az/El for Sun (10) and Earth (399) "
                    "at lunar GEODETIC sites (coord@301). Use horizon_model=GEOMETRIC (default) or "
                    "TERRAIN when local LOLA tiles cover the sites."
                ),
            ),
            DataSourceOut(
                id="lro-lola",
                name="LRO Lunar Orbiter Laser Altimeter (LOLA)",
                provider="NASA Goddard Planetary Geodesy Data Archive (PGDA)",
                category="TOPOGRAPHY",
                description=(
                    "5 m/pix south-polar stereographic DEMs (Site01 Connecting Ridge, "
                    "Site04 Shackleton Rim) for local terrain horizon profiles."
                ),
                url="https://pgda.gsfc.nasa.gov/products/78",
                documentation_url="https://doi.org/10.1016/j.pss.2020.105119",
                integration_status="INTEGRATED" if lola_ready else "NOT_CONFIGURED",
                used_for=["Terrain elevation", "Local horizon profile", "Terrain shadowing"],
                phase=4,
                notes=(
                    f"{terrain_data_service.DATASET_CITATION} "
                    + (
                        "Local GeoTIFFs present; TERRAIN mode enabled for covered sites."
                        if lola_ready
                        else "Place *_surf.tif under data/raw/lola/ to enable TERRAIN mode."
                    )
                ),
            ),
            DataSourceOut(
                id="deepseek",
                name="DeepSeek AI Mission Analyst",
                provider="DeepSeek (OpenAI-compatible API)",
                category="AI_EXPLANATION",
                description=(
                    "Explains deterministic results in natural language. Never computes or "
                    "changes scientific values."
                ),
                url=settings.deepseek_base_url,
                documentation_url="https://api-docs.deepseek.com/",
                integration_status="INTEGRATED" if settings.deepseek_configured else "NOT_CONFIGURED",
                used_for=["Mission briefing", "Trade-off explanation", "EN/TR summaries"],
                phase=3,
                notes=(
                    f"Model from DEEPSEEK_MODEL ({settings.deepseek_model}). "
                    "Explains stored analyses only; never computes scores. Key is server-side only."
                ),
            ),
        ]
    )
