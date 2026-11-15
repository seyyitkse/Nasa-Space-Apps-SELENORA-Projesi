# Phase 7D MVP Report — Multi-resolution NASA LOLA terrain fallback

**Branch:** `feature/phase7d-dem-mvp`  
**Worktree:** `.worktrees/phase7d-mvp`  
**Base:** `origin/main` @ `6e283a021d06490da9ded29a413a4fb36099d827`  
**Date:** 2026-11-15 (Türkiye)  
**Verdict: READY**

### Commits on this branch

1. `c5235bf` — feat(phase7d): add multi-resolution Product 90 DEM mesh fallback  
2. `44bfdac` — feat(phase7d): show remote DEM provenance in 3D terrain UI  
3. `34b9c00` — docs(phase7d): add MVP readiness report and browser evidence  
4. `ace0aa2` — chore(phase7d): remove runtime server logs from evidence  
(+ docs-only follow-ups may appear after this list; see `git log origin/main..HEAD`)

---

## Scope (what this MVP is / is not)

| In scope | Out of scope |
|---|---|
| 3D mesh visualization multi-resolution DEM fallback | Multi-resolution distant **horizon** analysis (7D.3 / 7D.4) |
| Local Product 78 5 m preservation | Changes to TERRAIN scoring / illumination classification |
| Remote Product 90 elevation COG window reads | Using hillshade / WAC / synthetic heights as elevation |
| Provenance + native resolution in mesh API + UI | Merge/push to `main` |

Scientific safety: operational terrain-horizon engine (`terrain_data_service.get_horizon_profile`) remains **local Product 78 only**. Outside local tiles it still returns `TERRAIN_UNAVAILABLE` — no silent fake horizons.

---

## NASA Product 78 / 90 URL verification

### Product 78 — High-Resolution LOLA Topography for Lunar South Pole Sites

- Product page: [https://pgda.gsfc.nasa.gov/products/78](https://pgda.gsfc.nasa.gov/products/78)
- Role in SELENORA: local Site01 / Site04 **5 m/pix** GeoTIFFs under `data/raw/lola/` (science-validated local DEM for horizons + preferred mesh source when covered)
- HEAD check (2026-11-15): product page returns HTML `200`

### Product 90 — A New View of the Lunar South Pole from LOLA

- Product page: [https://pgda.gsfc.nasa.gov/products/90](https://pgda.gsfc.nasa.gov/products/90)
- Official note: all TIF files are **cloud-optimized GeoTIFFs (COGs)** in south polar stereographic metres, MOON_ME / DE421
- Verified elevation COG URLs (HTTP HEAD + `Accept-Ranges: bytes`, 2026-11-15):

| Layer id | URL | Bytes | Ranges |
|---|---|---:|---|
| `ldem-80s-20mpp` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF | 2 696 082 051 | bytes |
| `ldem-80s-40mpp` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_40MPP_ADJ.TIF | 716 299 920 | bytes |
| `ldem-80s-80mpp` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF | 189 158 392 | bytes |
| `ldem-75s-30mpp` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_75S_30MPP_ADJ.TIF | 2 802 850 273 | bytes |
| `ldem-60s-60mpp` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_60MPP_ADJ.TIF | 3 089 110 093 | bytes |
| `ldem-60s-120mpp` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_120MPP_ADJ.TIF | 821 504 895 | bytes |
| `ldem-60s-240mpp` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF | 218 961 039 | bytes |

Range probe on `LDEM_80S_80MPP_ADJ.TIF`: HTTP `206 Partial Content`, `Content-Range: bytes 0-16383/189158392`, TIFF/BigTIFF signature intact.

**Sources:** PGDA product pages above; live HEAD/Range checks from this worktree on 2026-11-15. Bright Data MCP auth was unavailable in-session; Exa fetch + direct HTTP verification were used.

---

## What was implemented

### Backend

- `backend/app/services/dem_mesh_resolver.py` — multi-resolution elevation resolver (local 5 m → Product 90 ladder), GDAL/vsicurl safeguards, no hillshade-as-height
- `backend/app/services/nasa_layer_catalog.py` — catalogued additional Product 90 **elevation** COGs
- `backend/app/services/raster_preview_service.py` — `build_mesh(layer_id="auto")` + provenance fields; hillshade rejected for physical mesh
- `backend/app/api/v1/maps.py` — mesh schema: `coverage_tier`, `native_resolution_m`, `surface_z_m`, `product_page`, …
- `backend/tests/test_phase7d_dem_mvp.py` — unit + live regression tests

### Frontend

- `frontend/src/features/terrain3d/mesh.ts` — `meshLayerForRequest`, `meshSourceLabel`
- `frontend/src/features/terrain3d/Terrain3DPanel.tsx` — auto remote fallback + provenance UI
- `frontend/src/services/contracts.ts` — mesh provenance types
- `frontend/src/i18n/locales/phase5d.en.ts` / `phase5d.tr.ts` — native DEM / remote height copy
- `frontend/src/features/terrain3d/mesh.test.ts` — Phase 7D unit coverage

### Safeguards

- Mesh half-extent ≤ 5 km; ≤ 20 000 vertices; step ∈ [10, 500] m
- GDAL HTTP timeout 45 s, connect 15 s, max retry 2
- VSIL curl / VSI cache capped (~64 MiB); `GDAL_CACHEMAX=256`
- First-pass skips multi-GB COGs; second pass only if needed
- Soft per-candidate timeout; max 5 remote probes
- Network / missing coverage → `LAYER_UNAVAILABLE` (no invented heights)
- Hillshade layers cannot build elevation meshes

---

## Test results

### Backend (worktree, local LOLA hardlinks present)

```text
pytest tests/test_phase7d_dem_mvp.py -q
.......                                                                  [100%]

pytest tests/test_phase7d_dem_mvp.py -m live -q
.                                                                        [100%]
```

Live mesh at (−88.5°, 0°): `coverage_tier=REMOTE_PGDA90`, real `surface_z_m≈-1416.9`, `nodata_fraction=0`.

Also re-ran related suites: `test_maps_phase5b.py`, `test_terrain.py` (aside from one initially-wrong status assertion that was corrected to accept `TERRAIN_UNAVAILABLE` @ 422).

### Frontend

```text
npx vitest run src/features/terrain3d/mesh.test.ts
✓ 9 tests passed
```

---

## Browser verification

Custom research point **outside** Site01/Site04 5 m tiles:

- Coordinates: **−88.5°, 0.0°** (`Phase7D Outside 5m`)
- Local coverage: **not covered**
- UI mesh: **REMOTE_PGDA90**, Native DEM **40 m**, Source **LOLA 40 m · PGDA 90**, site height **≈ −1421.3 m**, No-data cells **0**
- 3D canvas rendered real undulating LOLA geometry (not flat / not hillshade substitute)

### Screenshot paths

- `docs/screenshots/phase7d-mvp/phase7d-01-custom-point-remote-dem.png`
- `docs/screenshots/phase7d-mvp/phase7d-02-provenance-remote-pgda90.png`
- `docs/screenshots/phase7d-mvp/browser-verification.json`

---

## Verdict

### READY

Verified NASA Product 78/90 elevation sources and COG range access; local 5 m behaviour preserved; remote Product 90 elevation fallback works for mesh visualization with provenance in API + UI; horizon engine unchanged; regression + live + browser evidence captured before the 2026-11-15 16:00 Türkiye deadline window.

**Not claimed:** far-field multi-resolution horizon scoring (explicitly out of scope).
