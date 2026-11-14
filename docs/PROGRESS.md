# Progress

_Last updated: 2026-11-14 — end of Phase 2 Scientific MVP._

## Phase 1 — Premium Foundation ✅ complete

(Unchanged — see git history / prior report.)

## Phase 2 — Scientific MVP ✅ complete

### Backend
- [x] `POST /api/v1/analyses` runs real JPL Horizons observer Az/El for Sun (10) + Earth (399) at lunar GEODETIC sites (`coord@301`)
- [x] Bounded concurrency (`asyncio.Semaphore(4)`), retries, timeouts retained on Horizons client
- [x] Align Sun/Earth samples by UTC; missing → NaN (never silent zero); `PARTIAL` if missing > 5%
- [x] Visibility engine (geometric horizon) + deterministic scoring/ranking on real elevations
- [x] Persist `MissionAnalysis` (+ `result_json` / `timeline_json`), site rows, timelines, provenance, `CachedResult`
- [x] Cache key includes coords, range, step, horizon, algorithm version, data-source contract
- [x] `GET /analyses`, `GET /analyses/{id}`, `GET /analyses/{id}/timeline` return stored real results
- [x] `SYNTHETIC_DEMO` path kept separate (`POST /demo/synthetic-analysis`)
- [x] TERRAIN horizon still 501 (Phase 4); `/explain` still 501 (Phase 3)
- [x] Health: `scientific_engine=READY`; data-sources: `jpl-horizons=INTEGRATED`
- [x] Algorithm version `0.2.0-phase2`
- [x] Unit/API tests for pipeline + **2 live Horizons tests passed** (single-body + 2-site analysis)

### Frontend
- [x] Mission Planner submits real `POST /analyses` (180 s timeout), navigates to `/comparison/:id`
- [x] Loading / Horizons-fetch UI; honest API errors (no Phase-2 501 panel)
- [x] Site Comparison loads stored analyses by id; charts from real timelines
- [x] Data-quality badges; SyntheticBanner **only** for `SYNTHETIC_DEMO`
- [x] Science Transparency panel (provenance, coords, horizon, assumptions, limitations)
- [x] Mission Reports: stored analysis links → `/reports/:id`
- [x] Routes: `comparison/:analysisId`, `reports/:analysisId`
- [x] EN/TR strings updated; dashboard capability status marks ephemeris pipeline live

## Not done / known gaps (by design for Phase 2)

- [ ] DeepSeek briefings (Phase 3) — client exists; `/explain` returns 501
- [ ] LOLA terrain horizon & base raster (Phase 4)
- [ ] Alembic migrations (SQLite `create_all` still used; new JSON columns added for fresh DBs)
- [ ] Async background jobs for very large analyses (current path runs synchronously then returns 202 COMPLETED)
- [ ] PDF export (print only)
- [ ] Lighthouse & load testing (NOT MEASURED for real Horizons under load)
- [ ] Official Artemis candidate-region coordinates (seed sites remain `APPROXIMATE_REFERENCE`)

## Phase 3 — AI Mission Briefing ⏳ awaiting approval
See `docs/NEXT_STEPS.md`.
