# SELENORA — Phase 4.1 Terrain Science Validation

**Branch:** `feature/phase4.1-terrain-science-validation`  
**Terrain algorithm:** `0.4.1-phase4.1-validation`  
**Geometric (unchanged):** `0.3.1-phase3.3`  
**Date:** 2026-11-14  
**Phase 5:** not started

---

## 1. Azimuth direction check — **bug confirmed & fixed**

Phase 4.0 cast rays as if Horizons azimuth were clockwise from **grid** +Y:

`Δx = d·sin(az)`, `Δy = d·cos(az)` with `az` = Horizons azimuth.

At south-polar stereo (`lon_0=0`), **grid north ≠ geographic north** except on the central meridian. Horizons azimuth is geographic.

### Verified γ (grid azimuth of true north)

| Site | Lon / Lat | Finite-diff γ | `lon % 360` |
|------|-----------|---------------|-------------|
| Point A | −166°, −89.68° | **194.0000°** | 194.0° |
| Point B | −141.8°, −89.44° | **218.2000°** | 218.2° |

Cross-check: `pyproj.Proj.get_factors().meridian_convergence` returns unusable values (~thousands of degrees) on this custom sphere — **not used**. Definition retained as finite-difference; closed form `γ = lon % 360` matches to numerical precision.

### Correction

`bearing = (true_azimuth + γ) % 360`, then stereo offsets from bearing.  
Implemented in `lunar_projection.py` + `horizon_profile.py`. Cardinal tests (0/90/180/270) on A and B pass.

---

## 2. Grid convergence calculations

See also `docs/COORDINATE_SYSTEMS.md` (updated). Module API:

- `true_north_grid_azimuth_deg(lon, lat)`
- `grid_bearing_for_true_azimuth(true_az, γ)`
- `stereo_offsets_for_true_azimuth(true_az, d, γ)`

Sanity: a true-north ray increases stereo radius (moves toward the equator along the local meridian).

---

## 3. DEM coverage root cause

Phase 4.0 reported `horizon_coverage = 100%` because **`coverage_ok` meant “≥1 valid sample on the ray”** (`direction_has_any_data`), not “ray completed to the requested 12 km” (`direction_has_complete_coverage`).

Site01/Site04 tiles are **~16 × 16 km**. Observer-to-edge distances are ~5.5–10 km. A **12 km** request **cannot** be complete in all directions.

---

## 4. Actual ray coverage (real LOLA, 72 az, 12 km, measured)

| Site | any_data | **complete** | min valid range | median | max | γ |
|------|----------|--------------|-----------------|--------|-----|---|
| A (Site04) | 100% | **6.9%** | 5575 m | 8700 m | 12000 m | 194° |
| B (Site01) | 100% | **1.4%** | 6650 m | 8888 m | 12000 m | 218.2° |

Horizon elevation range (known samples only): A ≈ −19.6°…+16.7°; B ≈ −5.7°…+9.7°.

---

## 5. Geometric vs terrain (fixture Horizons + real DEM)

Window: 2026-12-01 → 2026-12-02, step 360 min, algorithm `0.4.1-phase4.1-validation`.  
**Data quality:** `LOCAL_TERRAIN_PARTIAL`  
**Recommended site:** **None** (ranking refused)

| Site | Mode | Sun % | Earth % | Joint % | Longest darkness (h) | Comm gap (h) |
|------|------|-------|---------|---------|----------------------|--------------|
| A | Geometric | 100 | 0 | 0 | 0 | 24 |
| A | Terrain | 0 | 0 | 0 | 24 | 24 |
| B | Geometric | 100 | 25 | 25 | 0 | 18 |
| B | Terrain | 0 | 0 | 0 | 6 | 6 |

| Site | Unknown hours | Known sample fraction | Complete az fraction |
|------|---------------|----------------------|----------------------|
| A | 0.0 | 1.0 | 0.069 |
| B | 18.0 | 0.40 | 0.014 |

Interpretation (honest):

- **A:** all ephemeris samples fall in directions where **known** terrain already **BLOCKS** the Sun → terrain sun % = 0 with no UNKNOWN hours for this coarse fixture.
- **B:** many samples are **UNKNOWN** (body above known local horizon but ray truncated by DEM edge) → large unknown duration; visibility % over the remaining known subset is **not** a full-sky guarantee.
- These fixture numbers are for regression/validation, not a live jury competition ranking.

Live Horizons + TERRAIN demo: run Planner with `horizon_model=TERRAIN` when network + local DEMs are available; expect the same `LOCAL_TERRAIN_PARTIAL` label and no deterministic recommendation until wider DEM/COG coverage exists.

---

## 6. UNKNOWN policy

| State | Rule |
|-------|------|
| **BLOCKED** | Body elev ≤ known terrain horizon (even if ray incomplete beyond the blocker) |
| **VISIBLE** | Body above known horizon **and** ray has **complete** coverage to requested `max_range_m` |
| **UNKNOWN** | No DEM data, or appears clear of known terrain but ray truncated / NoData |

UNKNOWN samples are excluded from visibility % denominators. UI/API expose `unknown_hours`, `known_sample_fraction`, `any_data_fraction`, `complete_coverage_fraction`.

---

## 7. Scientific fixes applied

1. True-north / meridian convergence for all horizon rays.  
2. Split any-data vs complete coverage; per-ray `valid_range_m`.  
3. VISIBLE / BLOCKED / UNKNOWN classification.  
4. Quality label `LOCAL_TERRAIN_PARTIAL`; ranking refused under that label.  
5. Ephemeris `PARTIAL` no longer conflated with terrain UNKNOWN.  
6. Prior terrain `0.4.0-phase4-terrain` marked **superseded** on load; cache keys include `0.4.1` + γ.

Geometric engine untouched.

---

## 8. Cache & algorithm version

| Item | Value |
|------|-------|
| `TERRAIN_ALGORITHM_VERSION` | `0.4.1-phase4.1-validation` |
| Data source contract | `horizons-observer-azel-v1+lola-5mpp-v2` |
| Horizon cache | New keys; stale 4.0 `.npz` ignored |
| Geometric | `0.3.1-phase3.3` unchanged |

---

## 9. Regression tests

| Suite | Result |
|-------|--------|
| Backend pytest | **101 passed** (was 85) |
| New `test_terrain_validation.py` | convergence, cardinals, truncation, NoData, BLOCKED vs UNKNOWN, real 12 km partial coverage, score safety |
| Frontend vitest | **28 passed** |
| Geometric duration / explain guards | still green |

---

## 10. Scientific limitations

1. Local 5 m Site01/04 tiles cannot support complete 12 km all-azimuth terrain visibility.  
2. Far-field south-polar topography (PGDA product 90 / 20 m COG) **not downloaded** in 4.1 — design note only: windowed COG read would be the next step for distant horizons.  
3. Without wider DEM, TERRAIN mode is a **local occultation / partial-coverage** product, not a complete illumination map.  
4. DE421 vs DE441 surface shift still not applied.  
5. Solar disc radius still not modelled.

---

## 11. Jury demo readiness

**Primary demo:** Geometric MVP (`horizon_model=GEOMETRIC`, tag `phase3.3-scientific-duration-fix`).  

**Terrain add-on (optional):** enable TERRAIN for Points A/B with local DEMs present → show Science Transparency `LOCAL_TERRAIN_PARTIAL`, γ, complete %, UNKNOWN hours, geometric vs terrain deltas. **Do not** claim a terrain-based recommended landing site.

---

## 12. Remaining for Phase 5 (not started)

- Windowed 20 m / COG far-horizon integration  
- Dedicated Sun/Earth elev vs terrain-horizon line charts  
- Uncertainty rasters (`*_toterr`)  
- Full-Moon Explorer mosaic  

SELENORA — Explore the Moon. Understand the Evidence. Plan with Confidence.
