# SELENORA — Phase 7B + 7C Unified Release Report (Release 2)

**Branch:** `release/phase7bc-stable`  
**Worktree:** `.worktrees/release-phase7bc`  
**HEAD at report commit:** see git log after docs commit  
**Not merged to main.** Phase 7D/7E not started. Existing worktrees were not deleted.

---

## 1. Source commit ancestry

| Stream | Branch | Verified full SHA | Notes |
|--------|--------|-------------------|-------|
| Base | `origin/main` | `e0c2eec24af3ef9017ad933d64d75d25a36313c2` | Phase 7A PR #6 already on main |
| Phase 7B (Codex-reviewed) | `feature/phase7b-completion-review` | `fa48ba4ecf1d234a9e9021402083a605d2b8d8fd` | Used; Claude unfinished worktree not used |
| Phase 7C | `feature/phase7c-date-scenarios` | `7230386a49effb966aaafaa49c09f81ea433c0fd` | Date scenarios + migration |

### Ancestry note

Both 7B and 7C share merge-base **`4e665ba41a28a4f3830adb132ed733d33c27848b`** with `origin/main` (Phase 7A unified integration).  
`origin/main` advanced beyond that base via `release/phase7a-stable` → PR #6 (`e0c2eec`).  
Release branch was created from **latest `origin/main`**, then 7B and 7C were merged in order — preserving H1–H4 / M3/M5 / Phase 7A event semantics already on main.

---

## 2. Merge sequence and commits

Start: `git worktree add -b release/phase7bc-stable .worktrees/release-phase7bc origin/main`

| Order | Merge commit (full SHA) | Source |
|-------|-------------------------|--------|
| 1 | `6822c5cf257a69ab27abd4b20b13ba12cb1f700d` | Phase 7B `fa48ba4…` (clean ort merge) |
| 2 | `fc4ec98d3793238f5d9d9c0702f808aa8921fbd8` | Phase 7C `7230386…` (+ conflict resolution) |

Histories preserved (non-ff merges). Main project folder branch was not switched.

---

## 3. Conflicts and resolutions

Only three content conflicts on Phase 7C merge (ComparisonPage auto-merged):

### Conflict A — `backend/app/api/v1/__init__.py`

**Resolution:** register **both** routers:

```python
router.include_router(solar.router)      # Phase 7B
router.include_router(scenarios.router)  # Phase 7C
```

### Conflict B/C — `frontend/src/i18n/locales/en.ts` / `tr.ts`

**Resolution:** import and spread **both** locale modules:

```ts
import phase7b from './phase7b.{en|tr}'
import phase7c from './phase7c.{en|tr}'
// ...phase7a, ...phase7b, ...phase7c
```

Namespaces do not collide (`solarPotential*` vs `scenarios*`). Nav key `scenarios` retained.

### Auto-merged / verified integration points

| Surface | Status |
|---------|--------|
| `ComparisonPage.tsx` + `SolarPotentialPanel` | Present (7B); H1 null-safe metric tiles retained |
| Planner → Date Scenarios link | Present (7C) |
| Router `/scenarios`, `/scenarios/:comparisonId` | Present |
| `navItems.ts` Date Scenarios entry | Present |
| Phase 7A events router | Retained on main lineage |

---

## 4. Scientific integrity checks

| Check | Result |
|-------|--------|
| H1–H4 / M3/M5 corrections on main | **Preserved** (base `e0c2eec`) |
| Phase 7A operational event semantics | **Preserved** + live re-verified (see §7) |
| 0.5 percentage-point solar comparison margin | **Preserved** (`COMPARISON_MINIMUM_GAP_PCT = 0.5`; live solar limitations include “0.5”) |
| Relative solar opportunity ≠ electrical power | **Preserved** (panel + API limitations/assumptions language) |
| UNKNOWN in all terrain analyses | **Preserved** (locale + science tests + 7C UNKNOWN copy) |
| Independent ephemeris / cache identity per 7C scenario | **Preserved** (scenario `cache_key` + independent windows) |
| TERRAIN algo stamp | **`0.4.2-phase6c-science-h1`** retained |

No opportunistic engine changes were made during this release integration.

---

## 5. Alembic migration `20261115_0002`

| Step | Result |
|------|--------|
| Source DB | **Isolated copy** of production SQLite → `backend/data/selenora.release7bc.isolated-copy.db` |
| Before | `alembic_version = 20261114_0001`; no `scenario_comparisons` |
| `alembic upgrade head` | `20261114_0001 → 20261115_0002` created `scenario_comparisons` + `ix_scenario_comparisons_cache_key` |
| Repeat `upgrade head` | **Idempotent no-op** (stays at head; upgrade early-returns if table exists) |
| Production DB | **Untouched** — still `20261114_0001`, no `scenario_comparisons` |

Runtime worktree DB used for browser/API QA was derived from the isolated migrated copy only.

---

## 6. Test and release gates

| Gate | Result |
|------|--------|
| Backend pytest | **257** collected · **256 passed** · **1 skipped** · **0 failed** (`PYTEST_EXIT=0`) |
| Frontend Vitest | **214 passed** / 31 files (`VITEST_EXIT=0`) |
| TypeScript `tsc -b` | **exit 0** |
| Production `npm run build` | **exit 0** |
| Lint `oxlint` | **exit 0** (pre-existing warnings only) |
| Secrets / DB / GLB / NASA datasets in Git | **None** — `.db`, `data/raw`, `data/cache`, `*.glb` gitignored; local junctions only |

---

## 7. Browser QA (live stack)

**Stack:** backend `127.0.0.1:8008` (`/health` OK, LOLA READY), frontend Vite `localhost:5188` (proxy → 8008).

| Journey | Observed |
|---------|----------|
| Mission Control + circular NASA map | Loads; API online; polar mosaic + site pins |
| Standard / High 3D Moon | Page loads; NASA SVS 14959 assets junctioned locally; Standard loading observed in evidence |
| Create/save custom point | Moon create-point UI present (screenshot evidence) |
| Mission Planner | Loads with site/date/horizon/weight controls |
| Real Comparison | Stored `EPHEMERIS_GEOMETRIC` analysis renders metrics + recommendation |
| Phase 7A Events | `/api/v1/analyses/{id}/events` OK on stored + **new live** analysis; Simulator deep-link captured |
| Phase 7A Windows | Windows route loads bound to analysis |
| Phase 7B solar-potential panel | Visible on Comparison (“Göreli güneş potansiyeli”); API returns 0.5 pp margin notes |
| Phase 7C date scenarios | Full form: fixed site, 3 independent windows, shared weights/horizon |
| GEOMETRIC / TERRAIN | GEOMETRIC exercised live; TERRAIN engine READY on health |
| Partial / all-UNKNOWN | Covered by existing unit suites + 7C UNKNOWN copy |
| TR / EN | TR UI captured across pages; EN Mission Control screenshot saved; language toggles present |
| 375px mobile | `08-tr-mobile.png` at 375×812 |
| Provenance / error handling | Comparison shows geometric-horizon uncertainty banner; API validation errors explicit |

### Screenshots

Directory: `docs/screenshots/phase7bc-integration/` (21 PNG files)

- `01-mission-control.png`
- `02-moon.png`, `02-moon-standard.png`
- `03-planner.png`, `03-moon-create-point.png`
- `04-comparison.png`, `04-comparison-solar.png`
- `05-scenarios.png`, `05-windows.png`
- `06-simulator.png`, `06-simulator-events.png`
- `07-windows.png`, `07-scenarios-results.png`
- `08-tr-mobile.png` (375×812)
- `09-comparison-demo.png`
- `10-comparison-real.png` (solar panel footer visible)
- `11-simulator-events.png`
- `12-windows-real.png`
- `13-en-mission-control.png`
- `14-comparison-solar.png`

### Live Horizons → Events → Windows

| Step | Result |
|------|--------|
| `POST /api/v1/analyses` short GEOMETRIC window | **COMPLETED** `f41aa764-65aa-4833-9085-72f2faf9c561` · `EPHEMERIS_GEOMETRIC` |
| `GET …/events` on that analysis | **OK** — 2 sites; confirmed bracket semantics retained |
| Windows UI | Deep-link screenshot captured against stored/live analyses |
| Live upstream verdict | **Complete for this release probe** (JPL Horizons reachable during QA) |

---

## 8. Remaining blockers / open risks

| Item | Blocks main merge? | Notes |
|------|--------------------|-------|
| M3 exact lunar pole (−90°) → possible 500 | **No** for nominal south-polar sites | Carry-forward from Phase 7A report |
| M5 MOON_ME vs Three.js axis docs | **No** | Unchanged; not re-proven wrong |
| Production DB not yet migrated | **Intentional** | Apply `20261115_0002` only when operators choose; verified on isolated copy |
| High-detail Moon GLB load timing | **No** | Standard model path works; High asset available via local junction, not in Git |

---

## 9. Release verdict

All required Release 2 gates for Phase 7B + 7C unified integration passed on `release/phase7bc-stable`.

**Recommendation:** eligible for human review / main merge after operator approval.  
This report does **not** merge to main.
