# SELENORA — Phase 5C Integration Report

**Branch:** `feature/phase5c-integration`  
**Worktree:** `.worktrees/phase5c`  
**Date:** 2026-11-14  
**Scope:** Merge Phase 5B NASA data services + Phase 5A frontend experience onto the Phase 4.1 science baseline; verify E2E; do **not** submit the competition project; do **not** start Phase 6.

---

## 1. Branches and commits merged

| Role | Ref | Commit |
|------|-----|--------|
| Phase 4.1 baseline (tag preserved) | `phase4.1-terrain-science-validation` | `b3d314d` |
| Phase 5B NASA data services | `feature/phase5b-nasa-data-services` | `f12d426` |
| Phase 5A frontend experience | `feature/phase5a-frontend-experience` | `77e1656` |
| 5B merge into 5C | `feature/phase5c-integration` | `a37fbc8` |
| 5A merge into 5C | `feature/phase5c-integration` | `73e6982` |

**Merge order (as required):** base `b3d314d` → merge 5B → merge 5A.

**Merge-base notes**

- `merge-base(5B, 4.1)` = `b3d314d` (5B branched cleanly from validated terrain).
- `merge-base(5A, 4.1)` = `e5a1059` (Phase 3.3). Phase 5A therefore did **not** contain Phase 4.1 commits in its history; dual-touched frontend science files (`types/api.ts`, `selenoraApi.ts`, `badges.tsx`, `GeometricTerrainCompare.tsx`, `PlannerPage.tsx`) were inspected and match the Phase 4.1 content after merge (identical +164 line delta from `e5a1059` on both sides).

**Pre-merge safety**

- Phase 4.1 tag `phase4.1-terrain-science-validation` on `b3d314d` confirmed.
- Phase 5A and 5B were committed (`77e1656`, `f12d426`) before merge.
- No force-push, no destructive reset, no historical tag rewrite.
- Isolated DB copy: `backend/data/selenora.phase5c.db` (original `selenora.db` untouched).

---

## 2. Merge conflicts and resolutions

| File | Resolution |
|------|------------|
| `docs/FRONTEND_DATA_REQUIREMENTS.md` | Keep Phase 5B API contract + Phase 5A consumption appendix; retitle as Phase 5C integrated contract; append Phase 5C verification table. |
| `frontend/src/features/lunar-explorer/ExplorerPanels.tsx` | Take Phase 5A version (SiteList / CoordinateForm only). Layer UI lives in `LayerDock.tsx` / `SiteInspector.tsx`. |
| `frontend/src/pages/ComparisonPage.tsx` | Keep **both** `GeometricTerrainCompare` (4.1/5B science panel) **and** `ConfidencePanel` (5A lab). |

No branch was overwritten with the other.

**Post-merge stabilization**

- `frontend/vite.config.ts`: add `resolve.dedupe` for `react` / `react-dom` and `optimizeDeps.include` for Recharts — fixes Invalid hook call / null `useContext` when the SPA shares a junctioned `node_modules` across worktrees (Simulator crash).
- `backend/app/db/seed.py`: add Bussey 2010 Points C and D as **additional** candidates only (Point A/B unchanged). See §5.

---

## 3. Complete feature inventory

### Backend (Phase 5B + 4.1)

- Map catalog / preview / elevation / mesh (`/api/v1/maps/*`)
- Terrain catalog / coverage / horizon-profile (`/api/v1/terrain/*`)
- Ephemeris observer-series (`/api/v1/ephemeris/observer-series`)
- Artemis region names + official links only (`/api/v1/artemis/regions`)
- Analyses + timeline + explain (GEOMETRIC default; TERRAIN with Phase 4.1 rules)
- Health components: database, Horizons client, scientific engine, terrain model, AI analyst

### Frontend (Phase 5A + preserved 4.1 UI)

- Mission Control / home workspace
- Lunar Explorer 2.0 (layer dock, LOLA footprints, A/B inspector, Artemis panel)
- Horizon Simulator (UTC playback, panorama, live observer-series)
- Mission Planner (GEOMETRIC + TERRAIN)
- Site Comparison (Geometric↔Terrain table, confidence panel, weight lab)
- Mission Windows heatmap
- AI Mission Analyst + Mission Reports
- TR/EN i18n

---

## 4. API compatibility results

Isolated stack: API `http://127.0.0.1:8001`, SPA `http://127.0.0.1:5175` (proxy + CORS).

| Endpoint | Result |
|----------|--------|
| `GET /health` | OK — terrain READY, DeepSeek configured, algo geometric stamp on health; TERRAIN analyses report `0.4.1-phase4.1-validation` |
| `GET /api/v1/maps/layers` | 8 layers; roles SCIENCE_VALIDATED_LOCAL / MAP_VISUALIZATION_ONLY / REFERENCE_DOC |
| `GET /api/v1/maps/preview` | `image/png` + `X-SELENORA-Bounds-M` + role header |
| `GET /api/v1/maps/elevation` | Point A → Site04, Z≈1592.04 m |
| `GET /api/v1/maps/mesh` | JSON preview + scientific warning |
| `GET /api/v1/terrain/horizon-profile` | Point A `LOCAL_TERRAIN_PARTIAL`, γ≈194° |
| `GET /api/v1/ephemeris/observer-series` | Requires `end_utc` (not `stop_utc`); frontend contracts match |
| `GET /api/v1/artemis/regions` | 13 regions; geometry always null |
| `POST /api/v1/analyses` TERRAIN | `data_quality=LOCAL_TERRAIN_PARTIAL`; scores/ranks null; recommendation null |
| `GET /api/v1/analyses/{id}/explain` | Cached report OK |
| CORS | `Access-Control-Allow-Origin: http://127.0.0.1:5175` |

Authoritative contract: `docs/FRONTEND_DATA_REQUIREMENTS.md`.

---

## 5. Scientific validation

### Preserved Phase 4.1 behaviour

- True-north / grid convergence (Point A γ ≈ **194.0°**; Point B γ ≈ **218.2°**)
- Local LOLA Site01/04 DEM only for TERRAIN science
- VISIBLE / BLOCKED / UNKNOWN semantics; UNKNOWN ≠ clear sky
- `LOCAL_TERRAIN_PARTIAL` → **no ranking** (confirmed on live TERRAIN run `0070745b-…`)
- Duration invariant `[start, end)` retained (`algorithm_version` terrain stamp `0.4.1-phase4.1-validation`)
- No fabricated AI science; DeepSeek explains stored results only

### Point A obstruction investigation (Claude finding)

**Seed unchanged:** Shackleton Rim — Point A = **89.68° S, 166.0° W** (Bussey et al. 2010 Point A; `APPROXIMATE_REFERENCE`).

Live Site04 LOLA 5 m:

| Metric | Value |
|--------|-------|
| Stereo (m) | x≈−2347.5, y≈−9415.3 |
| Surface Z | ≈1592.04 m |
| Complete coverage @ 12 km | ≈7.2% |
| Horizon @ true az 86° | ≈**13.05°** |
| Distance to blocker @ az 86° | **425 m** |
| Local ring ΔZ | +13 m @ 50 m → +137 m @ 625 m (nearby higher terrain) |

Along the Sun azimuth ray, elevation angle already exceeds ~9–12° within **25–350 m**. Geometric Sun elevation (~+1.5°) is therefore terrain-blocked for the tested Dec 2026 window. This is consistent with an approximate seed sitting **below** a local rim crest, not proof that Bussey’s illuminated crest does not exist nearby.

**No automatic relocation of Point A or B.**

### Alternate candidates added (provenance only)

From Bussey et al. (2010), Icarus 208 — **separate seeds**, not replacements:

| ID | Coordinates | Note |
|----|-------------|------|
| `bussey-2010-point-c` | 88.71° S, 68.7° W | de Gerlache rim literature point |
| `bussey-2010-point-d` | 88.74° S, 124.5° E | Abstract “most illuminated” place (~86% of 2020 map) |

Neither is covered by local Site01/04 DEM tiles; TERRAIN will report no local coverage. GEOMETRIC remains available. No winner was fabricated.

---

## 6. Backend test results

```
110 passed (pytest -q) on feature/phase5c-integration worktree
```

Includes Phase 5B map tests + Phase 4.1 terrain / duration suites.

---

## 7. Frontend test results

```
Test Files  10 passed (10)
Tests       58 passed (58)
```

- `npx tsc -b` — clean  
- `npm run build` — production build OK  

---

## 8. Browser screenshots and responsive tests

Isolated SPA against merged API (`:5175` → `:8001`).

| File | Coverage |
|------|----------|
| `docs/screenshots/phase5c/phase5c-02-explorer-hillshade.png` | Explorer layer dock + LIVE SCIENCE/VIZ roles |
| `docs/screenshots/phase5c/phase5c-03-simulator-terrain.png` | Simulator TERRAIN A, LOCAL_TERRAIN_PARTIAL 7.2%, live Δ=0 |
| `docs/screenshots/phase5c/phase5c-04-comparison-terrain-refused.png` | Ranking refused; Geometric vs Terrain + Confidence |
| `docs/screenshots/phase5c/phase5c-05-mobile-explorer-375.png` | 375px layout (hamburger nav / comparison cards) |

**Manually verified in browser**

- Lunar Explorer 2.0, layer controls, LOLA overlays, A/B + Bussey C/D list, Artemis names  
- Mission Planner GEOMETRIC + TERRAIN options  
- GEOMETRIC analyses listed; TERRAIN partial analysis end-to-end  
- Sun/Earth Horizon Simulator + UTC playback controls  
- Mission Windows heatmap (terrain-aware cells)  
- Mission Comparison Lab (UNRANKED / weight lab disabled under partial terrain)  
- DeepSeek cached explain  
- TR ↔ EN switching  
- Mobile 375px shell  

**Console**

- Initial Simulator crash (Recharts Invalid hook call) reproduced under shared `node_modules` junction; fixed via Vite `dedupe` + cache clear. After fix: no recurring console errors on Simulator/Comparison/Windows.

---

## 9. Remaining functional issues

1. **R1** — no `GET /analyses/{id}/epochs`; lanes/heatmaps still derive some states (UNRESOLVED class).  
2. **R2** — lunar imagery basemap unavailable (`moon-trek` is REFERENCE_DOC only).  
3. **R3** — `/maps/preview` half-extent capped at 50 km.  
4. **R4** — `/maps/mesh` not consumed (no 3D viewer).  
5. **Point A seed** — scientifically obstructed locally; keep as coordinate-sensitivity demo or let jurors pick Bussey C/D / verified rim coords.  
6. **Public demo DEM dependency** — TERRAIN science still needs gitignored local Site01/04 GeoTIFFs (or an explicit download step). Visualization layers can use VSICURL when NASA is reachable.  
7. **Worktree tooling** — prefer dedicated `npm install` per worktree; shared junctions require Vite dedupe/cache hygiene.

---

## 10. Public demo readiness

| Item | Status |
|------|--------|
| Env vars documented (`backend/.env.example`, `frontend/.env.example`) | OK |
| DeepSeek key backend-only | OK (never in frontend) |
| NASA / Horizons reachability | Live ephemeris + explain exercised |
| VSICURL Product 90 previews | Hillshade preview OK in session |
| Startup | `uvicorn` + `vite` / production `vite build` |
| Production API URL | Set `VITE_API_BASE_URL` for non-proxy deploys |
| DB migrations | Alembic on startup |
| Local DEM gitignored | `data/raw/` ignored |
| Safe degrade without remote rasters | REFERENCE_DOC / UNAVAILABLE layer states; TERRAIN disabled if no local DEM (`health` reports) |
| Undocumented local files | **Must document** Site01/04 placement for TERRAIN jury demos |

**Verdict:** Integration is functionally ready for an internal RC demo. Public competition submission is **out of scope for Phase 5C** (per instructions). TERRAIN science demos require publishing a DEM acquisition note or shipping a documented download script — do not rely on a silently running developer machine.

---

## 11. Proposed release commit / tag

After committing Phase 5C stabilization (seeds, Vite dedupe, this report, screenshots):

- **Branch tip:** `feature/phase5c-integration`
- **Proposed tag:** `phase5c-integration-rc1`  
  - Annotated RC tag on the post-stabilization commit  
  - Does **not** modify `phase4.1-terrain-science-validation` or earlier tags  

**Not done in this phase**

- Competition project submission  
- Phase 6  

---

## Appendix — isolated runtime used for verification

```
API:  http://127.0.0.1:8001  (SELENORA_DATABASE_URL=sqlite:///./data/selenora.phase5c.db)
SPA:  http://127.0.0.1:5175  (SELENORA_BACKEND_URL=http://127.0.0.1:8001)
LOLA: junction → repo data/raw/lola (Site01 + Site04)
```
