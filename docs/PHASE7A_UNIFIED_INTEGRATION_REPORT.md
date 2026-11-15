# SELENORA — Phase 7A Unified Integration Report

**Branch:** `feature/phase7a-unified-integration`  
**Worktree:** `.worktrees/phase7a-integration`  
**HEAD at report commit:** see git log (base merges end at `d3b4df7`)  
**Not pushed** (pending review). **Not merged to main.** Phase 7B/7C not started.

---

## 1. Source commit ancestry

| Stream | Branch | Verified SHA | Ancestry vs `f01d2b4` |
|--------|--------|--------------|------------------------|
| Science H1/H2 | `feature/phase6c-science-hardening` | `6e7ac1e` | **Contains** `f01d2b4` |
| UI H3/H4 | `feature/phase6c-ui-hardening` | `ee973c9` | **Contains** `f01d2b4` |
| Mission Control map | `feature/phase6c1-mission-control-map` | `61faa8e` | **Does not contain** `f01d2b4` |
| Phase 7A events | `feature/phase7a-operational-events` | `40d20bd` | **Contains** `f01d2b4` |

### Ancestry note (Mission Control)

`61faa8e` forks from **`5ed7454`** (Planner A/B dark-theme fix), the **parent** of `f01d2b4` (3D Moon custom points). Left/right count vs `f01d2b4` was `1/1`.

Integration **did not substitute a different base**: the integration branch was created from science **`6e7ac1e`** (which includes `f01d2b4`). Merging `61faa8e` then brought the polar-map work onto that lineage; custom-point commit `f01d2b4` remains present.

Common intended integration floor: **`f01d2b4`**. Actual Mission Control fork point: **`5ed7454`**.

---

## 2. Merge sequence and commits

Start: `git worktree add -b feature/phase7a-unified-integration … 6e7ac1e`

| Order | Merge commit | Source |
|-------|--------------|--------|
| 1 | `5ca5465` | UI H3/H4 `ee973c9` |
| 2 | `d817d45` | Mission Control `61faa8e` |
| 3 | `d3b4df7` | Phase 7A `40d20bd` (+ i18n conflict resolution) |

History preserved (non-ff merges). Existing agent worktrees were not edited.

---

## 3. Conflicts and resolutions

### Conflict A — `ComparisonPage.tsx`

**Expected:** science (H1 null metrics) vs UI (H4 active analysis).  
**Actual:** Git auto-merged cleanly.

**Verified merged semantics:**

| Requirement | Status in tree |
|-------------|----------------|
| Active analysis selection (`workspaceStore.analysisId`) | Present |
| Explicit synthetic demo (`?source=demo`) | Present |
| Stale / 404 recovery (`StaleAnalysisState`) | Present |
| H1 null-safe metric tiles (`numeric` filter; no `Math.max` on nulls) | Present |
| No silent stale substitution | Present (404 → explicit UI; demo only when `source=demo` or no active id) |

### Conflict B — `frontend/src/i18n/locales/en.ts` / `tr.ts`

**Actual conflict** on Phase 7A merge only.

**Resolution:** keep **both** modules:

```ts
import phase6c1 from './phase6c1.{en|tr}'
import phase7a from './phase7a.{en|tr}'
// ...spreads of both
```

**Key parity:** top-level namespaces `polarPreview` (6C.1) and `events7a` (7A) — **no overlap**. Existing strings retained. UI hardening comparison keys (`savedUnavailable*`) remain in base locale objects.

---

## 4. Scientific integrity checks

| Check | Result |
|-------|--------|
| H1 separate Sun/Earth denominators | **Pass** (~66.7% / 66.7% / joint 50% on mixed fixture) |
| UNKNOWN ≠ darkness | **Pass** (blocked = valid ∧ ¬visible) |
| All-UNKNOWN → null pcts, not 0% | **Pass** |
| H2 distinct weights → distinct cache keys | **Pass** (40/40/20 ≠ 80/10/10; order-normalized equal) |
| H3 geometric below-horizon not “terrain-blocked” | **Pass** (`adapter.mapAuthoritativeBody` + `horizonModel === 'GEOMETRIC'`) |
| H4 Comparison restores active completed analysis | **Pass** (code + browser: Windows/Simulator bound to stored analysis) |
| Phase 7A confirmed brackets; no RISE/SET across UNKNOWN | **Pass** (`VISIBLE→UNKNOWN→NOT_VISIBLE` → `BECOMES_UNKNOWN` + `RESOLVES_TO_NOT_VISIBLE` only) |
| TERRAIN algo version | **`0.4.2-phase6c-science-h1`** retained; older `0.4.x` superseded |

No scientific algorithms were changed to force green tests.

---

## 5. Test and release gates

| Gate | Result |
|------|--------|
| Backend pytest (collect) | **208** tests collected |
| Backend pytest (run) | **All green** with **1 skip** (≈207 passed / 1 skipped); LOLA via junction to main `data/raw/lola` |
| Frontend Vitest | **193 passed** / 27 files |
| TypeScript `tsc -b` | **exit 0** |
| Production `npm run build` | **exit 0** |
| Lint `oxlint` | **exit 0** (pre-existing warnings only) |
| Secrets / DB / GLB in commits | **None** staged; moon GLBs hardlinked locally only; LOLA is a junction (not recursively deleted) |

---

## 6. Browser QA (live stack)

**Stack:** backend `127.0.0.1:8007`, frontend Vite `127.0.0.1:5187`, API `/health` OK (LOLA READY).

| Journey step | Observed |
|--------------|----------|
| Mission Control | Loads; API online |
| Circular NASA south-polar map | **Visible** (LROC WAC circular atlas + site pins) |
| 3D Moon | Standard model loads; Create new point available; High option listed |
| Custom points | Present on Windows/Simulator as “Özel nokta” sites |
| Planner A/B | Sites + weights 40/40/20 + GEOMETRIC; synthetic preview ready |
| Comparison | Explicit `?source=demo` isolation (empty until demo run); H4 wiring present |
| Simulator | GEOMETRIC mode; Sun below / Earth above geometric 0° line |
| Mission Windows | Heatmap + UNKNOWN legend; bound to stored GEOMETRIC analysis |
| Operational Events | Panel integrated on Simulator (Phase 7A) |
| TR/EN | Toggle present and functional |
| Mobile 375px | Emulation tool unavailable in this session; UI-hardening already shipped mobile screenshot for H4; polar map has prior 375px evidence from 6C.1 |

Screenshots (this integration):

- `docs/screenshots/phase7a-integration/phase7a-int-01-mission-control.png`
- `docs/screenshots/phase7a-integration/phase7a-int-02-polar-map.png`
- `docs/screenshots/phase7a-integration/phase7a-int-03-moon.png`
- `docs/screenshots/phase7a-integration/phase7a-int-05-windows.png`
- `docs/screenshots/phase7a-integration/phase7a-int-06-simulator.png`

---

## 7. Open science risks (no opportunistic engine changes)

### M3 — Exact lunar pole → backend 500

- **Reproduction:** `true_north_grid_azimuth_deg(0.0, -90.0)` raises  
  `ValueError: latitude must be in (-90, 90] for a local north vector`  
  while terrain API accepts `latitude_deg >= -90` and only catches `FileNotFoundError` → **HTTP 500**.
- **`+90`:** allowed by the predicate `(-90, 90]`.
- **Blocks Phase 7B?** **No** for nominal south-polar research sites (typically ≫ −90 by arcminutes). **Yes** as a hard crash if a user/pick lands exactly on −90°.
- **Recommendation:** separate focused commit — allow −90 with an explicit pole north convention **or** return **422** from terrain API; do not fold into this integration.

### M5 — MOON_ME docs vs Three.js model axes

- Backend scientific MOON_ME: +Z north (`lunar_sphere.py`).
- Frontend `orientation.ts`: documented model-space permutation (north ≈ +Y after transform).
- **Not proven wrong** by comment mismatch alone; no transform change in this integration.
- **Blocks Phase 7B?** **No** if picks continue through validated `latLonToModel` / raycast helpers.
- **Recommendation:** frame glossary + regression vectors in a docs/coord commit; change math only after end-to-end vector proof.

### M1 / M2 (local range; 5° azimuth bins)

- Documented operational limits of local LOLA horizons; unchanged. Do not widen range/bins without new validation.

---

## 8. Phase 7B / 7C readiness decision

**Decision: READY to review/push this integration branch; READY to plan 7B after M3 hardening is scheduled.**

| Criterion | Status |
|-----------|--------|
| Four workstreams in one coherent tree | **Yes** |
| Scientific H1–H4 + 7A event honesty | **Yes** |
| Gates (pytest / vitest / tsc / build / lint) | **Yes** |
| End-to-end browser smoke | **Yes** (full Horizons live TERRAIN analysis not mandatory for merge readiness; LOLA READY + synthetic/geometric paths exercised) |
| M3 exact pole | Open — **non-blocking** for typical sites; schedule focused fix before exposing unrestricted pole picks |
| M5 docs | Open — **non-blocking** |
| Start 7B/7C in this task | **No** (explicitly deferred) |

---

## 9. Explicit non-goals honored

- No push until review  
- No merge to `main`  
- No Phase 7B / 7C feature work  
- No edits to Codex / other agent worktrees  
- No destructive LOLA junction/raster deletion  
