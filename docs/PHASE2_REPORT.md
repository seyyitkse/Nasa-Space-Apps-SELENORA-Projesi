# SELENORA Phase 2 — Cursor Development Report

**Date:** 2026-11-14  
**Branch:** `feature/phase2-scientific-mvp`  
**Algorithm version:** `0.2.0-phase2`

---

## A. Project Status

Phase 2 **Scientific MVP is complete** against the acceptance criteria in the Phase 2 prompt.

End-to-end path: Mission Planner → `POST /api/v1/analyses` → NASA/JPL Horizons → geometric Sun/Earth/joint visibility → deterministic ranking → SQLite persistence → Site Comparison charts + Science Transparency → Mission Reports reload by id.

Phase 1 UI, synthetic demo, DeepSeek skeleton, and LOLA placeholders were preserved. Phase 3 was **not** started.

---

## B. Changed Files

### Added
- `backend/app/services/analysis_service.py` — Horizons orchestration, align, persist, cache
- `backend/app/services/result_builder.py` — shared site/timeline/interval builders
- `backend/tests/test_analysis_service.py` — pipeline + live e2e tests
- `frontend/src/features/site-comparison/ScienceTransparencyPanel.tsx`
- `docs/PHASE2_REPORT.md`

### Updated (high level)
- Backend: `analyses.py`, `models/analysis.py`, `demo_analysis_service.py`, `health_service.py`, `data_source_service.py`, `config.py` (`ALGORITHM_VERSION`), `test_api.py`
- Frontend: Planner, Comparison, Reports, router, `selenoraApi`, `useApi`, i18n EN/TR, dashboard status, App.test
- Docs: `PROGRESS`, `TEST_RESULTS`, `NEXT_STEPS`, `ARCHITECTURE`, `API_CONTRACT`, `DATA_SOURCES`, `DECISIONS`, `README`

### Removed
- None (501 analysis stubs replaced; synthetic path kept)

---

## C. NASA Integration

| Item | Status |
|---|---|
| Horizons client (`ANG_FORMAT`, `coord@301`, QUANTITIES=4) | Preserved + used in production path |
| Live single-body test | ✅ passed |
| Live 2-site analysis (2027-03 window) | ✅ passed |
| Fixtures (Dec 2026 Shackleton) | Still drive unit parser/elevation checks |
| Frame / DE441 | Taken from live response headers when present; **not** hard-coded into cache keys |

---

## D. Scientific Engine

Implemented metrics (geometric horizon, airless):

- Sun / Earth / Joint visibility %
- Longest sunlight, darkness, Earth visibility, communication gap, joint window
- Windows merged from sample-and-hold runs (±1 step)
- Score = 0.4×Sun + 0.4×Earth + 0.2×Joint (user-editable; must sum 100)
- Ranking dense; ties → no recommendation
- Missing data → NaN → `PARTIAL` + no score when missing > 5%

**Limitations (surfaced in UI):** no LOLA topography; Earth above horizon ≠ link budget; scores are not NASA-endorsed safety scores; hourly samples are not second-precise event times.

---

## E. Backend

| Endpoint | Behaviour |
|---|---|
| `POST /api/v1/analyses` | 202 + real analysis / cache hit; 502 on Horizons failure; 501 for TERRAIN |
| `GET /api/v1/analyses` | List statuses |
| `GET /api/v1/analyses/{id}` | Full `AnalysisResult` |
| `GET /api/v1/analyses/{id}/timeline` | Elevation series |
| `POST /demo/synthetic-analysis` | Unchanged, labelled `SYNTHETIC_DEMO` |
| `POST …/explain` | Still 501 (Phase 3) |

---

## F. Frontend

- Planner: real submit, Horizons loading copy, navigate to `/comparison/:id`
- Comparison: stored id route + demo mode; charts from API timelines; no synthetic banner on real data
- Reports: clickable stored analyses → `/reports/:id`
- Science Transparency on comparison + reports
- Design system / pages not redesigned

---

## G. Performance

| Metric | Result |
|---|---|
| Cached identical analysis | Instant id reuse; 0 Horizons calls (tested) |
| Live short 2-site × 2-day × 360 min | Passed in live pytest session |
| Synthetic 10×30d timings | Phase 1 figures only — **not** mixed with Horizons |
| Load / Lighthouse | **NOT MEASURED** |

---

## H. Testing

```text
Backend unit/API:  49 passed (2 live deselected by default)
Backend live:      2 passed (pytest -m live -o addopts="")
Frontend:          27 passed (vitest)
TypeScript:        tsc -b — 0 errors
Production build:  npm run build — success
```

---

## I. Known Issues

1. Existing local SQLite DB created in Phase 1 may lack new columns (`result_json`, etc.) — delete/recreate `backend/data/selenora.db` if migrations fail at runtime; Alembic still pending.
2. Large analyses still run synchronously in the HTTP request (demo-scale OK; background jobs deferred).
3. Recharts warns about 0×0 size in jsdom tests (non-fatal).
4. DeepSeek model id still unverified against live `/models` (no key).
5. Seed sites remain `APPROXIMATE_REFERENCE`.

---

## J. Phase 3 Handoff (next three tasks)

1. Implement `/analyses/{id}/explain` with DeepSeek + AI number guard (requires user API key).
2. Add Alembic migrations for analysis JSON columns / AI reports.
3. Wire Analyst page generate flow; keep scientific charts independent of AI failures.

**Do not start Phase 3 without explicit user approval.**
