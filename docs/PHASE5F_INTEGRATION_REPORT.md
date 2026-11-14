# SELENORA — Phase 5F Immersive Integration Report

**Branch:** `feature/phase5f-immersive-integration`  
**Baseline:** `94aaac3` (`phase5c-integration-rc1`)  
**Merged:** `f5c29d7` (Phase 5E) → then `b3ff13e` (Phase 5D)  
**Date:** 2026-11-14  
**Scope:** Integrate NASA data services + immersive UX; wire LROC photography and authoritative `/epochs`; verify guided beginner flow.

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

### Live UI check (API `:8002`, SPA `:5176`)

- Photo enabled (no longer disabled).
- Raster preview note: ~62–100 km window; static LROC disclaimer visible.
- Zoom-to-LOLA window shows grayscale WAC mosaic over Shackleton region with site markers.
- Screenshots: `docs/screenshots/phase5f/01-…`, `02-…`.

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

## 6. Tests

| Suite | Result |
|-------|--------|
| Frontend `npx vitest run` | **75 passed** (12 files) |
| Frontend `tsc -b` | Clean |
| Backend (Phase 5E suite on this tree) | Inherited green from `f5c29d7` (117 passed, 1 skipped) |

---

## 7. Files touched (Phase 5F delta after merges)

- `frontend/src/services/contracts.ts`
- `frontend/src/features/analysis-data/adapter.ts` (+ tests)
- `frontend/src/features/analysis-data/useWorkspaceAnalysis.ts`
- `frontend/src/features/lunar-explorer/BasemapControl.tsx`
- `frontend/src/pages/ExplorerPage.tsx`, `SimulatorPage.tsx`, `ComparisonPage.tsx`, `GuidedMissionPage.tsx`
- `frontend/src/i18n/locales/phase5d.{en,tr}.ts`
- Fixture updates in heatmap / phase5a component tests
- `docs/PHASE5F_INTEGRATION_REPORT.md`, `docs/screenshots/phase5f/*`

---

## 8. Out of scope

- No merge of unrelated agent branches beyond 5D+5E.
- No competition project submission.
- Moon Trek EQ WMTS remains reference-only (not polar basemap).
