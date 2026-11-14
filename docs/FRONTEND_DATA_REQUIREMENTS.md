# SELENORA — Frontend ↔ Backend Data Contract (Phase 5B)

**Audience:** Claude (Frontend Phase 5A) + Cursor (Backend Phase 5B)  
**Backend branch:** `feature/phase5b-nasa-data-services`  
**Preserved science:** Geometric `0.3.1-phase3.3` · Terrain `0.4.1-phase4.1-validation`  
**Date:** 2026-11-14

This document is the integration contract. Frontend should consume these APIs; backend owns schemas and scientific labels.

---

## Design principles

1. **Never download raw GeoTIFFs in the browser.** Use PNG previews / JSON samples only.
2. Distinguish **`SCIENCE_VALIDATED_LOCAL`** vs **`MAP_VISUALIZATION_ONLY`** vs **`REFERENCE_DOC`**.
3. Historical seeds (Point A/B) ≠ Artemis III official region footprints.
4. Terrain VISIBLE requires complete DEM ray coverage; otherwise BLOCKED or UNKNOWN.
5. Geometric MVP remains the competition-safe default analysis mode.

---

## Base URL

`http://localhost:8000` (dev) · all routes under `/api/v1` unless noted.

---

## Map layers

### `GET /api/v1/maps/layers`

Returns catalog + `scientific_note`.

Key fields per item: `id`, `title`, `role`, `kind`, `resolution_m`, `units`, `crs_summary`, `attribution`, `access_mode`, `approx_bytes`, `notes`.

**Roles**

| Role | Frontend use |
|------|----------------|
| `SCIENCE_VALIDATED_LOCAL` | May label as science-grade local DEM; feeds TERRAIN analyses |
| `MAP_VISUALIZATION_ONLY` | Explorer backdrop / hillshade / PSR preview only |
| `REFERENCE_DOC` | Link out (Moon Trek, Artemis docs) — no raster |

### `GET /api/v1/maps/layers/{layer_id}`

Single layer metadata.

### `GET /api/v1/maps/preview`

Query params:

- `layer_id` (required)
- `latitude_deg`, `longitude_deg`, `half_extent_m` **or** `left_m,bottom_m,right_m,top_m`
- `max_edge_px` (64–1024, default 512)

Response: **`image/png`**

Headers:

- `X-SELENORA-Layer-Id`
- `X-SELENORA-Layer-Role`
- `X-SELENORA-Bounds-M` — `left,bottom,right,top` stereo metres
- `X-SELENORA-Size-Px`
- `X-SELENORA-Attribution`

Errors: `400 MAP_SERVICE_ERROR`, `404 LAYER_NOT_FOUND`, `503 LAYER_UNAVAILABLE`.

### `GET /api/v1/maps/elevation`

Point sample: `latitude_deg`, `longitude_deg`, optional `layer_id` (default `lola-site04-5mpp-surf`).

### `GET /api/v1/maps/mesh`

Downsampled XYZ JSON for optional 3D (`half_extent_m` ≤ 5000, density guard). Always show mesh `warning` in UI.

---

## Terrain / horizon simulator

### `GET /api/v1/terrain/catalog` · `GET /api/v1/terrain/coverage`

Existing Phase 4 endpoints.

### `GET /api/v1/terrain/horizon-profile`

True-north azimuth bins with:

- `has_any_data`, `complete_coverage`, `valid_range_m`
- `true_north_grid_azimuth_deg`
- `quality_label` (`LOCAL_TERRAIN_PARTIAL` expected on Site01/04 @ 12 km)

Use for polar horizon plot (0–360°).

### `GET /api/v1/ephemeris/observer-series`

Live Horizons Sun/Earth Az/El (+ optional terrain states).

Limits: span ≤ **72 h**, step ≥ **30 min**.

When `include_terrain_states=true` and DEM covers the site, each point may include:

- `sun_state` / `earth_state`: `VISIBLE` | `BLOCKED` | `UNKNOWN`
- `sun_terrain_horizon_deg` / `earth_terrain_horizon_deg`

`data_quality` may be `LOCAL_TERRAIN_PARTIAL` — UI must not present as full-sky certified terrain.

**Note:** This endpoint hits JPL Horizons; cache/debounce in the UI; show loading/error states.

---

## Artemis reference

### `GET /api/v1/artemis/regions`

- Region **names** + official NASA URLs
- `geometry: null`, `polygon: null` always
- Do **not** draw fake footprints

---

## Existing analysis / AI (unchanged contracts)

- `POST /api/v1/analyses` — default `horizon_model=GEOMETRIC`
- `GET /api/v1/analyses/{id}` — includes `terrain` + `geometric_comparison` when TERRAIN
- `POST /api/v1/analyses/{id}/explain` — DeepSeek after science completes

---

## Suggested Explorer 2.0 wiring

1. Layer picker from `/maps/layers` with role badges.
2. South-pole hillshade via `/maps/preview?layer_id=ldem-80s-80mpp-hill&…` (viz only).
3. Site select → `/terrain/coverage` + `/maps/elevation`.
4. Horizon panel → `/terrain/horizon-profile`.
5. Time scrubber → `/ephemeris/observer-series` (short window).
6. Artemis panel → `/artemis/regions` as text/links.

---

## Attribution (minimum)

Always surface layer `attribution` / response headers for LOLA/PGDA and Horizons when those data are shown.

---

## Out of scope for this contract

- Frontend React edits (Claude Phase 5A owns UI).
- Automatic multi-GB DEM downloads.
- Enabling TERRAIN scoring from Product 90 without a new science validation phase.
