# SELENORA — Frontend ↔ Backend Data Contract (Phase 5C integrated)

**Audience:** Integrated SPA + API (`feature/phase5c-integration`)  
**Merged from:** Phase 5B NASA data services + Phase 5A frontend experience  
**Preserved science:** Geometric `0.3.1-phase3.3` · Terrain `0.4.1-phase4.1-validation`  
**Date:** 2026-11-14

This document is the authoritative integrated contract. Frontend consumes these APIs; backend owns schemas and scientific labels.

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

## Phase 5E — authoritative epochs (R1 closed)

### `GET /api/v1/analyses/{analysis_id}/epochs`

Built from stored `visibility_timelines` (full Az/El). **No new Horizons request.**

Top-level fields: `analysis_id`, `mission_name`, `horizon_model`, `data_quality`,
`algorithm_version`, `start_utc`, `end_utc`, `time_step_minutes`, `sample_count_per_site`,
`duration_semantics` (always `"[start_utc, end_utc)"`), `sites[]`, `provenance[]`, `limitations[]`.

Per site: `label`, lon/lat, optional `dem_site_id`, `terrain_complete_coverage_fraction`,
`true_north_grid_azimuth_deg`, `samples[]`.

Per sample:

| Field | Notes |
|-------|--------|
| `t` | UTC timestamp |
| `sun_azimuth_deg` / `sun_elevation_deg` | Stored Horizons values (nullable) |
| `earth_azimuth_deg` / `earth_elevation_deg` | Stored Horizons values (nullable) |
| `sun_state` / `earth_state` | `VISIBLE` \| `BLOCKED` \| `UNKNOWN` |
| `joint_state` | `VISIBLE` \| `NOT_VISIBLE` \| `UNKNOWN` |
| `sun_terrain_horizon_deg` / `earth_terrain_horizon_deg` | TERRAIN only |
| `sun_geometric_state` / `earth_geometric_state` | Always: el>0 → VISIBLE else BLOCKED (NaN→UNKNOWN) |
| `hold_hours` | Sample-and-hold clamped to `[t, end)` |
| `contributes_duration` | `false` when `t >= end_utc` (inclusive STOP contributes 0 h) |

**Rules:** incomplete DEM coverage → `UNKNOWN` (never inferred clear sky). Prefer this endpoint over deriving states from darkness/communication windows.

### Imagery (Phase 5E)

- `GET /api/v1/maps/imagery/sources` — allow-listed Lunaserv / Moon Trek metadata + `alignment_status`
- `GET /api/v1/maps/preview?layer_id=lroc-wac-south-summer&…` — polar-stereo-warped PNG when `preview_enabled`
- `moon-trek-wac-global` is `REFERENCE_ONLY` (EQ WMTS; not Explorer basemap)

### Mesh (Phase 5E schema)

`GET /api/v1/maps/mesh` returns `grid.{nx,ny,n_cells}`, `extent_m`, `nodata_mask`,
`reference_elevation_m`, `elevation_units`, `crs_proj4`, `warning`. No fabricated Z values.

### Artemis (Phase 5E provenance)

`GET /api/v1/artemis/regions` includes `historical_2022_regions` (13) and
`current_2024_shortlist` (9) with `classification` + `source_date`. Combined `regions[]`
carries the same fields. `polygon` / `geometry` always null.

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
---

## Phase 5C integration verification (2026-11-14)

Verified on `feature/phase5c-integration` (isolated worktree, DB copy `selenora.phase5c.db`, API `:8001`, SPA `:5175`):

| Check | Result |
|---|---|
| CORS for SPA origin | `Access-Control-Allow-Origin: http://127.0.0.1:5175` |
| `/maps/layers` roles + attribution | 8 layers; SCIENCE / VIZ / REFERENCE badges in Explorer |
| `/maps/preview` PNG + `X-SELENORA-Bounds-M` | OK (hillshade overlay) |
| `/maps/elevation` Site04 Point A | Z ≈ 1592.04 m |
| `/terrain/horizon-profile` Point A | `LOCAL_TERRAIN_PARTIAL`, γ ≈ 194°, el@az86 ≈ 13.05° |
| `/ephemeris/observer-series` | OK with `end_utc`; live Δ vs stored = 0.0000° on TERRAIN run |
| `/artemis/regions` | 13 names; `geometry` always null |
| TERRAIN analysis ranking | Refused under `LOCAL_TERRAIN_PARTIAL`; scores null / UNRANKED |
| DeepSeek explain | Cached read OK (key server-side only) |
---
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
---
---

## Phase 5D frontend requests for Cursor (appended 2026-11-14)

Frontend branch: `feature/phase5d-immersive-ux` (from `94aaac3`). Capability detection is unchanged: a feature
turns on only when its exact path appears in `/openapi.json`.

### `GET /api/v1/maps/mesh` — consumed (verified; no change required)

Verified behaviour that the 3D viewer relies on (please keep stable):
- `x_m[cols]`, `y_m[rows]` absolute south-polar stereographic metres; `z_m[row][col]` with rows by ascending y.
- Centre and corner cells equal `GET /maps/elevation` exactly (checked at Point A: 1592.04 m; corners 1198.28 m / 355.88 m).
- Out-of-tile cells are `null` (never 0). Point B needs `layer_id=lola-site01-5mpp-surf` (the frontend picks the layer
  from `/terrain/coverage.dem_site_id`).
- Guards: `half_extent_m ≤ 5000`, `step_m ∈ [10, 500]`, ≤ 20 000 vertices. Presets used: 2 km/25 m, 4 km/50 m, 10 km/100 m.

Nice-to-have: state the sampling method in the response (`"sampling": "nearest_pixel"`), and add `observer_z_m`
plus `true_north_grid_azimuth_deg` so the client does not need two extra calls.

### R1 (still P0) — authoritative per-epoch states for stored analyses

`GET /api/v1/analyses/{analysis_id}/epochs` (shape unchanged from the Phase 5A request): per sample
`sun_/earth_azimuth_deg`, `sun_/earth_elevation_deg`, `sun_/earth_terrain_horizon_deg`, `sun_/earth_state ∈
VISIBLE | BLOCKED | BELOW_HORIZON | UNKNOWN`, no downsampling (or paginated).
Why: Explorer Mode explains each moment in plain language. Without R1 the UI must say "visible or unknown" for some
TERRAIN moments and fetch live `/ephemeris/observer-series` chunks to place the Sun in 3D. With R1 the 3D Sun
direction and every timeline cell would come from the stored, reproducible analysis.

### R2 (P1) — LROC photographic basemap

The Explorer's Photo/Hillshade/Off control enables **Photo** automatically when `GET /api/v1/maps/layers` lists a
layer with `kind: "imagery"` whose `role` is not `REFERENCE_DOC` and whose `access_mode` is not
`documentation_only`. It is rendered through the existing preview contract:
- `GET /api/v1/maps/preview?layer_id=<id>&left_m&bottom_m&right_m&top_m&max_edge_px` → `image/png`.
- Required headers: `X-SELENORA-Bounds-M` (the client refuses to place an image without it),
  `X-SELENORA-Attribution` (shown on the map), `X-SELENORA-Layer-Role`.
- CRS: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m` (reproject server-side;
  LROC polar mosaics use a different sphere/ellipsoid convention, so please state the reprojection in `crs_summary`).
- Suggested metadata: `resolution_m`, `product_page` (LROC/PDS URL), `notes` with acquisition/illumination caveats
  (photos show illumination at image time, not at the analysis epoch).

Until then the Photo option is disabled with the reason. No decorative image is substituted.

---

## Phase 5F consumption (2026-11-14)

On `feature/phase5f-immersive-integration` (5E + 5D merge):

| Route | Frontend use | Status |
|---|---|---|
| `GET /api/v1/analyses/{id}/epochs` | Simulator, Windows, Comparison, Guided lanes — authoritative VISIBLE/BLOCKED/UNKNOWN | ✅ consumed |
| `GET /api/v1/maps/preview?layer_id=lroc-wac-south-summer` | Explorer Photo basemap (warped stereo PNG) | ✅ consumed |
| `GET /api/v1/maps/imagery/sources` | Capability / documentation (allow-list metadata) | available |
| `GET /api/v1/artemis/regions` | Explorer: 2024 shortlist + 2022 historical lists | ✅ consumed |

Static LROC illumination disclaimer is shown whenever Photo is active. Live Horizons observer-series is skipped when `/epochs` supplies Az/El.
