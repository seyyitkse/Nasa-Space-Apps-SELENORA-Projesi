# SELENORA — Phase 5B NASA Geospatial Data & Frontend API Support

**Branch:** `feature/phase5b-nasa-data-services`  
**Base:** Phase 4.1 tag `phase4.1-terrain-science-validation` (`b3d314d`)  
**Date:** 2026-11-14  
**Frontend:** not modified (Claude Phase 5A owns React)

---

## 1. Sources evaluated

| Source | URL | Status |
|--------|-----|--------|
| PGDA Product 78 (local 5 m sites) | https://pgda.gsfc.nasa.gov/products/78 | **In use** (Site01/04 local) |
| PGDA Product 90 (large-area LOLA) | https://pgda.gsfc.nasa.gov/products/90 | **Catalogued + vsicurl previews** |
| NASA Moon Trek | https://trek.nasa.gov/moon/ | Documentation / reference only (no tile proxy) |
| LROC imagery | via Moon Trek / LROC portals | Not embedded — interface not contracted |
| Artemis III candidate regions | [NASA news release](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/) | Labels + links only |
| JPL Horizons | existing client | Unchanged; new short series API |

**Attribution / licence posture:** NASA public science data; cite Barker et al. 2021 + PGDA product pages; do not strip attribution headers.

---

## 2. Verified Product 90 assets (HEAD 2026-11-14)

All listed files returned `200`, `Accept-Ranges: bytes`, `Content-Type: image/tiff`.

| File | Bytes | ~Size | SELENORA role |
|------|------:|------:|---------------|
| `LDEM_80S_80MPP_ADJ_HILL.TIF` | 88 474 342 | ~84 MB | Map hillshade preview (vsicurl) |
| `LDEM_80S_80MPP_ADJ.TIF` | 189 158 392 | ~180 MB | Viz elevation sample/preview |
| `LDSM_80S_80MPP_ADJ.TIF` | 241 594 035 | ~230 MB | Slope preview (catalogued) |
| `LPSR_80S_20MPP_ADJ.TIF` | 154 221 202 | ~147 MB | PSR preview (catalogued) |

**Not downloaded into the repo.** Remote window reads via GDAL `/vsicurl/` (tiled 512×512 blocks verified on hillshade).

Local science DEMs (already present, gitignored):

| File | Bytes |
|------|------:|
| `Site01_final_adj_5mpp_surf.tif` | 40 980 810 |
| `Site04_final_adj_5mpp_surf.tif` | 40 980 806 |

---

## 3. New / extended endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/maps/layers` | Layer catalog + roles |
| GET | `/api/v1/maps/layers/{id}` | Layer metadata |
| GET | `/api/v1/maps/preview` | Bounded **PNG** preview |
| GET | `/api/v1/maps/elevation` | Point sample |
| GET | `/api/v1/maps/mesh` | Downsampled XYZ JSON |
| GET | `/api/v1/terrain/horizon-profile` | True-north horizon bins |
| GET | `/api/v1/ephemeris/observer-series` | Horizons Az/El ± terrain states |
| GET | `/api/v1/artemis/regions` | Official region **labels** (no polygons) |

Contract details: `docs/FRONTEND_DATA_REQUIREMENTS.md`.

---

## 4. Example responses (tested)

### Layer list (excerpt)

`GET /api/v1/maps/layers` → items include `lola-site04-5mpp-surf` with `role=SCIENCE_VALIDATED_LOCAL` and `ldem-80s-80mpp-hill` with `role=MAP_VISUALIZATION_ONLY`.

### Local preview

`GET /api/v1/maps/preview?layer_id=lola-site04-5mpp-surf&latitude_deg=-89.68&longitude_deg=-166&half_extent_m=2000&max_edge_px=128`  
→ `200 image/png`, header `X-SELENORA-Layer-Role: SCIENCE_VALIDATED_LOCAL`.

### Horizon profile

`GET /api/v1/terrain/horizon-profile?latitude_deg=-89.68&longitude_deg=-166&n_azimuth=36&max_range_m=5000`  
→ `true_north_grid_azimuth_deg ≈ 194`, bins with `has_any_data` / `complete_coverage`.

### Artemis

`GET /api/v1/artemis/regions` → `geometry: null`, names include Connecting Ridge, Malapert Massif, … (list from NASA HTML 2026-11-14).

---

## 5. CRS / datum decisions

- Local Site01/04 + Product 90 south-polar stereo on **1737.4 km** lunar sphere, `lon_0=0`.
- Product 90 CRS WKT reports IAU Moon (2015) Sphere / south polar (authority IAU 30135) — compatible stereo metres for viz overlays.
- Horizon API retains Phase 4.1 **true-north** convergence.
- **No** DE421↔DE441 silent shift; **no** Product 90 → TERRAIN scoring promotion.

Quality split:

- Map viz → `MAP_VISUALIZATION_ONLY`
- Validated terrain visibility → local 5 m + Phase 4.1 engine only

---

## 6. Tests

| Suite | Result |
|-------|--------|
| Prior science regression | must remain green |
| New `tests/test_maps_phase5b.py` | catalog roles, Artemis no polygons, local PNG preview, elevation, horizon-profile, size guards |
| Optional `@pytest.mark.live` | remote hillshade vsicurl preview |

Run: `pytest` (default skips live) · `pytest -m live -o addopts=` for network preview.

---

## 7. Frontend integration instructions

1. Read `docs/FRONTEND_DATA_REQUIREMENTS.md`.
2. Wire Explorer layer picker to `/maps/layers`.
3. Use PNG `/maps/preview` for hillshade/DEM backdrops.
4. Horizon simulator: `/terrain/horizon-profile` + `/ephemeris/observer-series`.
5. Artemis panel: text/links only from `/artemis/regions`.
6. Do not treat viz layers as scoring inputs.

---

## 8. Performance (measured)

| Operation | Observation |
|-----------|-------------|
| vsicurl open + 64×64 hillshade window | ~1.8 s first hit (network) |
| Local Site04 128 px PNG preview | typically &lt; 1 s |
| Caps | `max_edge_px≤1024`, `half_extent_m≤50 km`, mesh density guard |

---

## 9. Scientific limitations

1. Product 90 previews ≠ validated far-field terrain visibility.
2. Moon Trek / LROC tiles not proxied (no verified WMTS contract in 5B).
3. Artemis polygons intentionally absent.
4. `/ephemeris/observer-series` is live Horizons — rate-limit in UI.
5. PSR class legend not fully decoded — preview only.
6. Geometric + Terrain analysis engines unchanged in scoring semantics.

---

## 10. Competition note

Preserve jury demo on **GEOMETRIC** analysis (`phase3.3` / `phase4.1` tags). Phase 5B adds map/data APIs for Explorer 2.0 without destabilizing the scientific MVP.

SELENORA — Explore the Moon. Understand the Evidence. Plan with Confidence.
