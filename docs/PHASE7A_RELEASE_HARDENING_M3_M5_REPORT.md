## Phase 7A — Release hardening (M3 + M5)

Base: `4e665ba` (Phase 7A unified integration)

### Backup (integration branch)

- **Branch**: `feature/phase7a-unified-integration`
- **Remote backup**: pushed to `origin` (no force-push, no merges)
- **SHA**: `4e665ba41a28a4f3830adb132ed733d33c27848b` (local == remote)

### M3 — Exact lunar pole (`latitude_deg = -90`) caused HTTP 500

#### Root cause

`/api/v1/terrain/horizon-profile` is **azimuth-based** (true-north horizon bins). At the **exact geographic poles** there is no unique “local north”, so any computation that needs a local north/azimuth reference is **scientifically undefined**.

In SELENORA this surfaced as an unhandled `ValueError` from the finite-difference north-vector helper:

- `backend/app/science/lunar_projection.py:true_north_grid_azimuth_deg()` rejects `latitude_deg == -90`
- `backend/app/services/terrain_data_service.py:get_horizon_profile()` called it for the request and bubbled the error
- FastAPI’s generic exception handler turned it into HTTP **500**

#### Fix / behavior change

For **only** the azimuth-dependent terrain horizon endpoint:

- Requests with \(|\text{latitude}| = 90^\circ\) are rejected as **HTTP 422** with a documented, actionable error:
  - **code**: `AZIMUTH_UNDEFINED_AT_POLE`
  - **message**: explains “local north/azimuth is undefined at poles”
  - **details**: includes the requested lat/lon and a Turkish explanation (`message_tr`)

This **does not** globally forbid lunar coordinates at ±90°; it only rejects this scientifically undefined computation.

#### Regression tests

Added endpoint regression coverage:

- Exact pole → `422` / `AZIMUTH_UNDEFINED_AT_POLE`
- Near-pole (covered DEM) → `200` with bins (skips if local LOLA tiles absent)
- Normal non-polar, outside local DEM → `422` (documented), never `500`

### M5 — Lunar coordinate frames (documentation + tests)

#### Deliverables

- Added a coordinate-frame glossary: `docs/COORDINATE_FRAMES_GLOSSARY.md`
  - Distinguishes **MOON_ME body frame**, **asset-native GLB model frame**, **SELENORA canonical globe frame**, and **Three.js world frame**
  - Documents the **raycast pick chain** (world intersection → lat/lon) and why it is radius-independent (Standard/High mesh swaps)

- Added frame-consistency numerical tests (Vitest):  
  `frontend/src/features/moon-globe/frames.test.ts`
  - Validates each asset’s `canonicalFromModel` is orthonormal
  - Round-trips canonical directions across all models for test vectors spanning equator/cardinals, southern hemisphere, and near-pole

### QA (automated)

- **Backend**: `pytest` → `195 passed, 16 skipped, 3 deselected`
- **Frontend**:
  - `vitest run` → `28 files passed, 195 tests passed`
  - `npm run build` (`tsc -b` + `vite build`) → OK
  - `npm run lint` (`oxlint`) → warnings only (exit 0)

