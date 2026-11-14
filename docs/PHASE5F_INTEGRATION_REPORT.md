# SELENORA — Phase 5F Immersive Integration Report

**Branch:** `feature/phase5f-immersive-integration`  
**Baseline:** `94aaac3` (`phase5c-integration-rc1`)  
**Merged:** `f5c29d7` (Phase 5E) → then `b3ff13e` (Phase 5D)  
**Date:** 2026-11-14  
**Scope:** Integrate NASA data services + immersive UX; wire LROC photography and authoritative `/epochs`; verify guided beginner flow; fix live UI raster placement, dark Select contrast, and editor Python interpreter alignment.

---

## 1. Merge order (verified)

| Step | Commit | Result |
|------|--------|--------|
| Worktree from Phase 5C | `94aaac3` | Clean |
| Merge Phase 5E | `f5c29d7` | Fast-forward |
| Merge Phase 5D | `b3ff13e` | Ort merge (docs conflict auto-resolved) |

Prior branches/tags preserved. No force-push. No competition submit.

---

## 2. P0 — Real Moon imagery (LROC)

### API verification (before UI change)

| Check | Result |
|-------|--------|
| `GET /maps/layers` → `lroc-wac-south-summer` | `kind=imagery`, `access_mode=wms_allowlisted`, `role=MAP_VISUALIZATION_ONLY` |
| `GET /maps/imagery/sources` | `preview_enabled=true`, `alignment_status=AVAILABLE_WARPED_STEREO` |
| `moon-trek-wac-global` | `REFERENCE_ONLY` / not Explorer basemap |
| `GET /maps/preview?layer_id=lroc-wac-south-summer&…` | PNG + `X-SELENORA-Bounds-M` + Lunaserv attribution |

### Frontend wiring

- `BasemapControl` prefers `lroc-wac-south-summer` / `wms_allowlisted` imagery.
- Photography / Hillshade / Off + opacity connected to existing preview pipeline.
- Static-illumination disclaimer (EN/TR): mosaic lighting ≠ 2026/2027 mission date.
- NASA/LROC attribution shown under the control and on the map overlay.
- Loading / error overlays when a basemap is selected but preview is pending or failed.
- Seeded polar preview window so mobile browsers fetch before first OpenLayers `moveend`.

---

## 3. P0 — Authoritative visibility epochs

### Endpoint

`GET /api/v1/analyses/{id}/epochs` (OpenAPI path present)

Verified on stored TERRAIN analysis `0070745b-…`:

- 2 sites × 25 samples; `duration_semantics=[start_utc, end_utc)`
- First sample: Sun/Earth `BLOCKED`, joint `NOT_VISIBLE`, sun az ≈ 86.07°
- Last sample: `contributes_duration=false` (inclusive STOP → zero hold)

### Frontend

- `contracts.ts`: `analysisEpochs` + `useAnalysisEpochs`
- `adapter.ts`: `resolveSiteEpochs` / `epochsFromAuthoritativeSite` (prefer `/epochs` over window-derived `UNRESOLVED`)
- Wired into workspace analysis, Simulator, Mission Windows (via workspace), Comparison, Guided results
- Simulator skips live Horizons when authoritative Az/El are present
- Provenance copy updated for stored states

---

## 4. P0 — Guided beginner experience

Verified on merged app:

| Check | Result |
|-------|--------|
| Explorer Mode (default on home) | Graduation-cap toggle; plain-language cards |
| Scientist Mode | Full nav (Planner, Windows, Reports); denser Simulator |
| Guided mission `/mission` | Objective presets (Sunlight / Earth / Balanced) |
| Two-site selection | Point A / Point B cards with terrain badges |

---

## 5. Artemis provenance (from 5E, surfaced in UI)

Explorer panel shows **2024 shortlist (9)** and **2022 historical (13)** separately, with note that 2022 is not the current landing plan. No polygons.

---

## 6. Live-UI fixes (added mid Phase 5F)

### 6.1 P0 — Lunar Explorer raster / map placement

#### Root cause (not CSS)

Three stacked issues produced the “tiny centre square / narrow vertical strip on an empty graticule” look:

1. **Hard 50 km half-extent preview cap** (`MAX_HALF_EXTENT_M = 50_000` in `raster_preview_service.py` / `imagery_service.py`). Polar overview spans hundreds of km; a ≤100 km PNG sat as a small island in the middle of the stereo map.
2. **Square-only BBOX from the SPA.** The client requested a single `halfExtent` square even when the OpenLayers viewport was non-square, so tall mobile maps got a thin vertical strip (or a square that ignored aspect).
3. **Missing `ImageStatic.imageSize`.** Non-square PNGs (common once aspect-aware BBOX shipped) were stretched to the stereo extent unless OpenLayers was told the true pixel width/height from `X-SELENORA-Size-Px`.

South-polar stereographic CRS (`a=b=1737400`) and `X-SELENORA-Bounds-M` placement were already correct; the bug was window size + aspect + imageSize, not wrong CRS or a CSS scale hack.

#### Fixes

| Area | Change |
|------|--------|
| Backend | Raise preview half-extent cap **50 km → 400 km** (`raster_preview_service.py`, `imagery_service.py`); tests reject 500 km windows and accept 200 km. |
| Frontend contracts | `PREVIEW_MAX_HALF_EXTENT_M = 400_000`; parse `X-SELENORA-Size-Px` → `imageSize`; adaptive `max_edge_px`. |
| `ExplorerPage` | Aspect-aware `previewBounds(halfWidthM, halfHeightM)`; 280 ms debounce on pan/zoom; seed polar window at max half-extent. |
| `LunarMap` | Emit viewport `halfWidthM` / `halfHeightM` from `size × resolution`; pass `imageSize` into `ImageStatic`. |

#### Verification (dedicated ports — **API `:8030`, SPA `:5180`**)

> **Port collision warning:** `5176` was simultaneously serving **Phase 5D** (`…/phase5d/frontend` vite `--strictPort`) and an older Phase 5F process. Screenshots that still showed a fixed ~100 km island and a **disabled Photo** button were taken against **Phase 5D**, not this branch. Use **http://127.0.0.1:5180** only.

| Check | Result |
|-------|--------|
| `GET /api/v1/maps/layers` via `:5180` proxy | 10 items; `lroc-wac-south-summer` `kind=imagery` `access_mode=wms_allowlisted` |
| `GET /api/v1/maps/imagery/sources` | `lroc-wac-south-summer` `preview_enabled=true`, product page `WAC_ROI_SOUTH_SUMMER` |
| LROC preview ±30 km | `200`, `768x768`, bounds `-30000…30000` |
| Hillshade preview ±30 km | `200`, `750x750`, same bounds |
| UI Photo (5180) | Enabled + checked; overlay shows **dynamic** window (e.g. `44×84 km`); static mosaic disclaimer |
| UI Hillshade (5180) | Toggle works; Shackleton / LOLA footprints align |
| Radix Stored analysis | Dark listbox open with readable options |

Screenshots: `12-ui-photo-5180.png`, `13-ui-hillshade-select-5180.png`, `10-api-photo-60km.png`, `11-api-hillshade-60km.png`, provenance `VERIFY_PORTS_AND_SOURCES.txt`.

#### Follow-up map compositing fixes (same Phase 5F branch)

| Issue | Root cause | Fix |
|-------|------------|-----|
| Circular disc “on top of” imagery | Graticule **region fill** shared `zIndex: 5` with grid lines, above rasters (`zIndex: 1`) | Split region fill to `zIndex: 0`; rasters `zIndex: 2+`; grid/labels stay `5` |
| Photo disabled on wrong SPA | Catalogue from Phase 5D / dead proxy → no `imagery` layer | Dedicated `:5180`→`:8030`; auto-select LROC when catalogue-live |
| Fixed “100 km” caption | Stale SPA **or** old square 50 km half-extent | Dynamic `{{size}}` from real BBOX (`44×84 km` etc.) |
| Initial empty polar disc | Start zoom too wide (`focusLat=-84.5`) | Default `focusLat=-88`; auto-fit LOLA tiles once catalog loads |
| CORS header visibility | `expose_headers` omitted `X-SELENORA-*` | Expose Bounds-M / Size-Px / Attribution; SPA also falls back to requested BBOX + PNG IHDR size |

LROC product: [WAC_ROI_SOUTH_SUMMER](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER) via Lunaserv WMS `luna_wac_roi_south_summer` (static summer mosaic — not mission-date lighting).

---

### 6.2 P0 — Dark-theme “Stored analysis” dropdown

#### Root cause

`AnalysisPicker` used a native `<select>`. OS option popups ignore page CSS, so dark-theme pages showed near-white text on a white system menu.

#### Fixes

- New Radix Select listbox: `frontend/src/components/ui/select.tsx` (dark `bg-bg-2`, high-contrast `text-fg`, highlight/checked/focus, scroll buttons, word-wrap for long titles).
- `AnalysisPicker` switched to that Select; selection still calls `setAnalysis(id)`.
- Remaining native selects (`PlannerPage`, `AnalystPage`, `TimeControls`, `Terrain3DPanel`) keep `NativeSelect` with `[color-scheme:dark]` + `option` colour hints (documented as best-effort; Radix preferred for critical menus).

#### Verification

Open listbox computed styles: option text `rgb(244, 247, 255)` on panel `rgb(16, 24, 39)`. Screenshot: `docs/screenshots/phase5f/05-desktop-analysis-select-open.png`.

---

### 6.3 P1 — VS Code `numpy` / `sqlalchemy` unresolved

#### Root cause

Packages **are installed** in `backend/.venv` (numpy 2.5.4, sqlalchemy 2.1.8). The editor was not pinned to that interpreter, so Pylance reported unresolved imports. Pytest already used the venv.

#### Fixes

- Repo `.vscode/settings.json` → `${workspaceFolder}/backend/.venv/Scripts/python.exe` + `extraPaths` / `venvPath`.
- Phase 5F worktree `.vscode/settings.json` → `${workspaceFolder}/../../backend/.venv/Scripts/python.exe` (shared main venv; no global install).
- `.gitignore` exception: `!.vscode/settings.json` so the interpreter pin can be shared.

No packages reinstalled. No global Python installs.

---

## 7. Tests (re-run after live-UI fixes)

| Suite | Result |
|-------|--------|
| Frontend `npx vitest run` | **76 passed** (includes `parseSizePx` / contracts) |
| Frontend `tsc -b` | Clean |
| Frontend `npm run build` | Production build OK |
| Backend `pytest` (phase5f tree, clean CORS env) | **Green** (121 passed, 1 skipped of 122 collected; CORS flake avoided by clearing `SELENORA_CORS_ORIGINS`) |

Scientific scoring, TERRAIN horizons, and stored-analysis selection behaviour unchanged.

---

## 8. Files touched (Phase 5F delta after merges + live-UI fixes)

**Integration wiring**

- `frontend/src/services/contracts.ts`
- `frontend/src/features/analysis-data/adapter.ts` (+ tests)
- `frontend/src/features/analysis-data/useWorkspaceAnalysis.ts`
- `frontend/src/features/lunar-explorer/BasemapControl.tsx`
- `frontend/src/pages/ExplorerPage.tsx`, `SimulatorPage.tsx`, `ComparisonPage.tsx`, `GuidedMissionPage.tsx`
- `frontend/src/i18n/locales/phase5d.{en,tr}.ts`

**Live-UI fixes**

- `backend/app/services/raster_preview_service.py`, `imagery_service.py`
- `backend/tests/test_maps_phase5b.py`
- `frontend/src/features/lunar-explorer/LunarMap.tsx`
- `frontend/src/features/analysis-data/AnalysisPicker.tsx`
- `frontend/src/components/ui/select.tsx` (new)
- `frontend/src/components/ui/input.tsx` (`NativeSelect` dark hints)
- `frontend/src/services/contracts.test.ts`
- `.vscode/settings.json`, `.gitignore`

**Docs**

- `docs/PHASE5F_INTEGRATION_REPORT.md`, `docs/screenshots/phase5f/*`

---

## 9. Out of scope

- No merge of unrelated agent branches beyond 5D+5E.
- No competition project submission.
- Moon Trek EQ WMTS remains reference-only (not polar basemap).
- No new phase started after Phase 5F close-out.
