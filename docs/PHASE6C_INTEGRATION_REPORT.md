# SELENORA — Phase 6C Unified Integration Report

| | |
|---|---|
| Branch | `feature/phase6c-unified-integration` |
| Worktree | `.worktrees/phase6c` |
| Type | Integration + contract/navigation wiring. **No Phase 7A/7B/7C features.** |
| Gate satisfied | Phase 5F.2 complete at `7158221` (pushed to GitHub before merges) |

## 1. Starting commits

| Stream | Branch | Commit |
|---|---|---|
| Phase 5F.2 (base) | `feature/phase5f2-imagery-quality` | `7158221` |
| Phase 6A.1 (+ 6A) | `feature/phase6a1-moon-quality` | `1a13d02` |
| Phase 6B + Phase 7 design + 6C plan | `docs/phase7-operational-windows-design` | `41a9852` |
| Phase 5F.1 | `feature/phase5f1-lroc-fix` | `cef848b` (ancestor of 5F.2) |
| Imagery research | `docs/lunar-imagery-requirements` | `dce986a` (reference only; not merged) |

## 2. Merge order and merge SHAs

1. Created worktree/branch from `7158221`.
2. **Merge 1** — `feature/phase6a1-moon-quality` → `052e5a4`  
   *Merge Phase 6A.1 moon quality into Phase 6C unified integration.*  
   Strategy: `ort`. **Conflicts: none.**
3. **Merge 2** — `docs/phase7-operational-windows-design` → `d9f59d7`  
   *Merge Phase 6B globe data and Phase 7 design into Phase 6C unified integration.*  
   Strategy: `ort`. **Conflicts: none.**
4. Integration wiring commit (this report + client contracts) on top of `d9f59d7`.

No rebase. No force-push. `main` untouched. Integration branch **not** pushed in this phase (per instructions).

## 3. Conflicts and resolutions

None during either merge. Post-merge gap was functional, not textual:

- 3D Moon still called `GET /api/v1/sites` instead of `GET /api/v1/globe/sites`.
- Frontend contracts lacked globe/tile/runtime route keys.
- Moon → Planner link omitted `?site=`.

## 4. Modules integrated

| Module | Source | Status in 6C |
|---|---|---|
| Polar tile pyramid, WAC/NAC 2 m, LOLA overview, cache | 5F.2 | Preserved |
| Raster preview blob + CRS headers | 5F.2 | Preserved |
| NASA 3D Moon (standard/high quality, orientation) | 6A.1 | Preserved |
| Globe site catalog + ME Cartesian metadata | 6B | Backend present; Moon UI wired |
| Phase 7 design docs + 6C plan | phase7-design | Docs only; not implemented |
| Horizons / terrain / scoring / UNKNOWN | prior | Unchanged |

## 5. API contract changes (frontend)

Added / wired:

- Types: `GlobeSiteMarker`, `GlobeSiteCatalog`, `CartesianME` in `frontend/src/types/api.ts`
- `ROUTES.globeSites`, `mapTiles`, `mapRuntime` in `contracts.ts`
- `contractApi.globeSites` + `useGlobeSites`
- `selenoraApi.globeSites` + `useGlobeSites` hook
- `MoonPage` / `MoonHero` consume `/api/v1/globe/sites`
- LOLA coverage badges use `local_lola_coverage` / `local_lola_tile` (no N+1 coverage storm)
- Pin placement still uses verified `latLonToModel` (6A.1 model frame); backend `cartesian_me` retained for science metadata / future mesh-root use
- `/api/v1/sites` kept for Mission Planner
- Planner deep-link: `/planner?site=<id>` from Moon site card

## 6. Navigation verification

Verified in real browser (`http://127.0.0.1:5186` → API `8006`):

1. Mission Control — API online, Explorer/Scientist, Moon hero.
2. 3D Moon — Point A deep link, Standard texture, LOLA 5 m badge from globe catalog.
3. Moon → Lunar Explorer (`/explorer?site=shackleton-rim-a`) — WAC mosaic, NAC 2 m control, Point A selected.
4. Explorer → Mission Planner — Site A = Shackleton Rim Point A, Site B preserved from store (Malapert).
5. TR/EN — Planner switches to Turkish (`Görev Planlayıcı`, `Kaşif`, `Bilim insanı`).

Screenshots: `docs/screenshots/phase6c/phase6c-01-moon-point-a.png` … `phase6c-04-planner-tr.png`.

## 7. Scientific regression

- Seed coordinates unchanged: Point A (−89.68, −166), Point B (−89.44, −141.8), `APPROXIMATE_REFERENCE`.
- Eight globe/sites IDs match `/sites`.
- No edits to Horizons, true-north, LOLA horizon math, UNKNOWN, scoring, or DeepSeek guards.
- Mosaic disclaimer still present: static LROC photo ≠ mission-date illumination.

## 8. Test results

| Suite | Result |
|---|---|
| Backend pytest | **170 passed, 1 skipped** |
| Frontend Vitest | **141 passed** (23 files; + PlannerSiteSelect + Moon create/pick helpers) |
| TypeScript (`tsc -b`) | **pass** |
| Production build | **pass** (~808 ms Vite build; re-verified after hotfix) |
| oxlint | **0 errors**, **42 warnings** (5F.2 baseline ~37; no new errors; existing react-compiler/export warnings) |

### Production 3D-related chunks (approx.)

| Asset | Size |
|---|---|
| `OrbitControls-*.js` | ~582 kB (gzip ~156 kB) |
| `three.core-*.js` | ~383 kB (gzip ~102 kB) |
| `loadMoon-*.js` | ~51 kB (gzip ~15 kB) |
| `MoonExplorer-*.js` | ~20 kB |
| `MoonScene-*.js` | ~10 kB |
| `MoonPage-*.js` | ~13 kB |

GLB models remain **gitignored** (`frontend/public/nasa/svs-14959/*.glb`). Install via `npm run fetch:moon` / `npm run fetch:moon -- --high`.

## 9. Performance notes

API smoke against isolated backend:

- `GET /api/v1/globe/sites` ≈ 183 ms (8 sites)
- Warm WAC tile HIT: tens of ms (cold first request higher)
- First production imagery on 5F.2 was reported at 581 ms; 6C did not regress the prepared overview/tile path (cache junctioned from 5F.2 worktree)

## 10. Data / secrets / cache isolation

- SQLite copied into worktree `backend/data/selenora.db` (+ timestamped backup); gitignored.
- `.env` copied privately (UTF-8); **not committed**.
- `SELENORA_MAP_CACHE_DIR` points at prepared 5F.2 map cache.
- LOLA rasters linked via directory junction to repo `data/raw/lola` (not committed).
- Isolated ports used for smoke: backend **8006**, frontend **5186**.

## 11. Remaining limitations / Phase 7 prep

- NAC 1 m and ShadowCam remain Phase 5F.3 (per 5F.2).
- High-quality topo GLB is optional download; without it Standard tier continues.
- Planner still primarily relies on zustand for A/B; `?site=` is a focus hint, not a full dual-slot URL contract.
- Imagery research branch not merged (docs reference only).
- Phase 7A/7B/7C **not started**.
- Integration branch not pushed / not merged to `main` (intentional).

## 12. Open work before Phase 7

1. Push `feature/phase6c-unified-integration` when backup is requested.
2. Optional: browser matrix for mobile 375 + High quality offline fallback.
3. Optional: consume `cartesian_me` in Three.js only after frame-alignment audit vs `latLonToModel`.
4. Then begin Phase 7 design implementation **only** when product owner opens that gate.

## 13. Hotfix — Planner A/B dark-theme select (post-6C)

| | |
|---|---|
| Issue | Native `<select>` option popup ignored page CSS: white menu + light option text → unreadable research-site names. |
| Fix | Mission Planner A/B (plus timestep / horizon) switched to existing Radix `@/components/ui/select`; `SelectGroup` / `SelectLabel` added; long names wrap; custom + reference groups preserved. |
| Contracts | Unchanged: `missionStore`, URL `?site=`, `/api/v1/sites`, analysis request shape, `sameSite` validation. |
| Tests | `frontend/src/pages/PlannerSiteSelect.test.tsx` (+4); jsdom pointer-capture polyfill in `test/setup.ts`. |
| Screenshots | `docs/screenshots/phase6c/phase6c-hotfix-site-a-dropdown-tr.png`, `…-b-dropdown-tr.png`, `…-a-dropdown-en.png`, `…-a-dropdown-mobile-375.png`. |

**Other NativeSelect leftovers (reported only; not rewritten in this hotfix):**

| Location | Control | Risk |
|---|---|---|
| `AnalystPage.tsx` | analysis picker | Same OS popup theme risk |
| `Terrain3DPanel.tsx` | extent preset | Same |
| `TimeControls.tsx` | horizon sim time step | Same |

Prefer Radix Select when those screens next get UI attention.

## 14. Hotfix — 3D Moon custom point create & persistence

| | |
|---|---|
| Root cause | **Missing feature** on `/moon`: pins only selected API reference sites. No mesh pick, no `addCustomSite`, customs not merged into globe markers. Explorer/Planner already had the client custom-site path. |
| Fix | Explicit **Create new point** mode → click-without-drag raycast on the Moon mesh → `worldPointToLatLon` (direction vector in verified model frame → planetocentric lat / east-positive lon) → name dialog → `missionStore.addCustomSite`. |
| Persistence | **Browser `localStorage`** via existing Zustand persist key `selenora-mission` (`draft` + `customSites`). UI labels this honestly. No server/DB custom-site API. Eight reference seeds untouched. |
| Coordinate method | Intersection world point → normalize direction → `modelToLatLon` / `normalizeLonDeg`. Independent of Standard/High mesh radius/relief (UV never used). |
| Cross-page | Custom pins on Moon; Explorer `?site=`; Planner A/B `custom:<id>`; `sameSite` validation unchanged. |
| Files | `MoonScene.tsx`, `MoonExplorer.tsx`, `MoonPage.tsx`, `SitePanel.tsx`, `pickHelpers.ts`, `customSiteAdapter.ts`, `input.tsx` (forwardRef), `phase6a.en.ts` / `phase6a.tr.ts`, tests. |
| Screenshots | `docs/screenshots/phase6c/phase6c-hotfix-moon-create-mode.png`, `…-moon-custom-saved.png`, `…-moon-custom-site-card.png`, `…-planner-custom-b.png`. |
| Tests | Vitest **141** (incl. pickHelpers + MoonCreatePoint); `tsc` / build / oxlint pass. Browser: create near south pole, save, refresh (localStorage), assign Site B, Planner shows matching coords. |
| Limitations | No durable server storage; High-tier offline if GLB missing; LOLA 5 m coverage for arbitrary customs remains “unknown” until a local tile matches; create-mode mesh pick needs a short click (drag still orbits). |
