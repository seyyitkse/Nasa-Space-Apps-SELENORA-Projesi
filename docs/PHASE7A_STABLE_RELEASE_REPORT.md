# SELENORA — Phase 7A Stable Release Candidate (RC1)

**Branch:** `release/phase7a-stable`  
**Worktree:** `.worktrees/release-phase7a`  
**Base:** `origin/main` @ `8ba4b5f489ff395d39a392bce7383676c31ce524`  
**Prepared:** 2026-11-15 (local)

## Scope (no new phases)

This RC is strictly the Phase 7A unified integration + release hardening (M3/M5) already verified on:

- Phase 7A integration source: `feature/phase7a-unified-integration` @ `4e665ba41a28a4f3830adb132ed733d33c27848b`
- Release hardening source: `feature/phase7a-release-hardening` @ `e8e6a87b07a3368d58b68d21da2e70c814253d16`

No Phase 7B/7C worktrees were modified and no new feature phases were created.

## Git ancestry and integration method

- **Non-destructive merge into RC branch**: `4dca827` (“Merge Phase 7A release hardening”)
  - Merged `feature/phase7a-release-hardening` (contains `e8e6a87…`, which contains/descends from `4e665ba…`).
- **Conflict(s) resolved**:
  - `docs/FRONTEND_DATA_REQUIREMENTS.md` — resolved by **preserving both** the Phase 5C verification section and the newer Phase 5D/5F appended requirements (removed merge markers).

## Release validation gates

### Backend — `pytest`

Executed using the existing venv:

- **Interpreter**: `backend/.venv/Scripts/python.exe`
- **Command**: `python -m pytest -ra --maxfail=1`
- **Local LOLA**: enabled by adding junction(s) so `app.services.terrain_data_service.DEFAULT_LOLA_DIR` (`<repo-root>/data/raw/lola/`) is present in the release worktree.

Result (release worktree):

- **Passed**: 210
- **Skipped**: 1
- **Deselected**: 3

Skipped (explicit):

- `tests/test_phase5e_epochs_imagery.py:95` — *“Covered by uncovered TERRAIN create test when DEM present”*

Deselected (explicit reason: `backend/pyproject.toml` sets `addopts = "-q -m 'not live'"`):

- `backend/tests/test_integrations.py:217` — `test_live_horizons_sun_elevation_at_south_pole` (real JPL Horizons)
- `backend/tests/test_analysis_service.py:379` — `test_live_two_site_analysis_end_to_end` (real JPL Horizons)
- `backend/tests/test_maps_phase5b.py:170` — `test_live_vsicurl_hillshade_preview` (remote Product 90)

### Frontend — lint, tests, typecheck, production build

Executed in `frontend/`:

- **Install**: `npm ci` (**0 vulnerabilities**)
- **Lint**: `npm run lint` (completed; warnings emitted by oxlint, no failure)
- **Unit tests**: `npx vitest run`
  - **Test Files**: 28 passed
  - **Tests**: 195 passed
- **TypeScript + production build**: `npm run build` (`tsc -b && vite build`) — succeeded

Notes:

- Vitest logs include `HTMLCanvasElement.getContext()` “Not implemented” messages under jsdom for canvas/WebGL-related code; tests still passed.

## Browser acceptance (Mission Control → … → Windows)

**Status: NOT fully executed in this RC run.**

- The dev servers were started successfully (backend responded on `/health`, frontend served on `http://127.0.0.1:5173/`).
- Attempted to capture browser screenshots via Cursor browser tooling, but screenshot capture repeatedly timed out; to avoid stalling the release process, this RC **does not claim** the full interactive acceptance journey was completed end-to-end during this run.

Evidence available in-repo (from the integrated Phase 7A work already merged here):

- `docs/screenshots/phase7a-integration/phase7a-int-01-mission-control.png`
- `docs/screenshots/phase7a-integration/phase7a-int-02-polar-map.png`
- `docs/screenshots/phase7a-integration/phase7a-int-03-moon.png`
- `docs/screenshots/phase7a-integration/phase7a-int-05-windows.png`
- `docs/screenshots/phase7a-integration/phase7a-int-06-simulator.png`
- `docs/screenshots/phase7a/01-simulator-terrain-live-en.jpg`
- `docs/screenshots/phase7a/02-windows-geometric-mobile-tr.jpg`

Manual re-validation recommended before merging to `main`:

- Mission Control → NASA polar map → 3D Moon → custom point → Planner A/B → Analysis → Comparison → Simulator → Phase 7A Events → Windows
- Verify toggles: **Standard/High Moon**, **TR/EN**, **mobile 375px**
- Verify science guards: **M3 HTTP 422 at exact poles**, **MOON_ME transforms**, **GEOMETRIC**, **TERRAIN incl UNKNOWN coverage**, persistence / stale-analysis recovery.

## Scientific/engineering limitations (known, unchanged)

- TERRAIN mode depends on local LOLA DEM coverage; incomplete ray coverage must remain **UNKNOWN** (never inferred clear sky).
- Remote/“live” integrations (Horizons / remote hillshade previews) are intentionally excluded from default CI runs (`-m 'not live'`) and require explicit opt-in.

## Readiness decision

**RC1 is acceptable to open a PR against `main`** based on:

- Successful non-destructive merge onto `origin/main` base
- Backend + frontend automated gates passing (with explicit skipped/deselected accounted for)

**Blocking for merge to `main`**:

- Full interactive browser acceptance journey was **not re-run** during this RC due to screenshot tooling timeouts; a short manual pass is recommended before merge.

