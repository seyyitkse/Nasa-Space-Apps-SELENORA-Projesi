# SELENORA Submission Integration Report

| | |
|---|---|
| Worktree | `.worktrees/release-submission-final` |
| Branch | `release/selenora-submission-2026` |
| Base | `origin/main` @ `6e283a021d06490da9ded29a413a4fb36099d827` |
| Feature merge tip | `0480fda264035c03d113c087d75215ca812bc67a` (7D+7E merges) |
| Date | 2026-11-15 (Türkiye) |
| **Verdict** | **READY** |

## Included phases

| Phase | Branch tip | Status |
|---|---|---|
| 7A / 7B / 7C | already on `origin/main` (`6e283a0`) | retained |
| **7D** DEM MVP | `feature/phase7d-dem-mvp` @ `7456930` | **INCLUDED** (full history merge `24c2a76`) |
| **7E** Missions MVP | `feature/phase7e-mission-mvp` @ `07aeaea` | **INCLUDED** (full history merge `0480fda`) |

Phase 7E was included because it met all readiness gates: source-backed catalog, real 3D Moon markers, status/uncertainty distinctions, TR/EN, browser evidence, backend/frontend tests, and a committed READY report.

## Exact commit ancestry

```text
*   0480fda  Merge Phase 7E Lunar Missions MVP into submission release candidate.
|\
| * 07aeaea  docs: set Phase 7E report HEAD to tip
| * …        Phase 7E feature + docs commits
* | 24c2a76  Merge Phase 7D DEM MVP into submission release candidate.
|\|
| * 7456930  docs(phase7d): stabilize commit list wording in report
| * …        Phase 7D feature + docs commits
|/
* 6e283a0  Merge pull request #7 from seyyitkse/release/phase7bc-stable  (origin/main)
```

Plus focused docs commits for this integration report/evidence. Merge commits preserve full Phase 7D and 7E histories. **Not merged into `main`.**

## Quality gates (release candidate)

Temp SQLite only (`selenora-submission-final.db`). Production DB untouched. Compact summary: `docs/screenshots/submission-integration/gate-summary.json`.

| Gate | Result |
|---|---|
| Backend pytest (full) | **292 passed**, 1 skipped, 4 deselected |
| Phase 7D + 7E subset | **36 passed**, 1 deselected |
| Phase 7D live remote mesh | **1 passed** (`REMOTE_PGDA90` @ −88.5°, 0°) |
| Frontend Vitest | **219 passed** (32 files) |
| TypeScript `tsc -b` | **PASS** |
| oxlint | **PASS** (0 errors; pre-existing warnings) |
| Production `vite build` | **PASS** |

## API / science probes (this worktree)

| Check | Result |
|---|---|
| Local 5 m mesh (Shackleton Rim) | `coverage_tier=LOCAL_5MPP`, `native_resolution_m=5`, Product 78 |
| Remote Product 90 mesh (−88.5°, 0°) | `coverage_tier=REMOTE_PGDA90`, `native_resolution_m=40`, `surface_z_m≈-1421`, `nodata_fraction=0` |
| Horizon outside local tiles | HTTP **422** `TERRAIN_UNAVAILABLE` (no crash / no fake horizon) |
| Missions catalog | **17** items, catalog v1.1.0, frame `MOON_ME` |
| OpenAPI 7A/7B/7C/7D/7E | events, solar-potential, scenarios, mesh, missions present (`api-smoke.json`) |

## Browser evidence (release QA)

Captured against frontend `http://127.0.0.1:5190` → backend `http://127.0.0.1:8030` (temp SQLite only).

| Path | What it shows |
|---|---|
| `docs/screenshots/submission-integration/01-moon-missions-layer.png` | Standard Moon + Lunar Missions layer ON |
| `docs/screenshots/submission-integration/02-apollo11-detail.png` | Apollo 11 fly-to + source-backed detail |
| `docs/screenshots/submission-integration/03-clps-tr-i18n.png` | TR UI + CLPS filter (`Ay Görevleri`) |
| `docs/screenshots/submission-integration/04-mobile-375.png` | 375 px mobile Moon + missions chrome |
| `docs/screenshots/submission-integration/05-explorer-local-5m-dem.png` | Explorer with live local LOLA Site04 5 m coverage |
| `docs/screenshots/submission-integration/07-tr-apollo11.png` | Fresh TR + Apollo 11 marker |
| `docs/screenshots/submission-integration/08-mobile-375.png` | Fresh 375×812 mobile Apollo 11 |
| `docs/screenshots/submission-integration/09-phase7c-scenarios.png` | Phase 7C Date Scenarios still operational |
| `docs/screenshots/submission-integration/02-phase7d-remote-dem.png` | 7D remote DEM custom-point UI |
| `docs/screenshots/submission-integration/03-phase7d-provenance.png` | 7D PGDA90 provenance panel |
| `docs/screenshots/phase7d-mvp/*` | Prior Phase 7D package (merged) |
| `docs/screenshots/phase7e-mvp/*` | Prior Phase 7E package (merged) |

Custom-point creation remains on Moon page; research-site list unchanged beside the optional missions layer.

## Scientific provenance

- **Horizon / scoring / illumination:** still local Product 78 only; remote DEM is **mesh visualization fallback**, not horizon science.
- **Product 78:** [PGDA Product 78](https://pgda.gsfc.nasa.gov/products/78) — local Site01/Site04 5 m GeoTIFFs.
- **Product 90:** [PGDA Product 90](https://pgda.gsfc.nasa.gov/products/90) — remote elevation COGs via range reads.
- **Missions:** NSSDC, LROC Wagner et al. 2016, NASA CLPS + IAU Gazetteer centroids for planned/failed **regions only**; no invented ME↔PA remapping; Apollo 13 / unnamed far-side & south-pole planned targets stay list-only.

## Remaining limitations

- NASA Moon GLBs are **runtime-local** (`npm run fetch:moon`); not committed (gitignored).
- Local LOLA rasters are hardlinked for QA; not committed.
- Planned CLPS rings use IAU feature centroids (tens of km), not unpublished landing ellipses.
- Mission catalog is static JSON (no live scrape).
- oxlint warnings elsewhere are pre-existing and non-blocking.
- This branch is a **release candidate only** — not merged to `main`.

## Delivery checklist

- [x] Isolated worktree from verified `origin/main`
- [x] Phase 7D full merge + regression
- [x] Phase 7E readiness verified then merged + regression
- [x] Full pytest / vitest / tsc / lint / build
- [x] Real browser journeys (missions, TR/EN, mobile, DEM, 7C scenarios)
- [x] Integration report
- [x] Push `release/selenora-submission-2026`
- [x] **Do not** merge to `main`

## Verdict

**READY** for NASA Space Apps final submission as the tested 7D+7E release candidate on `release/selenora-submission-2026`.

## Final Git SHA

See branch tip after this commit (`git rev-parse HEAD` on `release/selenora-submission-2026`).
