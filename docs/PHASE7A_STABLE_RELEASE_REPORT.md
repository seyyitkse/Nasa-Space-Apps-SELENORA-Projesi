# SELENORA — Phase 7A Stable Release Candidate (RC1)

**Branch:** `release/phase7a-stable`  
**Worktree:** `.worktrees/release-phase7a`  
**Base:** `origin/main` @ `8ba4b5f489ff395d39a392bce7383676c31ce524`  
**Verified:** 2026-11-15 (local re-run of the gates and a bounded browser pass)

## Scope (no new phases)

This RC is the Phase 7A unified integration plus release hardening (M3/M5). No Phase 7B/7C worktrees were modified and no new feature phase was created.

- Integration source: `feature/phase7a-unified-integration` @ `4e665ba41a28a4f3830adb132ed733d33c27848b` (ancestor of this branch)
- Hardening source: `feature/phase7a-release-hardening` @ `e8e6a87b07a3368d58b68d21da2e70c814253d16` (ancestor of this branch)
- Merge already present; it was not repeated: `4dca827` “Merge Phase 7A release hardening”
- Conflict kept from that merge: `docs/FRONTEND_DATA_REQUIREMENTS.md` preserved both the Phase 5C verification section and the later Phase 5D/5F requirements

## Release validation gates

Re-run in this worktree on 2026-11-15. `npm ci` was not repeated; `frontend/node_modules` was already present.

### Backend — pytest

- **Interpreter:** root repo `backend/.venv/Scripts/python.exe` (the release worktree has no `.venv`)
- **`PYTHONPATH`:** this worktree’s `backend` (confirmed `app.__file__` resolved there)
- **Command:** `python -m pytest -ra --tb=line`  
  `backend/pyproject.toml` `addopts` is `-q -m 'not live'`, so live tests are deselected by default
- **Local LOLA:** existing junctions left in place (`data/raw/lola` and `backend/data/raw/lola` → repo `data/raw/lola`). They were not deleted.

Result:

- **Passed:** 210
- **Skipped:** 1
- **Deselected:** 3
- **Duration:** 31.05s
- **Exit code:** 0

Skipped:

- `tests/test_phase5e_epochs_imagery.py:95` — “Covered by uncovered TERRAIN create test when DEM present”

Deselected (`pytest -m live -o addopts=` collects exactly these three):

- `tests/test_integrations.py::test_live_horizons_sun_elevation_at_south_pole`
- `tests/test_analysis_service.py::test_live_two_site_analysis_end_to_end`
- `tests/test_maps_phase5b.py::test_live_vsicurl_hillshade_preview`

### Frontend — lint, vitest, tsc, production build

Executed in this worktree’s `frontend/`:

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` (`oxlint`) | Exit 0. Warnings only (fast-refresh export rules, React Compiler memoization, refs during render). Not a failure. |
| Unit tests | `npx vitest run` | 28 files passed, 195 tests passed, 12.48s. jsdom logged `HTMLCanvasElement.getContext()` “Not implemented”; tests still passed. |
| Typecheck | `npx tsc -b --pretty false` | Exit 0 |
| Production build | `npx vite build` | Exit 0, built in 1.05s |

### Secrets and large-file audit

- Tracked files larger than 1 MB: **none**
- Tracked filenames matching `.env`, credentials, private keys, or `*.pem`: **none**
- Content search found only documentation placeholders (`DEEPSEEK_API_KEY=sk-...` in `README.md`) and test doubles (`"test-key"`, `DEEPSEEK_API_KEY=None`). No live key was found in tracked files.
- The RC API process was started with an empty `DEEPSEEK_API_KEY`. `/health` reported `ai_analyst` as `NOT_CONFIGURED`.

### API check used during the browser session (not a browser claim)

`GET /health` on `127.0.0.1:8000` returned 200. `terrain_model` was `READY` (“LOLA 5 m/pix DEM horizon available”). `ai_analyst` was `NOT_CONFIGURED`.

`GET /api/v1/terrain/horizon-profile?latitude_deg=-90&longitude_deg=0` returned **HTTP 422** with `error.code` `AZIMUTH_UNDEFINED_AT_POLE`. That is the M3 pole guard. A near-pole success case and a full live Horizons analysis were **not** run.

## Browser acceptance

Dev servers for this pass: backend `http://127.0.0.1:8000` (root venv, this worktree on `PYTHONPATH`, temp SQLite outside the repo) and frontend `http://127.0.0.1:5173`. The UI showed **API online v0.1.0** and Scientist mode.

Screenshots: `docs/screenshots/phase7a-stable-rc1/`.

| Step | What happened |
| --- | --- |
| Mission Control (`/`) | Loaded. `01-mission-control.png` |
| Lunar Explorer (`/explorer`) | South-polar LROC photo, LOLA Site04 footprint, Shackleton / de Gerlache labels. `02-explorer.png` |
| 3D Moon (`/moon`) | Page loaded. Banner: NASA 3D model is **not installed** in this worktree; flat NASA map fallback shown. Standard/High globe toggle was **not** exercised. `03-moon.png` |
| Custom point | “Create new point” was visible. The control was **not** used. |
| Mission Planner (`/planner`) | A/B selects rendered (Shackleton Rim — Point A and Malapert Massif). “Run ephemeris analysis” was **not** clicked. `04-planner.png` |
| Site Comparison (`/comparison`) | Empty state first (`05-comparison.png`). “Run synthetic preview” then showed a dashboard explicitly badged **SYNTHETIC_DEMO**, with the warning that it is not JPL Horizons. `05b-comparison-synthetic.png` |
| Horizon Simulator (`/simulator`) | Empty state: “No stored analyses yet”. `06-simulator.png` |
| Mission Windows (`/windows`) | Empty state: “No stored analyses yet”. Phase 7A events panel did **not** render, because it is mounted only after a stored analysis. `07-windows.png` |
| TR | Language control switched the Windows page to Turkish. `08-windows-tr.png` |
| Mobile 375px | Mission Control was reloaded with a 375×812 CSS viewport, Turkish, hamburger menu. The screenshot canvas is wider than the layout column. `09-mission-control-mobile-tr.png` |

**Not executed in this RC browser pass** (do not treat these as passed):

- Live JPL Horizons “Run ephemeris analysis”
- Stored-analysis Horizon Simulator (Sun/Earth samples, GEOMETRIC vs TERRAIN)
- Phase 7A operational events on Simulator or Windows
- Custom research point from the 3D Moon
- Standard/High Moon toggle (`npm run fetch:moon` was not run; the GLB is absent here)
- Persistence / stale-analysis recovery
- A near-pole horizon-profile success call (`|latitude| < 90`)

Older screenshots under `docs/screenshots/phase7a-integration/` and `docs/screenshots/phase7a/` remain historical evidence from the integrated branches. They are not a substitute for the steps left unchecked above.

## Known limitations (unchanged)

- TERRAIN mode depends on local LOLA coverage. Incomplete ray coverage stays **UNKNOWN**.
- Live Horizons and remote hillshade tests stay out of the default pytest run (`-m 'not live'`).
- AI explanation stays off until `DEEPSEEK_API_KEY` is set. It does not compute science results.

## Readiness

**Open the pull request.** Automated gates passed with the skip and the three live deselections accounted for, the pole 422 guard responded on the RC API, and the main shell pages rendered against that API.

**Do not merge yet.** This RC browser pass never stored a live analysis, so Simulator, Mission Windows, and the Phase 7A events panel were only seen in their empty state. The NASA 3D globe asset is also missing in this worktree, so the 3D Moon step is a flat-map fallback. A short live Planner run (then Simulator events and Windows) is the remaining check before merge.
