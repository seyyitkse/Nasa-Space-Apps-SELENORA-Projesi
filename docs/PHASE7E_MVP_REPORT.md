# SELENORA — Phase 7E MVP Report: Lunar Missions Layer

| | |
|---|---|
| Branch | `feature/phase7e-mission-mvp` |
| Worktree | `.worktrees/phase7e-mvp` |
| Base | `6e283a0` — *Merge pull request #7 from seyyitkse/release/phase7bc-stable* (`origin/main`) |
| HEAD | `f07b2b9` — docs inventory closeout (feature tip) |
| Feature commits | `c0a9a8d` (catalog API), `bc5a072` (UI layer), docs commits through `f07b2b9` |
| Date | 2026-11-15 |
| Verdict | **READY** |

## 1. Objective

Optional, scientifically verifiable **Lunar Missions** history layer on SELENORA’s global 3D Moon: Apollo + CLPS, verified coordinates only, distinct actual landings vs planned/failed target regions, TR/EN i18n, Standard/High Moon compatible, 375px mobile usable. No merge to `main`. No changes to deterministic science/scoring or custom research points.

## 2. Source catalog & uncertainty

Catalog file: `backend/app/data/mission_catalog.v1.json` (v1.1.0).  
API: `GET /api/v1/missions` (filters: `program`, `outcome`, `confidence`).

### Coordinate policy (ME / PA)

Authoritative sources (NSSDC, LROC Wagner et al. 2016) publish a **single** Mean Earth/Polar Axis (ME/PA) DE421 body-fixed product. The catalog stores:

- `coordinate_frame`: `MOON_ME` (SELENORA sphere display frame)
- `source_coordinate_system` / `source_frame_label` per mission (verbatim source wording)
- catalog `me_pa_policy`: **no invented ME↔PA remapping**
- IAU Gazetteer centroids use `IAU_GAZETTEER_PLANETOGRAPHIC` and only for **planned/failed target REGION rings**

### Included missions

| ID | Program | Outcome | Marker | Source |
|---|---|---|---|---|
| apollo-11…12,14…17 | APOLLO | Successful landing | Exact pin (LM) | [NSSDC lunar sites](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html), [LROC Wagner 2016](https://lroc.im-ldi.com/images/938) |
| apollo-13 | APOLLO | Aborted (no touchdown) | **List only** | NSSDC |
| im-1-odysseus | CLPS | Partial (tipped) | Exact pin | [LROC IM-1](https://lroc.im-ldi.com/images/1360) (−80.13°, 1.44°E) |
| im-2-athena | CLPS | Partial (tipped) | Exact pin | [LROC IM-2](https://lroc.im-ldi.com/images/1408) (−84.7906°, 29.1957°E) |
| blue-ghost-1 | CLPS | Successful | Exact pin | [LROC Blue Ghost](https://lroc.im-ldi.com/images/1407) (18.5623°N, 61.8103°E) |
| peregrine-m1 | CLPS | Failed (no landing) | Region ring only | [NASA CLPS](https://science.nasa.gov/lunar-science/clps-deliveries/) + IAU Sinus Viscositatis centroid |
| im-3, griffin-m1, blue-ghost-3, im-4 | CLPS | Planned | Region ring (IAU feature centroid) | NASA CLPS + IAU Gazetteer |
| blue-ghost-2, blue-ghost-4 | CLPS | Planned | **List only** (far side / south pole name only) | NASA CLPS |

### Uncertainty labels

- Apollo LM positions: Wagner et al. 2016 uncertainties (0.3–3.5 m) stored as `coordinate_uncertainty_m`
- Recent CLPS LROC pins: published to 0.01° or 4 decimals; formal ±m often unpublished → noted in `coordinate_precision_note`
- Planned/failed regions: `FEATURE_CENTROID_APPROXIMATE` or `NONE` — never fabricated exact markers
- Apollo sites: `south_polar=false`, `explorer_coverage=false` (not polar Explorer basemap pins)

## 3. Implementation summary

### Backend

- `backend/app/data/mission_catalog.v1.json`
- `backend/app/schemas/missions.py` — safety validators (no touchdown ⇒ no actual lat/lon)
- `backend/app/services/mission_catalog.py` — enrichment via `lunar_sphere.lonlat_to_cartesian`; `marker_kind` ∈ {ACTUAL_LANDING, PLANNED_TARGET_REGION, LIST_ONLY}
- `backend/app/api/v1/missions.py` + router registration
- `backend/tests/test_missions_catalog.py` — 29 tests

### Frontend

- `frontend/src/features/lunar-missions/` — types, API hook, MissionPanel, tests
- `MoonScene` / `MoonExplorer` — optional mission overlays (solid = landing, ring = planned region)
- `MoonPage` — optional layer toggle; does not alter research-site pins or create-point flow
- i18n: `phase7e.en.ts` / `phase7e.tr.ts`

## 4. Quality gates

| Gate | Result | Log |
|---|---|---|
| Backend pytest (full) | **PASS** — 269 passed, 17 skipped (no local LOLA GeoTIFFs), 3 deselected, EXIT=0 | `pytest-full.log` |
| Mission pytest subset | **PASS** — 29 passed | `pytest-missions.log` |
| Frontend vitest | **PASS** — 218 passed (32 files), including 4 lunar-missions tests | `vitest-full.log` / `vitest-missions.log` |
| `tsc -b` | **PASS** | `tsc.log` |
| oxlint | **PASS** (0 errors; pre-existing warnings elsewhere) | `lint.log` |
| `vite build` | **PASS** | `build.log` |
| Browser verification | **PASS** | screenshots below |

## 5. Browser evidence

Verified at `http://127.0.0.1:5185/moon` against backend `http://127.0.0.1:8025` (both health-checked LISTENING; not restarted for closeout).

| File | What it shows |
|---|---|
| `docs/screenshots/phase7e-mvp/01-missions-layer-on.png` | Layer ON; near-side mission pins + Apollo/CLPS filters |
| `docs/screenshots/phase7e-mvp/01-missions-layer-apollo11.png` | Apollo 11 selected with detail + globe pin |
| `docs/screenshots/phase7e-mvp/02-apollo11-detail.png` | Fly-to Apollo 11 site label on Standard Moon |
| `docs/screenshots/phase7e-mvp/02-missions-clps-tr.png` | CLPS filter + Turkish UI (`Ay Görevleri`) |
| `docs/screenshots/phase7e-mvp/03-tr-i18n.png` | Full TR chrome with missions layer |
| `docs/screenshots/phase7e-mvp/03-missions-mobile-375.png` | 375px mobile Moon chrome |
| `docs/screenshots/phase7e-mvp/04-mobile-375.png` | 375px mobile with Apollo 11 marker |
| `docs/screenshots/phase7e-mvp/04-missions-panel-mobile-375.png` | 375px missions panel + filters |

## 6. What was done / limitations

**Done**

- Verified Apollo + CLPS catalog with source URLs and access date 2026-11-15
- Optional Lunar Missions layer on global 3D Moon only
- Distinct visual states: successful / partial / unsuccessful / aborted / planned
- Apollo/CLPS + outcome filters; source-backed detail panel
- Apollo 13 / unnamed far-side & south-pole planned missions stay list-only
- Scoring / seed sites / custom research points untouched

**Known limitations**

- Local LOLA rasters not present in this worktree → 17 terrain-related tests skipped (not Phase 7E regressions)
- High-quality Moon GLB not required for MVP verification (Standard used)
- Planned-target rings use IAU feature centroids (tens of km), not unpublished landing ellipses
- Catalog is static JSON (no live NASA scrape at runtime)
- Branch not merged; not pushed unless requested

## 7. Verdict

**READY** for Phase 7E MVP review: catalog is source-backed, markers are not fabricated for unlocated missions, quality gates pass, and browser evidence shows the interactive layer on the global 3D Moon.
