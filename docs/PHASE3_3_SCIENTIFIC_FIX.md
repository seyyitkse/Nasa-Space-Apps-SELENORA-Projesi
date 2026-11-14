# SELENORA Phase 3.3 — Scientific Duration Fix

**Date:** 2026-11-14  
**Branch:** `feature/phase3.3-scientific-duration-fix`  
**Preserved tag:** `phase3.2-competition-ready` (untouched)  
**New algorithm:** `0.3.1-phase3.3`  
**Phase 4:** not started

---

## 1. Root cause

Jury window `[2026-12-01, 2026-12-05)` is **96 h**. Horizons returns an **inclusive STOP** sample, so a 360 min step yields **17** epochs (`floor(96h/6h)+1`), including `2026-12-05T00:00:00Z`.

`longest_run_hours` treated every sample as a full `step_minutes` hold:

`17 × 6 h = 102 h` → `longest_communication_gap_hours = 102` while Earth was continuously below the horizon.

That overshoots the analysis window by exactly one step (the end sample).

**Not** a DeepSeek error; the deterministic engine inflated durations, and the AI correctly echoed them.

## 2. Files changed

| File | Change |
|---|---|
| `backend/app/science/visibility.py` | `[start, end)` hold hours; missing samples excluded; time-weighted % |
| `backend/app/services/result_builder.py` | Clamp interval ends; pass `analysis_end_utc` |
| `backend/app/services/analysis_service.py` | Wire end clamp; superseded-metrics warning on read; assumption text |
| `backend/app/services/demo_analysis_service.py` | Same end clamp for synthetic path |
| `backend/app/core/config.py` | `ALGORITHM_VERSION = 0.3.1-phase3.3` |
| `backend/app/schemas/analysis.py` | `analysis_duration_hours` helper |
| `backend/tests/test_duration_invariants.py` | New invariant suite |
| `backend/tests/test_science.py` / `test_analysis_service.py` | Updated expectations |
| `docs/competition_demo_snapshot.json` | Recomputed jury snapshot |
| `docs/PHASE3_3_SCIENTIFIC_FIX.md` | This report |

## 3. Before / after duration math

| Quantity | Before (0.3.0) | After (0.3.1) |
|---|---|---|
| Window | 96 h | 96 h |
| Samples | 17 (inclusive end) | 17 (unchanged Horizons grid) |
| Hold model | `n × step` | `min(step, end − t)` per sample; **0 h at `t == end`** |
| `longest_communication_gap_hours` (continuous Earth-dark) | **102** | **96** |
| `longest_sunlight_hours` (continuous Sun-up) | 102 | **96** |
| Interval `end_utc` | could exceed analysis end | clamped to `end_utc` |

Semantics documented as half-open **`[start_utc, end_utc)`**.

## 4. Updated two-site jury scenario

| Field | Value |
|---|---|
| Analysis id | `40aca886-e33b-4707-82bb-742e73a750d5` |
| Sites | Shackleton Rim Point A (−89.68°, −166.0°) · Connecting Ridge Point B (−89.44°, −141.8°) |
| Window | 2026-12-01 → 2026-12-05 UTC · step 360 min |
| Quality | `EPHEMERIS_GEOMETRIC` · algo `0.3.1-phase3.3` |
| Metrics (both) | sun 100% · earth 0% · joint 0% · darkness 0 h · **comm gap 96 h** · score 40 · rank 1 |
| Recommendation | `null` (tie) |
| DeepSeek | Fresh EN explain on new evidence; unsupported `[]`; cache hit on repeat |
| Snapshot | `docs/competition_demo_snapshot.json` |

## 5. Coordinate validation (no silent coordinate swap)

| Topic | Finding |
|---|---|
| Horizons `SITE_COORD` | `E-lon, lat, alt_km` with `COORD_TYPE=GEODETIC`, `CENTER=coord@301` |
| Longitude | **East-positive** (−166° stored → Horizons echoes 194° E) |
| Altitude | km above the Horizons lunar reference sphere (~1737.4 km radius); demo uses **0.0 km** |
| Frame (live Horizons) | MEAN_ME / high-precision; ephemeris **DE441** (from live header) |
| PGDA LOLA Site01 / Site04 | South-polar stereographic GeoTIFFs in **MOON_ME / DE421** (Barker et al. / PGDA products/78) |
| Implication for Phase 4 | DE421 LOLA vs DE441 Horizons are **not** byte-identical frames; terrain fusion needs an explicit frame/ephemeris policy — **do not treat as interchangeable** |
| Seed A/B | Remain Bussey et al. (2010) approximate Points A/B (`APPROXIMATE_REFERENCE`). Literature Site01 ≈ 89.45°S, 137.31°W and Site04 ≈ 89.78°S, 155.73°W differ; **coordinates were not auto-changed** without a verified mapping decision |

## 6. Regression tests

| Suite | Result |
|---|---|
| Backend pytest (`-m "not live"`) | **71 passed**, 2 live deselected |
| New duration invariants | Continuous Earth-dark 96 h; Sun-up; boundary flip; missing samples; ties; 60/360 min; non-dividing step; end-only sample; interval clamp |
| Frontend Vitest | **28 passed** |
| `tsc -b` / `npm run build` | Clean / success |
| Live Horizons + DeepSeek jury | `RESULT=OK`, `comm_gap_h=96.0` |

## 7. Cache / stored analyses

| Item | Action |
|---|---|
| Algorithm version bump | Cache keys include `algo` → old results **not** reused for new runs |
| DB rows | **Not deleted**; prior `0.3.0-phase3` analyses remain |
| Read path | `load_result` appends a **SUPERSEDED metrics** limitation when `algorithm_version ≠ 0.3.1-phase3.3` (response-only; DB unchanged) |
| Old jury id `dd025b63-…` | Superseded (102 h gap); replace with `40aca886-…` / updated snapshot |
| AI explain cache | Tied to evidence hash → regenerates after metric change |

## 8. Phase 4 readiness (do not start yet)

1. Duration math is now window-consistent under geometric sampling.  
2. Terrain (LOLA) still absent — illumination may still tie under short Dec windows.  
3. Coordinate / DE421↔DE441 policy must be decided before merging LOLA DEMs with Horizons observers.  
4. Re-validate AI guards after terrain changes scores.

**Phase 4 was not started.**
