# Phase 5D — Immersive Lunar Experience & Beginner Mode (Report)

Date: 2026-11-14 · Branch: `feature/phase5d-immersive-ux` (worktree `.worktrees/phase5d`) · Base: `94aaac3` (`phase5c-integration-rc1`)
Scope: frontend files only. No backend file was modified. Not merged, not submitted.

## 0. Environment and isolation

- The worktree was created from the verified Phase 5C commit `94aaac3`, not from the main checkout (which is on Cursor's
  `feature/phase5b-nasa-data-services`).
- Testing used an isolated API built from **this worktree's backend code** (Phase 5C) on `:8020`, with a **copy** of the 5C
  database (`selenora.phase5c.db` → scratch copy) and the SPA on `:5176`. Cursor's DB and branches were not touched.
- The gitignored local LOLA tiles are linked into the worktree with a directory junction `data/raw → ../../data/raw`
  (gitignored; verified with `git check-ignore`). Nothing from `data/` is committed.

## 1. Implemented interactions

### P0 — Guided mission experience (Explorer / Scientist modes)
- **Mode toggle** in the top bar (persisted). Explorer Mode is the default. Both modes call the same endpoints and show the
  same numbers; only presentation differs.
  - Explorer sidebar: Mission Control, Guided mission, Lunar Explorer, Horizon Simulator, Site Comparison, AI Analyst.
  - Scientist sidebar adds Mission Planner, Mission Windows and Reports. All routes remain reachable in both modes.
- **Guided mission** (`/mission`), four steps:
  1. **Objective:** Sunlight (60/20/20), Direct-to-Earth (20/60/20) or Balanced (40/40/20). Labelled as SELENORA
     educational presets, not NASA mission profiles.
  2. **Two sites from cards:** plain descriptions, approximate-coordinate notice, and a "5 m terrain" badge from live
     `/terrain/coverage`. No coordinate entry.
  3. **Date:** either a **validated example** (stored analyses of exactly these two sites, matched in either order) or
     **my own dates** (1–7 days, hourly). "Include 5 m terrain" is enabled only when both sites are inside local tiles,
     with an explanation.
  4. **Run:** loads the example or POSTs a **real** `/api/v1/analyses` request (live JPL Horizons).
- **Plain-language results** (`features/guided/explain.ts`, a pure tested module):
  - Verdict: recommended, tie, or refused, with the reason. LOCAL_TERRAIN_PARTIAL never yields a recommendation.
  - Per site: **"What the data shows"** vs **"What remains uncertain"**.
  - General caveats: line of sight ≠ radio link, not a safety system, approximate coordinates.
  - Every number is a stored backend value. With an objective, the ranking is re-weighted using the exact mirror of
    `scoring.py`, and only when the backend itself produced scores.
- **Progressive disclosure:** in Explorer Mode, Site Comparison shows the plain summary first, and the complete Phase 5A/5C
  dashboard (Science Transparency, weight lab, confidence, geometric-vs-terrain) sits behind "Scientific details",
  collapsed. It is expanded in Scientist Mode. The Simulator gets a "How to read this page" card in Explorer Mode.
- **Reusable explanations:**
  - `Term` glossary popovers (13 terms: ephemeris, 0° horizon, elevation, azimuth, LOLA DEM, terrain-blocked, UNKNOWN,
    partial terrain, direct-to-Earth, joint visibility, score, sampled moment, vertical exaggeration). They open on
    click, tap or Enter, so they work on touch screens.
  - `HelpTip` contextual "?" buttons. EN + TR.
- **Home:** Explorer Mode CTA "Start a guided mission", plus a "SELENORA in 10 seconds" three-step strip.

### P1 — Real LOLA 3D terrain viewer
- Lazy-loaded React Three Fiber scene (`features/terrain3d/TerrainScene.tsx`). The 256 kB-gzip chunk loads only on
  "Load 3D terrain".
- Geometry comes from `GET /api/v1/maps/mesh` (`features/terrain3d/mesh.ts`, pure and tested):
  - Scene X = grid east, Y = up, Z = −grid north.
  - Heights are relative to the observer's eye (surface + 2 m) minus the spherical drop R(1 − cos(d/R)), the same
    reference as the backend horizon code.
  - Null cells become holes, never 0.
- Controls:
  - Orbit, pan and zoom, with damping disabled under reduced motion.
  - Area presets: 2 km / 25 m, 4 km / 50 m, 10 km / 100 m, all within the backend's 20k-vertex guard.
  - **Vertical exaggeration** ×1, 2, 3 or 5, labelled. ×1 is true scale; sight lines are scaled identically, so
    obstruction relations are preserved.
- Panel information: height scale (min, site Z, max), mesh spacing, source tile, extent, no-data count, γ, attribution,
  and the backend's warning ("Downsampled preview mesh only — not a flight-dynamics surface model").
- Layer selection comes from `/terrain/coverage` (Site04 for Point A, Site01 for Point B). Sites outside the tiles get
  an explicit "no artificial terrain" state. Browsers without WebGL get an unavailable state.

### P1 — 3D Sun and horizon experience
- Embedded in the Horizon Simulator (`#terrain-3d`, auto-opened by `/simulator?view=3d`) and synchronized with the shared
  epoch cursor and site.
- Sun and Earth direction lines come from the per-epoch `GET /ephemeris/observer-series` sample (JPL Horizons), converted
  with the backend's convention: **grid bearing = true azimuth + γ**, γ = longitude mod 360 (Point A 194°, Point B 218.2°).
  A "True N" arrow shows the convergence. The lines are labelled as **visualization indicators**. No shadows or
  illumination are rendered, and a fixed neutral light is used for readability only.
- **State** shows the backend per-epoch `sun_state` (VISIBLE / BLOCKED / UNKNOWN). When it is absent: "UNKNOWN · not
  provided". The UI never infers it.
- **Obstruction explanation:** for example, "terrain rises to 12.66°, the Sun is only 1.49° high, so it is hidden;
  highest point ≈ 425 m away". This uses the backend terrain horizon plus the `distance_to_blocker_m` of the nearest
  horizon-profile bin. A mesh ray cross-check is shown separately and labelled non-authoritative.

### P1 — LROC photographic basemap (prepared, dependency open)
- The Explorer map gains a **Photo / Hillshade / Off** selector and an **opacity** slider. It stays in sync with the
  layer dock, and opacity applies to the selected basemap preview.
- **Photo** enables only when `/maps/layers` lists a renderable `imagery` layer served through the existing
  georeferenced preview contract (`X-SELENORA-Bounds-M` is required). Today only `moon-trek` exists, and it is
  `REFERENCE_DOC`, so **Photo is disabled with the reason**. No decorative image is substituted.
- Hillshade (LDEM 80 m) works and shows loading, error and attribution states. Contract for Cursor: R2 in
  `docs/FRONTEND_DATA_REQUIREMENTS.md`.

## 2. Screenshots (`docs/screenshots/phase5d/`, from the running app against the isolated API)

| File | Content |
|---|---|
| `01-home-explorer-mode.jpg` | Explorer Mode home: guided CTA, 10-second strip, mode toggle |
| `02-guided-objective.jpg` | Step 1: objective presets with educational-preset disclaimer |
| `03-guided-results-terrain-refused.jpg` | Results for the stored TERRAIN example: refusal explained, known vs uncertain |
| `04-3d-lola-terrain-sun-blocked.jpg` | 3D LOLA terrain at Point A, camera behind the observer, Sun line ending at the higher crest (BLOCKED) |
| `05-3d-first-render-corner-camera.jpg` | Earlier camera position (kept as before/after reference) |
| `06-explorer-basemap-hillshade-opacity.jpg` | Basemap control: Photo disabled with reason, Hillshade on, opacity 40% |
| `07-comparison-explorer-mode.jpg` | Comparison in Explorer Mode: plain summary and collapsed scientific details |
| `08-mobile-guided-sites.jpg` | 375 px: site cards with "5 m terrain" badges |
| `09-mobile-guided-results-real-run.jpg` | 375 px: results of a real run created through the guided flow |

## 3. 3D mesh validation (against the live backend)

| Check | Result |
|---|---|
| Response format inspected before implementation (`raster_preview_service.build_mesh`) | `x_m`, `y_m` stereo metres; `z_m[row][col]` rows ascending y; nearest-pixel samples of the 5 m DEM; nulls outside tile |
| Centre cell vs `/maps/elevation` and `/terrain/coverage` (Point A) | 1592.0411 m = 1592.0411 m = 1592.0411 m |
| Corner cells (0,0), (80,80), (10,70) vs `/maps/elevation` at their lon/lat | identical (1198.28, 355.88, 1231.52 m) |
| Out-of-tile behaviour (Site04 edge request) | 656/1681 cells null, 0 zeros (no fabricated ground) |
| Point B with default layer vs Site01 layer | 5821 nulls vs 0, so the viewer selects the layer from coverage |
| Unit tests (`mesh.test.ts`, 8) | axes and orientation, γ convention, exaggeration preserves slope ratios, bilinear sampling refuses nulls, obstruction angle with curvature drop, holes in geometry, presets within vertex guard |

## 4. Sun direction validation

Point A, 2026-12-01 00:00 UTC. Live observer-series: Sun az 86.072°, el +1.492°, backend terrain horizon 12.66°, state
BLOCKED. Backend horizon-profile bin 86°: 13.05° with the blocker at 425 m.

Ray-casting the 4 km / 50 m mesh from the observer eye (same curvature reference) under different azimuth conventions:

| Convention | Grid bearing | Max terrain angle (mesh) |
|---|---|---|
| **SELENORA = backend: az + γ (γ = 194°)** | 280.07° | **13.00° at 400 m** ✅ matches backend 13.05° at 425 m |
| No convergence (az) | 86.07° | −18.33° |
| az − γ | 252.07° | 7.80° |
| az + 180° | 266.07° | 9.94° |

Only the backend convention reproduces the backend horizon. The 3D view shows 13.00° at 400 m in the UI (screenshot 04).
The small difference comes from mesh resolution (50 m vs 5 m) and range (2 km vs 12 km). This is a visual cross-check
only; the authoritative state remains the backend's.

## 5. Beginner-mode walkthrough (performed in the browser, not a user study)

No human participants were involved, so these are developer walkthroughs, not usability-test results.

1. Home (Explorer Mode) → "Start a guided mission".
2. Objective **Balanced** → sites **Shackleton Rim — Point A** and **Shackleton–de Gerlache Ridge — Point B**. Both are
   badged "5 m terrain"; the other six sites are not, which matches `/terrain/coverage`.
3. "Use a validated example" listed **5** stored analyses of exactly these two sites. I chose the TERRAIN one.
4. Results: **"No site is recommended"**, with the partial-terrain reason in plain words.
   - Point A: "On a smooth Moon the Sun would be up 100%… nearby terrain is higher and hides it the whole time."
   - Uncertainty: "The 5 m terrain reaches the full 12 km in only 6.9% of directions (Point B: 1.4%)."
   - The glossary popover for "partial terrain" opened and read correctly.
5. "View 3D terrain" → Simulator 3D at Point A: Sun line into the crest, TERRAIN-BLOCKED from the server, explanation of
   the 12.66° horizon at about 425 m.
6. Second walkthrough at **375 px**: Sunlight objective → **Bussey Point D** vs **Malapert**. Terrain was correctly
   disabled (neither site is covered). "Choose my own dates" (2 days) → **real analysis run** (`9cdedda6…`,
   EPHEMERIS_GEOMETRIC) → "Best match: Malapert Massif (approx.), leads by 34.2 points". The margin matches the backend
   formula: 94.16 − 60.00.
7. TR switch on the results page: all Phase 5D strings translated; no raw keys found by an automated text scan.

## 6. LROC dependency status

**Blocked on backend.** The UI is ready (selector, opacity, attribution, loading and error states, bounds-checked
placement). `/maps/layers` currently exposes no renderable imagery layer, so Photo is disabled with an explanation.
The required contract (R2: `kind: "imagery"` via `/maps/preview` with `X-SELENORA-Bounds-M`, reprojected to the SELENORA
sphere CRS) is in `docs/FRONTEND_DATA_REQUIREMENTS.md`. Alignment with site coordinates is guaranteed by the same
bounds-header placement already verified for the LDEM hillshade (Shackleton bowl under its marker, Phase 5A/5C).

## 7. Test results

| Command | Result |
|---|---|
| `npx tsc -b` (strict) | ✅ 0 errors |
| `npx vitest run` | ✅ **73 passed** (12 files). Was 58; all previous tests preserved. |
| `npm run build` | ✅. Lazy chunks: `TerrainScene` 256 kB gzip (on demand), `LunarMap` 89 kB, `GuidedMissionPage` 4.5 kB; main 125.5 kB gzip |
| `npx oxlint src` | ✅ 0 errors (fast-refresh warnings only) |

New tests:
- `features/guided/explain.test.ts` (5): stored verdict, re-weighting, refusal under partial terrain, translation
  coverage, example matching.
- `features/terrain3d/mesh.test.ts` (8): see §3.
- `app/App.test.tsx` (+2): Explorer default CTA → `/mission` with expert tools hidden; switching to Scientist reveals
  them. Earlier Scientist-specific tests now set Scientist Mode explicitly.

Browser checks (desktop 1440 and mobile 375):
- No horizontal overflow on `/`, `/mission`, guided results, `/explorer`, `/simulator?view=3d`, `/comparison/*` (two
  analyses) and `/analyst`.
- Progressive-disclosure contents verified: Transparency, weight lab, confidence and geometric-vs-terrain are present
  once expanded.

Note on 3D screenshots: the browser pane was hidden during part of the session, which throttles WebGL frames until the
first input. The scene renders as soon as the pane receives interaction. An explicit camera aim and invalidate-on-mount
were added for robustness.

## 8. Missing backend requirements (for Cursor)

1. **R1 per-epoch stored states** `GET /analyses/{id}/epochs`. Needed so TERRAIN timelines never show "visible or
   unknown" and the 3D Sun direction comes from the stored analysis instead of a live Horizons chunk.
2. **R2 LROC imagery layer** through `/maps/preview` (see §6).
3. Optional for `/maps/mesh`: `sampling`, `observer_z_m` and `true_north_grid_azimuth_deg` fields.
4. Still open from Phase 5A/5C: R3, a coarse whole-cap preview (currently capped at 50 km half-extent).

## 9. Remaining risks

- **Approximate seed coordinates:** Point A's terrain result is sensitive to a few hundred metres. The UI says so on every
  result, but jurors may still read "0% sunlight" as a property of the real Shackleton rim.
- **Live dependency:** the simulator's per-epoch direction requires the live observer-series (JPL availability, ≤ 72 h
  chunks, step ≥ 30 min). R1 removes this.
- **3D bundle size:** a 256 kB gzip chunk, mitigated by on-demand loading. Low-end mobile GPUs were not tested.
- **Hidden-tab rendering:** throttling in hidden panes is browser behaviour; it does not affect visible use.
- **Untranslated data:** site names and descriptions coming from the backend are English-only. Curated TR/EN notes cover
  the 8 seeded sites.
- **Lighthouse and human usability testing: NOT done.**
