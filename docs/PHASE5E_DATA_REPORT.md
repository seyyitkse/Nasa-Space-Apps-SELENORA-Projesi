# SELENORA — Phase 5E Data Completion Report

**Branch:** `feature/phase5e-data-completion`  
**Baseline:** `94aaac3` (`phase5c-integration-rc1`)  
**Scope:** Backend data services, API schemas, and tests only (no frontend edits)  
**Date:** 2026-11-14

---

## 1. Summary

Phase 5E closes the R1 epochs gap, adds allow-listed lunar imagery metadata/previews, extends the mesh JSON contract, and corrects Artemis region provenance for the 2022→2024 NASA shortlist update.

| Item | Status |
|------|--------|
| `GET /api/v1/analyses/{id}/epochs` | Done — stored Az/El → authoritative states |
| LROC Lunaserv WMS research | Done — south-summer WAC allow-listed + warped preview |
| Moon Trek WMTS research | Done — EQ WAC capabilities verified; **not** Explorer basemap |
| `GET /api/v1/maps/mesh` schema | Done — grid/NoData/CRS/reference elevation |
| Artemis 2022 vs 2024 provenance | Done — classifications + source dates |
| Backend pytest | All green on this branch |

---

## 2. P0 — Authoritative per-epoch states

### Endpoint

`GET /api/v1/analyses/{analysis_id}/epochs`

### Behaviour

- Reads persisted `visibility_timelines` (SUN + EARTH Az/El arrays).
- **Does not** call JPL Horizons again.
- GEOMETRIC: `VISIBLE` iff elevation > 0°; else `BLOCKED`; missing → `UNKNOWN`.
- TERRAIN: recomputes `body_vs_terrain` against local LOLA; incomplete DEM coverage → `UNKNOWN` (never inferred clear sky).
- `joint_state`: both VISIBLE → `VISIBLE`; any UNKNOWN → `UNKNOWN`; else `NOT_VISIBLE`.
- Duration: `hold_hours` from `[t, end_utc)` sample-and-hold; `contributes_duration=false` when `t >= end_utc`.

### Contract for Claude

Documented in `docs/FRONTEND_DATA_REQUIREMENTS.md` (Phase 5E section) and `app/schemas/epochs.py`.

Example shape:

```json
{
  "analysis_id": "…",
  "horizon_model": "TERRAIN",
  "duration_semantics": "[start_utc, end_utc)",
  "sites": [{
    "label": "Point A",
    "samples": [{
      "t": "2026-12-01T00:00:00Z",
      "sun_azimuth_deg": 86.07,
      "sun_elevation_deg": 1.49,
      "earth_azimuth_deg": 172.67,
      "earth_elevation_deg": -1.93,
      "sun_state": "BLOCKED",
      "earth_state": "BLOCKED",
      "joint_state": "NOT_VISIBLE",
      "sun_terrain_horizon_deg": 12.66,
      "earth_terrain_horizon_deg": -1.27,
      "hold_hours": 1.0,
      "contributes_duration": true
    }]
  }]
}
```

---

## 3. P1 — Lunar imagery research

### LROC Lunaserv WMS

| Check | Result |
|-------|--------|
| Entry | https://data.lroc.im-ldi.com/lroc/ · https://webmap.lroc.asu.edu/lunaserv |
| Capabilities | `GET …/lunaserv/wms?SERVICE=WMS&REQUEST=GetCapabilities` (verified) |
| Polar layer | `luna_wac_roi_south_summer` — “LROC WAC South Pole Summer Mosaic” |
| SRS | Parent lists EPSG:4326 + many IAU2000 codes; GetMap exercised with EPSG:4326 |
| Formats | `image/png` (GetMap) |
| Alignment approach | Lon/lat envelope of stereo window → WMS → warp to SELENORA stereo (`a=b=1737400`) |
| Advertised? | **Yes** as `lroc-wac-south-summer` (`MAP_VISUALIZATION_ONLY`, `preview_enabled=true`) |

### NASA Moon Trek WMTS

| Check | Result |
|-------|--------|
| Entry | https://trek.nasa.gov/tiles/ |
| Capabilities | `…/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml` (HTTP 200) |
| Layer id | `LRO_WAC_Mosaic_Global_303ppd_v02` |
| CRS | `EPSG:104903` geographic; JPEG tiles; TileMatrixSet `default028mm` |
| Polar stereo product | No verified south-polar WMTS layer found under `/Moon/SP/…` in this pass |
| Advertised as basemap? | **No** — `moon-trek-wac-global` is `REFERENCE_ONLY` / `preview_enabled=false` |

### Safety

- Allow-list only (`imagery_service.SOURCES`); caller cannot supply arbitrary URLs.
- Request timeout, response-type checks, process-local TTL cache, size caps.
- Unaligned Trek preview → `503 LAYER_UNAVAILABLE`.

### API

- `GET /api/v1/maps/imagery/sources`
- `GET /api/v1/maps/preview?layer_id=lroc-wac-south-summer&…` (PNG + `X-SELENORA-Bounds-M`)

---

## 4. P1 — Mesh endpoint

`GET /api/v1/maps/mesh` now returns a typed `MeshResponse`:

- `crs_summary`, `crs_proj4`
- `extent_m`, `grid.{nx,ny,n_cells}`
- `x_m`, `y_m`, `z_m` (null = NoData)
- `nodata_mask`, `nodata_fraction`
- `elevation_units`, `reference_elevation_m`, `z_min_m`, `z_max_m`
- `sampling_resolution_m`, attribution/source fields
- Density guard: ≤ 20 000 cells; half-extent ≤ 5 km

Values are real DEM samples only.

---

## 5. P0 — Artemis provenance

NASA Oct 2024 update narrowed the Artemis III candidate set from **13 (2022)** to **9 (2024-10-28)**.

`GET /api/v1/artemis/regions` now includes:

- `historical_2022_regions` (13) — `classification=ARTEMIS_III_2022_CANDIDATE`
- `current_2024_shortlist` (9) — `classification=ARTEMIS_III_2024_SHORTLIST`
- Combined `regions[]` with the same fields
- `architecture_note` — do not present 2022 as the current plan
- Official URLs for 2022 release, 2024 release, NTRS abstract
- `polygon` / `geometry` always `null`
- SELENORA seed sites remain distinct APPROXIMATE_REFERENCE points

2024 nine: Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain.

---

## 6. Tests

New: `backend/tests/test_phase5e_epochs_imagery.py`

Covers: geometric/joint helpers, epochs duration boundaries, Artemis classifications, imagery allow-list / reference-only rejection, mocked WMS warp preview, mesh NoData/grid caps, catalog membership.

Full suite on this branch: **117 passed, 1 skipped** (skip when DEM absent in a narrow case).

---

## 7. Files touched (backend + docs)

- `app/schemas/epochs.py` (new)
- `app/services/epochs_service.py` (new)
- `app/services/imagery_service.py` (new)
- `app/services/artemis_regions.py`
- `app/services/nasa_layer_catalog.py`
- `app/services/raster_preview_service.py` (`build_mesh`)
- `app/api/v1/analyses.py`, `app/api/v1/maps.py`
- `tests/test_phase5e_epochs_imagery.py` (new)
- `docs/FRONTEND_DATA_REQUIREMENTS.md`, `docs/PHASE5E_DATA_REPORT.md`

---

## 8. Out of scope / handoff

- No frontend component changes (Claude owns SPA wiring to `/epochs` and imagery).
- No merge of other agents’ branches.
- No competition submission.
- Moon Trek EQ WMTS remains documentation-only until a polar-aligned product is validated.
