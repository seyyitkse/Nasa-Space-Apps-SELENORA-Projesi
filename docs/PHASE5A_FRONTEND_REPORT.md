# Phase 5A — Next-Generation Lunar Mission Control Frontend (Report)

Date: 2026-11-14 · Branch: `feature/phase5a-frontend-experience` (worktree `.worktrees/phase5a`) · **Not committed yet**

## 0. Git isolation and baseline

- When I started, the main checkout held **uncommitted** Phase 4/4.1 work and another agent was active. Phase 5B
  (`feature/phase5b-nasa-data-services`) appeared during this phase. All Phase 5A work lives in a separate worktree.
- Branch base: `e5a1059`. At the time, Phase 4.1's 10 frontend files existed only as uncommitted edits, so they
  were **copied as the baseline** into the worktree. Phase 4.1 has since been committed as `b3d314d`, so those files
  should merge cleanly (identical content):
  `components/shared/badges.tsx`, `features/lunar-explorer/ExplorerPanels.tsx`,
  `features/site-comparison/{ScienceTransparencyPanel,GeometricTerrainCompare}.tsx`, `i18n/locales/{en,tr}.ts`,
  `pages/{ComparisonPage,PlannerPage}.tsx`, `services/selenoraApi.ts`, `types/api.ts`.
  Recommended merge order: `b3d314d` (4.1) → Phase 5B backend → this branch.
- **No backend files were edited.** Testing used an isolated API instance of the main-checkout backend
  (Phase 4.1 + in-progress 5B) on :8010 with a **copy** of the SQLite DB, so the other agent's DB was never migrated
  or written.
- `docs/FRONTEND_DATA_REQUIREMENTS.md`: the backend (5B) wrote this file during the phase. This branch keeps their
  text verbatim and appends a "Phase 5A frontend consumption status" section, so the merge is append-only.

## 1. Before → after

| Area | Before (Phase 1–4.1 UI) | After (Phase 5A) |
|---|---|---|
| Lunar Explorer | Graticule + markers; a "LOLA elevation" switch shown **on but disabled** with nothing rendered (misleading) | Layer dock driven by `/maps/layers` with roles; real LDEM 80 m hillshade/elevation/slope/PSR previews placed at backend bounds; real LOLA tile footprints; elevation inspector; A/B badges and A/B tab (great-circle separation, swap); "Open in Mission Planner"; Artemis III region names and links (no fake polygons); mission timeline dock synced to the simulator |
| Sun/Earth | Elevation line chart only | **Horizon Simulator**: sky gauges with the geometric 0° horizon and the terrain horizon at the body azimuth, 360° LOLA horizon panorama with Sun/Earth directions, sampled-epoch slider, play/pause/speed, UTC jump with explicit snapping, synced chart and lanes, live per-epoch check (Δ vs stored), provenance |
| Comparison | Lanes and cumulative chart used `elevation > 0` **even for TERRAIN analyses** (wrong); read-only weights | Terrain-aware shared lanes (VISIBLE / BELOW / BLOCKED / UNKNOWN / UNRESOLVED); recommendation banner explaining refusal or tie; confidence and terrain-coverage panel; explainable weight lab (exact mirror of `scoring.py`) that is disabled when the backend refused scoring; cumulative chart counts only confirmed joint hours |
| Mission windows | — | Day × UTC-hour heatmap from real samples (no-data cells shown as such), body and date filters, authoritative interval lists (joint / darkness / comm gaps), scope note (no forecasting) |
| Home | Hard-coded phase checklist (stale: showed AI and terrain as "planned") | Live south-pole preview (lazy OpenLayers), engine mode from `/health`, featured and recent analyses with recommendation/tie/refusal, quick access to Explorer, Simulator and Windows |
| AI Analyst | Deterministic sentences + briefing | Evidence grid (E1/E2 metric cards), recommendation status with the exact refusal reason, numbers in AI text linked to evidence (cyan) or flagged by the backend guard (amber), selection shared with the workspace, cached briefings read without regeneration |

## 2. Features implemented

- **Data adapter** `features/analysis-data/adapter.ts` (pure, tested): geometric and terrain states, half-open windows,
  end-sample exclusion, UNRESOLVED when per-sample terrain state is unknowable, recommendation and rescoring rules.
- **Shared workspace store** `stores/workspaceStore.ts`: one analysis, site and time cursor across Explorer, Simulator,
  Comparison and Windows. The cursor always snaps to a sampled epoch.
- **Contracts** `services/contracts.ts`: capability detection from `/openapi.json`; adapters for Phase 5B routes
  (horizon-profile bins, observer-series chunks, preview bounds header, Artemis).
- New pages `/simulator` and `/windows`; Explorer, Comparison, Home and Analyst upgraded. All strings are EN + TR
  (`i18n/locales/phase5a.{en,tr}.ts`, typed).

## 3. Screenshots (`docs/screenshots/phase5a/`, captured from the running app)

| File | Content |
|---|---|
| `00-before-explorer-phase1.jpg` | Before: Phase 1 Explorer |
| `01-explorer-lola-tiles-elevation.jpg` | LOLA Site01/Site04 footprints; picked point → real surface height (−622.0 m, Site04) |
| `02-explorer-mission-timeline.jpg` | Mission timeline dock (TERRAIN analysis, live cursor states) |
| `03-simulator-desktop.jpg`, `04-simulator-chart-controls.jpg` | Simulator gauges, controls, snapped UTC jump, synced chart |
| `05-comparison-terrain-refused.jpg` | LOCAL_TERRAIN_PARTIAL → ranking refused, geometric vs terrain |
| `06-comparison-weight-lab.jpg` | Weight lab: Earth-only weights flip the leader, with explanation |
| `07-windows-heatmap.jpg` | Hourly Sun visibility heatmap (28 days) |
| `08-home-hero.jpg`, `09-home-recent-engine.jpg` | Mission Control: preview, engine mode, featured and recent analyses |
| `10-analyst-evidence-briefing.jpg` | Cached DeepSeek briefing with evidence-linked numbers |
| `11-mobile-simulator.jpg`, `12-mobile-explorer.jpg` | 375 px layouts |
| `13-explorer-ldem-hillshade-preview.jpg` | Real LDEM 80 m hillshade preview, georeferenced (Shackleton bowl under its marker) |
| `14-simulator-lola-horizon-live.jpg` | 360° LOLA horizon, terrain horizon 12.66° above the Sun, live check Δ 0.0000° |

## 4. Working interactions (verified in the browser against the live API)

- Explorer: zoom/pan; polar overview and zoom-to-LOLA buttons; select by marker, list or URL; click to pick → real
  coverage and height; add/remove custom sites; assign A/B; swap; open in Planner; raster toggles (preview fetched
  for the view, spinner and error state); coverage, graticule and label toggles; cursor lon/lat + stereo x/y.
- Simulator: analysis and site pickers; slider; prev/next/first/last; play/pause (stops at the end) and speed;
  UTC jump snaps to the nearest sample and says so; chart click moves the cursor; lanes drag and arrow keys;
  mini-map click selects the site.
- Comparison: weight sliders (keyboard and pointer), reset, live re-ranking and explanation; disabled state with reason.
- Windows: body filter, date range, cells and intervals set the shared cursor.
- Analyst: cached EN/TR briefing loads. "Generate" was **not** clicked, to avoid paid DeepSeek calls.
- Mobile: no horizontal overflow on any route at 375 px (after fixes); drawer navigation works.

## 5. APIs used

LIVE: `/health`, `/api/v1/sites`, `/api/v1/analyses[/{id}[/timeline|/explain]]`, `/api/v1/terrain/catalog`,
`/api/v1/terrain/coverage`, `/api/v1/terrain/horizon-profile`, `/api/v1/ephemeris/observer-series`,
`/api/v1/maps/layers`, `/api/v1/maps/preview`, `/api/v1/artemis/regions`, `/openapi.json` (capabilities).
Details and remaining requests (R1–R4) are in `docs/FRONTEND_DATA_REQUIREMENTS.md`.

## 6. Backend dependencies

- Phase 4.1 commit `b3d314d` (terrain fields on `SiteResult`, `/terrain/*`).
- Phase 5B (still uncommitted in the main checkout at the time of writing): `/maps/*`, `/ephemeris/observer-series`,
  `/artemis/regions`, `/terrain/horizon-profile`. Without them the UI degrades to labelled unavailable states
  (verified earlier against the Phase 4.1-only backend).

## 7. Performance observations (measured on this machine, dev backend)

- Production build (Vite 8): main `index` 112 kB gzip; OpenLayers isolated in a lazy `LunarMap` chunk (88 kB gzip),
  loaded on Home only after the hero; Comparison route 18 kB gzip, plus shared chart vendor code.
- `/maps/preview` (remote NASA PGDA via vsicurl): **5.4 s and 9.3 s** for two requests. The UI shows a spinner
  and keeps the previous image while refetching.
- `/ephemeris/observer-series` (24 h, 60 min step, terrain): a few seconds per chunk (live JPL). Cached for 1 h per chunk.
- Charts render without animation; lanes are SVG with merged segments (≈ 170–700 rects per site).
- **Lighthouse: NOT MEASURED** (no local Chrome for the Lighthouse CLI). **Load testing: NOT MEASURED.**

## 8. Tests

| Command | Result |
|---|---|
| `npx tsc -b` (strict) | ✅ 0 errors |
| `npx vitest run` | ✅ **58 passed** (10 files) |
| `npm run build` | ✅ |
| `npx oxlint src` | ✅ 0 errors (fast-refresh warnings only) |

New test files: `analysis-data/adapter.test.ts` (8: geometric/terrain states, windows, unknowns, truncation,
end-sample exclusion, snapping, refusal), `site-comparison/rescore.test.ts` (5: formula parity with `scoring.py`,
dense rank, weight validation, leader-flip explanation, ties), `mission-windows/heatmap.test.ts` (2),
`ai-analyst/evidence.test.ts` (2), `services/contracts.test.ts` (3: profile normalisation, bounds header,
chunk alignment), `features/phase5a.components.test.tsx` (5: lane fills for BLOCKED/UNKNOWN/UNRESOLVED, keyboard
cursor, time controls bounds, layer dock availability, panorama gaps), and a PyProj cross-check in
`projection.test.ts` (5 points within 1 mm of `backend/app/science/lunar_projection.py`).
All fixtures are deterministic and labelled as such; none are shown in production views.

## 9. Bugs found and fixed during browser verification

1. End-of-window sample (`t == end_utc`) appeared **joint VISIBLE** in TERRAIN mode. It has zero duration and is
   never in a window. Now excluded.
2. Heatmap cells were 117 px wide (only ~8 of 24 hours visible). Fixed with a fixed table layout.
3. Gauge scale ±3.4° looked identical (tick read as a minus). Now explicit +/− signs.
4. Raster previews were not requested until the first manual pan. Fixed by emitting the initial view on first render.
5. Layer names truncated, tile labels colliding at polar zoom, preview badge under zoom buttons, mobile overflow from
   gauge badges. All fixed.

## 10. Scientific observation for backend/science review (not changed by the frontend)

For the seeded **"Shackleton Rim — Point A"** (89.68° S, 166.0° W), the TERRAIN analysis reports the Sun terrain-blocked
for the whole 1–8 Dec 2026 window, although the geometric elevation is about +1.5°. The live horizon profile shows why:
terrain rises to 12.66° at the Sun's azimuth (86°), with blockers 225–625 m away. The approximate seed coordinate
therefore sits below a rim or wall, not on the illuminated rim crest. This is consistent with the
`APPROXIMATE_REFERENCE` label. Before the jury demo, either use verified rim coordinates or explicitly present this as a
"coordinate sensitivity" finding.

## 11. Incomplete items (honest list)

- **3D LOLA terrain viewer (P2): not built.** `/maps/mesh` exists, so this is the next P2 item.
- Lunar **imagery** basemap: unavailable (only a Moon Trek reference link exists; request R2).
- Per-sample stored terrain states/azimuths (R1): not exposed, so lanes and heatmaps use derived states with an
  UNRESOLVED class, and the simulator relies on live observer-series chunks (analysis step must be ≥ 30 min).
- Preview window capped at 100 km by the backend (R3). The polar overview shows only a central window.
- AI briefing *generation* not exercised in this phase (cost); cached reads verified.
- Lighthouse, load and cross-browser testing not done. Screen-reader audit not done (keyboard paths and ARIA implemented).
- Reports page received no Phase 5A redesign (unchanged from Phase 3/4).

## 12. Next frontend priorities

1. Consume **R1** when available: replace derived states, remove UNRESOLVED, and drop live chunk calls for stored analyses.
2. **3D viewer** (React Three Fiber, lazy) on `/maps/mesh` for A/B with labelled exaggeration, resolution and observer marker.
3. Whole-cap preview (R3) and imagery basemap (R2) in the Explorer once the backend provides them.
4. Reports page: add simulator snapshots and the confidence panel; PDF export.
5. Lighthouse and a11y audit in CI (add a Chrome binary to the toolchain).
