"""Catalog of NASA geospatial layers available to SELENORA map APIs (Phase 5B).

Scientific terrain scoring still uses only local Site01/Site04 5 m DEMs unless a
future phase re-validates far-field horizons. Wide-area PGDA Product 90 assets
are exposed for **map visualization** via HTTP range / vsicurl window reads —
not as fully validated scoring inputs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

LayerRole = Literal["SCIENCE_VALIDATED_LOCAL", "MAP_VISUALIZATION_ONLY", "REFERENCE_DOC"]
AccessMode = Literal[
    "local_file",
    "vsicurl_window",
    "documentation_only",
    "wms_allowlisted",
    "wmts_allowlisted",
]


@dataclass(frozen=True, slots=True)
class NasaLayer:
    id: str
    title: str
    provider: str
    product_page: str
    source_url: str | None
    access_mode: AccessMode
    role: LayerRole
    kind: str  # elevation | hillshade | slope | psr | imagery | reference
    resolution_m: float | None
    units: str | None
    crs_summary: str
    attribution: str
    notes: str
    approx_bytes: int | None = None
    accept_ranges: bool | None = None
    local_glob: str | None = None


PGDA78 = "https://pgda.gsfc.nasa.gov/products/78"
PGDA90 = "https://pgda.gsfc.nasa.gov/products/90"
MOON_TREK = "https://trek.nasa.gov/moon/"
ARTEMIS_REGIONS = (
    "https://www.nasa.gov/news-release/"
    "nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/"
)
BARKER_CITATION = (
    "Barker et al., 2021, Planet. Space Sci. 203, 105119; "
    "NASA PGDA LOLA topography products."
)

# Verified 2026-11-14 via HTTP HEAD (Accept-Ranges: bytes).
LAYERS: tuple[NasaLayer, ...] = (
    NasaLayer(
        id="lola-site01-5mpp-surf",
        title="LOLA Site01 Connecting Ridge 5 m surface",
        provider="NASA GSFC PGDA",
        product_page=PGDA78,
        source_url=None,
        access_mode="local_file",
        role="SCIENCE_VALIDATED_LOCAL",
        kind="elevation",
        resolution_m=5.0,
        units="metres (surface Z)",
        crs_summary="South polar stereographic, Moon sphere a=b=1737.4 km, lon_0=0 (MOON_ME/DE421 product note)",
        attribution=BARKER_CITATION,
        notes="Local GeoTIFF under data/raw/lola/; used by TERRAIN horizon engine.",
        approx_bytes=40_980_810,
        accept_ranges=None,
        local_glob="Site01_final_adj_5mpp_surf.tif",
    ),
    NasaLayer(
        id="lola-site04-5mpp-surf",
        title="LOLA Site04 Shackleton Rim 5 m surface",
        provider="NASA GSFC PGDA",
        product_page=PGDA78,
        source_url=None,
        access_mode="local_file",
        role="SCIENCE_VALIDATED_LOCAL",
        kind="elevation",
        resolution_m=5.0,
        units="metres (surface Z)",
        crs_summary="South polar stereographic, Moon sphere a=b=1737.4 km, lon_0=0 (MOON_ME/DE421 product note)",
        attribution=BARKER_CITATION,
        notes="Local GeoTIFF under data/raw/lola/; used by TERRAIN horizon engine.",
        approx_bytes=40_980_806,
        accept_ranges=None,
        local_glob="Site04_final_adj_5mpp_surf.tif",
    ),
    NasaLayer(
        id="ldem-80s-80mpp-hill",
        title="LDEM 80°S 80 m/pix hillshade (adjusted)",
        provider="NASA GSFC PGDA",
        product_page=PGDA90,
        source_url="https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ_HILL.TIF",
        access_mode="vsicurl_window",
        role="MAP_VISUALIZATION_ONLY",
        kind="hillshade",
        resolution_m=80.0,
        units="unitless hillshade DN (float32)",
        crs_summary="IAU Moon (2015) Sphere south polar stereographic (a=1737400 m)",
        attribution=BARKER_CITATION + f" Product page: {PGDA90}",
        notes=(
            "Remote tiled GeoTIFF; SELENORA serves bounded PNG previews only. "
            "Not used for TERRAIN scoring until far-field horizon validation."
        ),
        approx_bytes=88_474_342,
        accept_ranges=True,
    ),
    NasaLayer(
        id="ldem-80s-80mpp",
        title="LDEM 80°S 80 m/pix elevation (adjusted)",
        provider="NASA GSFC PGDA",
        product_page=PGDA90,
        source_url="https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF",
        access_mode="vsicurl_window",
        role="MAP_VISUALIZATION_ONLY",
        kind="elevation",
        resolution_m=80.0,
        units="metres",
        crs_summary="IAU Moon (2015) Sphere south polar stereographic (a=1737400 m)",
        attribution=BARKER_CITATION + f" Product page: {PGDA90}",
        notes="Remote vsicurl window reads for elevation sampling / previews. Not auto-downloaded.",
        approx_bytes=189_158_392,
        accept_ranges=True,
    ),
    NasaLayer(
        id="ldsm-80s-80mpp",
        title="LDSM 80°S 80 m/pix slope (adjusted)",
        provider="NASA GSFC PGDA",
        product_page=PGDA90,
        source_url="https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDSM_80S_80MPP_ADJ.TIF",
        access_mode="vsicurl_window",
        role="MAP_VISUALIZATION_ONLY",
        kind="slope",
        resolution_m=80.0,
        units="degrees (product documentation)",
        crs_summary="IAU Moon (2015) Sphere south polar stereographic (a=1737400 m)",
        attribution=BARKER_CITATION + f" Product page: {PGDA90}",
        notes="Catalogued; preview enabled with size limits. Verify units in PGDA docs before science use.",
        approx_bytes=241_594_035,
        accept_ranges=True,
    ),
    NasaLayer(
        id="lpsr-80s-20mpp",
        title="LPSR 80°S 20 m/pix permanently shadowed region map",
        provider="NASA GSFC PGDA",
        product_page=PGDA90,
        source_url="https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ.TIF",
        access_mode="vsicurl_window",
        role="MAP_VISUALIZATION_ONLY",
        kind="psr",
        resolution_m=20.0,
        units="categorical / fractional (see PGDA product notes)",
        crs_summary="IAU Moon (2015) Sphere south polar stereographic (a=1737400 m)",
        attribution=BARKER_CITATION + f" Product page: {PGDA90}",
        notes=(
            "~154 MB remote asset with Accept-Ranges. Preview-only until class legend "
            "is verified against PGDA documentation."
        ),
        approx_bytes=154_221_202,
        accept_ranges=True,
    ),
    NasaLayer(
        id="lroc-wac-south-summer",
        title="LROC WAC South Pole Summer Mosaic (Lunaserv)",
        provider="ASU LROC / Lunaserv",
        product_page="https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER",
        source_url="https://webmap.lroc.asu.edu/lunaserv/wms",
        access_mode="wms_allowlisted",
        role="MAP_VISUALIZATION_ONLY",
        kind="imagery",
        resolution_m=None,
        units="unitless DN (visual mosaic)",
        crs_summary=(
            "Direct IAU2000:30120 WMS; lunar south polar stereo "
            "(a=b=1737400 m, lon_0=0, k=1)"
        ),
        attribution=(
            "LROC WAC South Pole Summer Mosaic (WAC_ROI_SOUTH_SUMMER) via ASU Lunaserv "
            "(https://webmap.lroc.asu.edu/). Product: "
            "https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER. "
            "NASA/GSFC/Arizona State University. Static mosaic — not mission-date lighting."
        ),
        notes=(
            "Phase 5E allow-listed WMS layer luna_wac_roi_south_summer "
            "(official RDR WAC_ROI_SOUTH_SUMMER). "
            "Use GET /maps/preview or /maps/imagery/sources. Not used for TERRAIN scoring. "
            "Illumination is baked into the summer mosaic and does not change with analysis epochs."
        ),
        approx_bytes=None,
        accept_ranges=None,
    ),
    NasaLayer(
        id="moon-trek-wac-global",
        title="NASA Moon Trek LRO WAC Global Mosaic (WMTS)",
        provider="NASA Moon Trek",
        product_page=MOON_TREK,
        source_url=(
            "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/"
            "1.0.0/WMTSCapabilities.xml"
        ),
        access_mode="wmts_allowlisted",
        role="REFERENCE_DOC",
        kind="imagery",
        resolution_m=None,
        units=None,
        crs_summary="EPSG:104903 geographic WMTS (EQ) — not polar-stereo aligned for Explorer",
        attribution="NASA Moon Trek — LRO WAC Mosaic Global 303 ppd",
        notes=(
            "Capabilities verified; preview_enabled=false until polar alignment is proven. "
            "See GET /maps/imagery/sources for alignment_status=REFERENCE_ONLY."
        ),
    ),
    NasaLayer(
        id="moon-trek",
        title="NASA Moon Trek interactive portal",
        provider="NASA",
        product_page=MOON_TREK,
        source_url=MOON_TREK,
        access_mode="documentation_only",
        role="REFERENCE_DOC",
        kind="imagery",
        resolution_m=None,
        units=None,
        crs_summary="Portal UI — see moon-trek-wac-global for the verified WMTS capabilities URL",
        attribution="NASA Moon Trek — https://trek.nasa.gov/moon/",
        notes=(
            "Human portal. Machine-readable EQ WMTS is catalogued as moon-trek-wac-global "
            "(REFERENCE_ONLY). Prefer lroc-wac-south-summer for polar Explorer basemap previews."
        ),
    ),
    NasaLayer(
        id="artemis-iii-regions-doc",
        title="Artemis III candidate landing regions (NASA documentation)",
        provider="NASA",
        product_page=ARTEMIS_REGIONS,
        source_url=ARTEMIS_REGIONS,
        access_mode="documentation_only",
        role="REFERENCE_DOC",
        kind="reference",
        resolution_m=None,
        units=None,
        crs_summary="n/a — labels/links only (no fabricated polygons)",
        attribution="NASA news releases: 2022 thirteen regions + 2024 nine-region update",
        notes=(
            "See GET /api/v1/artemis/regions for historical_2022 vs current_2024_shortlist "
            "classifications. Do not treat 2022 labels as the current Artemis III plan."
        ),
    ),
)


def get_layer(layer_id: str) -> NasaLayer | None:
    for layer in LAYERS:
        if layer.id == layer_id:
            return layer
    return None


def list_layers() -> tuple[NasaLayer, ...]:
    return LAYERS
