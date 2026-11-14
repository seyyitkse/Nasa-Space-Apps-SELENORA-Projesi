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

---

## Phase 5A frontend consumption status (appended by the frontend, 2026-11-14)

The SPA detects routes from the live `GET /openapi.json` (`frontend/src/services/contracts.ts → useCapabilities`)
and only calls a route that the running backend lists. Missing routes produce a labelled UNAVAILABLE state.
Fixtures appear only in unit tests.

| Route | Frontend use | Status (verified against a running Phase 5B backend, isolated DB copy) |
|---|---|---|
| `GET /api/v1/maps/layers` | Explorer layer dock; role badges (Science DEM / Visualization only); `REFERENCE_DOC` rendered as links | ✅ consumed |
| `GET /api/v1/maps/preview` | Raster overlay for the current view (≤ 50 km half-extent, snapped to 1 km); image placed **only** at `X-SELENORA-Bounds-M` (refused if header missing) | ✅ consumed (LDEM hillshade verified: Shackleton bowl aligns with marker) |
| `GET /api/v1/maps/elevation` | — (Explorer uses `/terrain/coverage` for point heights) | not used yet |
| `GET /api/v1/maps/mesh` | — (3D viewer not built) | not used yet |
| `GET /api/v1/terrain/catalog` | LOLA tile footprints drawn from `bounds_m` | ✅ consumed |
| `GET /api/v1/terrain/coverage` | Explorer inspector: surface height, tile, stereo x/y | ✅ consumed |
| `GET /api/v1/terrain/horizon-profile` | Simulator 360° panorama (`n_azimuth=360`): no-data bins → UNKNOWN gaps, `complete_coverage=false` → "partial ray" shading | ✅ consumed |
| `GET /api/v1/ephemeris/observer-series` | Simulator per-epoch Sun/Earth azimuth + live terrain state, fetched in 24 h chunks aligned to the stored analysis grid; matched by exact timestamp; elevation compared with stored timeline (Δ shown) | ✅ consumed (Δ = 0.0000° on test analysis) |
| `GET /api/v1/artemis/regions` | Explorer panel: names + official links only, no geometry | ✅ consumed |

### Remaining frontend requests

**R1 — per-sample stored states: `GET /api/v1/analyses/{id}/epochs` (P0 for exact lanes/heatmaps).**
`TimelinePoint` still lacks azimuth and per-sample terrain state. The frontend therefore derives terrain
states from `darkness_windows` / `communication_gaps` (which contain only *known* non-visible samples):
- inside a window → BLOCKED (geometric > 0°) or BELOW_HORIZON;
- outside → VISIBLE only if the site's `*_unknown_fraction == 0` and the list has < 50 windows; otherwise
  **UNRESOLVED** ("visible or unknown");
- samples at/after `end_utc` are excluded (zero-duration hold, never in a window).

Note: for a terrain-blocked body that is also below 0°, the derived label is BELOW_HORIZON while the
backend per-epoch label is BLOCKED (e.g. Earth −1.93° under a −1.27° terrain horizon). The Simulator prefers
the live `observer-series` state when available. Exposing the stored per-sample `sun_state` / `earth_state`
(+ azimuths, already persisted in `VisibilityTimeline`) would remove both the ambiguity and the live
Horizons round-trip:

```json
{ "analysis_id": "uuid", "horizon_model": "TERRAIN",
  "sites": [ { "label": "…", "samples": [
    { "t": "2026-12-01T00:00:00Z", "sun_azimuth_deg": 86.07, "sun_elevation_deg": 1.49,
      "earth_azimuth_deg": 172.67, "earth_elevation_deg": -1.93,
      "sun_terrain_horizon_deg": 12.66, "earth_terrain_horizon_deg": -1.27,
      "sun_state": "BLOCKED", "earth_state": "BLOCKED" } ] } ] }
```

**R2 — imagery basemap.** `moon-trek` is `REFERENCE_DOC` only, so the "Lunar image basemap" switch stays
unavailable. A previewable LROC/WAC south-polar mosaic layer (same preview contract) would enable it.

**R3 — preview window cap.** `/maps/preview` rejects half-extents > 50 km. At polar zoom the UI shows only a
100 km window around the view centre (labelled). A coarse whole-cap preview (e.g. ≤ 400 km half-extent at
low `max_edge_px`) would let the overview show context.

**R4 — 3D.** `/maps/mesh` exists. The frontend has not built the optional viewer yet (P2). It will show the
mesh `warning`, resolution and vertical exaggeration when implemented.
