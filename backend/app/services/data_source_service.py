"""Catalogue of scientific data sources and their *actual* integration status."""

from __future__ import annotations

from app.core.config import Settings
from app.schemas.data_source import DataSourceList, DataSourceOut


def list_data_sources(settings: Settings) -> DataSourceList:
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
                integration_status="CLIENT_READY",
                used_for=["Sun elevation timeline", "Earth elevation timeline", "Visibility windows"],
                phase=2,
                notes=(
                    "Async client, query builder and table parser are implemented and unit-tested. "
                    "Not yet used to produce analyses (Phase 2)."
                ),
            ),
            DataSourceOut(
                id="lro-lola",
                name="LRO Lunar Orbiter Laser Altimeter (LOLA)",
                provider="NASA Goddard / LRO Project",
                category="TOPOGRAPHY",
                description="Polar digital elevation models for terrain elevation and local horizon profiles.",
                url="https://science.nasa.gov/mission/lro/data-products/",
                documentation_url="https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
                integration_status="PLANNED",
                used_for=["Terrain elevation", "Local horizon profile", "Terrain shadowing"],
                phase=4,
                notes="Until integrated, all analyses use a geometric (smooth-sphere) horizon.",
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
                integration_status="CLIENT_READY" if settings.deepseek_configured else "NOT_CONFIGURED",
                used_for=["Mission briefing", "Trade-off explanation", "EN/TR summaries"],
                phase=3,
                notes=f"Model: {settings.deepseek_model}. Key is read server-side only.",
            ),
        ]
    )
