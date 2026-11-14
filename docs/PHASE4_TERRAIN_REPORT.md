# SELENORA — Phase 4 Terrain Report

**Branch:** `feature/phase4-lola-terrain`  
**Algorithm (terrain):** `0.4.0-phase4-terrain`  
**Algorithm (geometric, preserved):** `0.3.1-phase3.3`  
**Date:** 2026-11-14  
**Competition safety:** Geometric jury MVP unchanged; TERRAIN is opt-in via `horizon_model=TERRAIN`.

---

## 1. NASA LOLA datasets used

| Product | Role | Local file (gitignored) |
|---------|------|-------------------------|
| PGDA Site01 — Connecting Ridge, 5 m/pix `*_surf.tif` | DEM for seed Point B | `data/raw/lola/Site01_final_adj_5mpp_surf.tif` (~41 MB) |
| PGDA Site04 — Shackleton Rim, 5 m/pix `*_surf.tif` | DEM for seed Point A | `data/raw/lola/Site04_final_adj_5mpp_surf.tif` (~41 MB) |

Source hub: [PGDA product 78](https://pgda.gsfc.nasa.gov/products/78) (related: products [90](https://pgda.gsfc.nasa.gov/products/90), [81](https://pgda.gsfc.nasa.gov/products/81)).  
Science paper: Barker et al., 2021, *Planet. Space Sci.* 203, 105119 — https://doi.org/10.1016/j.pss.2020.105119

20 m south-pole mosaics were **not** required: both competition seed sites fall inside the 5 m tiles.

---

## 2. Licence / attribution

- Data obtained from NASA GSFC Planetary Geodesy Data Archive (PGDA).
- Cite Barker et al. (2021) and the PGDA product page when publishing results.
- SELENORA surfaces citation in API provenance (`lro-lola`), health/data-sources notes, and Science Transparency UI.
- Large GeoTIFFs are **not** committed to Git (`data/raw/` in `.gitignore`).

---

## 3. Raster coverage & resolution

| Tile | Resolution | Size | Stereo bounds (m) |
|------|------------|------|-------------------|
| Site01 | 5.0 m/pix | 3200×3200 | (−19000, −20000) → (−3000, −4000) |
| Site04 | 5.0 m/pix | 3200×3200 | (−9000, −15000) → (7000, 1000) |

Verified surface samples:

| Site | Lon / Lat | Covered | Tile | Surface Z (m) |
|------|-----------|---------|------|---------------|
| Shackleton Rim Point A | −166.0°, −89.68° | **Yes** | Site04 | ~1592 |
| Connecting Ridge Point B | −141.8°, −89.44° | **Yes** | Site01 | ~1797 |
| Shackleton floor seed | 129.78°, −89.67° | **No** | — | — |

No automatic remapping of uncovered coordinates. Uncovered TERRAIN requests → HTTP **422** `TERRAIN_UNAVAILABLE`.

---

## 4. Coordinate system decision

Documented in [`docs/COORDINATE_SYSTEMS.md`](COORDINATE_SYSTEMS.md).

- Site lon/lat = Horizons GEODETIC `SITE_COORD` on `@301`.
- LOLA tiles = south polar stereographic on **1737.4 km** sphere, product note **MOON_ME / DE421**.
- Horizons live headers may cite **DE441** for the ephemeris; this is **not** treated as identical to the DEM surface frame.
- **No silent DE421↔DE441 shift** in Phase 4 (documented limitation).
- Transforms: PyProj explicit sphere stereographic (`lunar_projection.py`).

---

## 5. Terrain horizon algorithm

Modules:

- `app/science/lunar_projection.py` — lon/lat ↔ stereo, sphere drop  
- `app/science/horizon_profile.py` — 360° ray sampling + curvature  
- `app/science/terrain_visibility.py` — body Az/El vs terrain horizon  
- `app/services/terrain_data_service.py` — windowed GeoTIFF reads + horizon cache  
- `app/integrations/nasa/lola.py` — facade / availability  

Defaults: observer height **2 m**, max range **12 km**, range step **25 m**, **72** azimuth bins (tests often use 36).  
Missing DEM along a ray → azimuth marked **UNKNOWN** (never clear sky).  
Sun/Earth: centre of disc; ~0.27° solar radius **not** modelled.  
Joint visibility = both terrain-visible at the same sample.  
Duration clamp `[start, end)` from Phase 3.3 retained.

---

## 6. Geometric vs terrain

For every TERRAIN analysis site, the API returns:

- `metrics` — terrain-adjusted visibility (used for scoring when coverage OK)  
- `geometric_comparison.geometric` — same ephemeris with 0° sphere horizon  
- Deltas for sun/earth/joint % and longest darkness / communication gap  

UI: `GeometricTerrainCompare` on Site Comparison + Science Transparency terrain rows.  
Planner: `horizon_model` **GEOMETRIC** (default) or **TERRAIN** (enabled).

---

## 7. Two south-pole sites — status

| Site | DEM | Horizon coverage (cached run) | Horizon elev range (°) | Status |
|------|-----|-------------------------------|------------------------|--------|
| Point A (Site04) | Yes | 100% | ~−20.4 … +17.0 | **Verified** |
| Point B (Site01) | Yes | 100% | ~−5.8 … +9.7 | **Verified** |

Unit test `test_compute_terrain_mode_two_lola_sites` runs the full TERRAIN scoring path on both sites with Horizons fixtures (no live network).  
Live Horizons + TERRAIN jury demo: use Planner → Terrain (LOLA 5 m DEM) with Points A & B (requires network + local DEM files).

---

## 8. DeepSeek compatibility

- Ranking remains deterministic; DeepSeek still explains **stored** evidence only.  
- Terrain analyses use algorithm `0.4.0-phase4-terrain` and provenance includes `lro-lola`.  
- Ranking/number guards unchanged; AI is not invoked until scientific compute completes.  
- Re-run explain after a new TERRAIN analysis so the evidence package matches the new algorithm version.

---

## 9. Test results

| Suite | Result |
|-------|--------|
| Backend `pytest` (non-live) | **85 passed** (was 71 at Phase 3.3 baseline; +terrain/API coverage) |
| New terrain tests | raster load, coverage, stereo round-trip, sphere drop, synthetic ridge/NoData, real Site01/04 horizons, geometric vs terrain invariants, catalog/coverage endpoints, TERRAIN 422, two-site TERRAIN compute |
| Frontend | Vitest suite present; run with `npx vitest run` (package.json has no `test` script alias) |

Geometric regression tests (duration invariants, Horizons fixtures, explain guards) continue to pass.

---

## 10. Performance

| Operation | Measured (local) |
|-----------|------------------|
| First horizon (windowed 5 m DEM, 72 az default) | ~0.06 s uncached smoke; cached reload ~0.01–0.04 s |
| Strategy | Read only a ±`max_range` window; cache profiles under `data/cache/horizons_terrain/`; no full-DEM RAM load; DEMs not in Git |

---

## 11. Scientific limitations

1. DE421 LOLA vs DE441 Horizons frame mismatch not corrected (metre-scale residual possible).  
2. 5 m tiles cover only small south-polar boxes — most Moon lon/lat cannot use TERRAIN.  
3. Sun/Earth disc angular size ignored (centre-only).  
4. Earth above terrain horizon ≠ guaranteed RF link.  
5. Coarse ephemeris steps remain ±1 step estimates.  
6. Horizon rays use stereo-plane azimuth approximation + spherical curvature drop (not full ellipsoidal ray tracing).  
7. Delivered `*_surf.tif` includes interpolated fill pixels — uncertainty maps (`*_toterr.tif`) not yet fused into UNKNOWN.

---

## 12. Jury demo readiness

**Safe default:** keep Phase 3.3 geometric path (`horizon_model=GEOMETRIC`, tag `phase3.3-scientific-duration-fix`).  

**Terrain upgrade (when DEMs present on the demo machine):**

1. Ensure `data/raw/lola/Site01_*.tif` and `Site04_*.tif` exist.  
2. Planner → select Points A & B → Horizon = Terrain (LOLA 5 m DEM).  
3. Comparison → Geometric vs terrain table + Science Transparency LOLA citation.  
4. Explorer → select site → LOLA coverage / surface Z.  
5. Optional: AI Analyst on the completed TERRAIN analysis.

If LOLA files are missing, TERRAIN returns 422 and geometric MVP remains the jury story.

---

## 13. Incomplete / deferred (honest)

| Item | Status |
|------|--------|
| Full-Moon elevation mosaic in Explorer map | Deferred (P2) — coverage API + attribution only |
| Sun/Earth elevation vs terrain-horizon line chart | Partial — comparison table + deltas; dedicated horizon-line chart not shipped |
| Live two-site TERRAIN Horizons run in CI | Not in default pytest (`-m live` only for network) |
| Uncertainty rasters / clones | Not integrated |
| 3D surface | Not started (P2) |
| Phase 5 | **Not started** — stop here per charter |

---

## P0 checklist

1. ✅ NASA LOLA access + coverage validation (Site01/04; seeds A/B covered)  
2. ✅ Coordinate / datum documentation  
3. ✅ Real terrain horizon computation  
4. ✅ ≥1 (actually 2) south-pole verified topographic visibility path  
5. ✅ Geometric analysis preserved (`0.3.1-phase3.3`)  
6. ✅ Scientific tests green  

SELENORA — Explore the Moon. Understand the Evidence. Plan with Confidence.
