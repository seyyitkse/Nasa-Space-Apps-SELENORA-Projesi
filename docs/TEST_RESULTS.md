# Test Results

Environment: Windows 11 Pro, Python 3.12.10, Node 24.15.0, npm 11.12.1.
Run date: **2026-11-14** (Phase 2). Only tests listed here were actually executed.

## Backend — `cd backend; .\.venv\Scripts\python.exe -m pytest -v`

**49 passed, 2 deselected (live)** in ~4–5 s.

| File | Tests | Covers |
|---|---|---|
| `tests/test_api.py` | 10 | Health READY engine; sites approximate; data-sources `jpl-horizons=INTEGRATED`; mocked Horizons create analysis 202 + COMPLETED; validation rejects; unknown 404; synthetic demo; CORS; rate limit |
| `tests/test_integrations.py` | 15 | Horizons query/parser/retry; real fixture parse; DeepSeek offline behaviours; AI guard; secret redaction (+ 1 live deselected) |
| `tests/test_science.py` | 16 | Visibility, scoring, synthetic model, cache keys |
| `tests/test_analysis_service.py` | 8 | Align NaN; fixture elevations; PARTIAL refuse rank; joint intersection; persist+cache; Horizons 502→FAILED; TERRAIN 501; cache key sensitivity (+ 1 live deselected) |

### Live integration — `pytest -m live -o addopts=""`

**2 passed** (2026-11-14).

| Test | Result |
|---|---|
| `test_live_horizons_sun_elevation_at_south_pole` | ✅ Sun, 89.68°S 166°W, 2026-12-01, 6 h step — 5 samples, \|el\| < 3° |
| `test_live_two_site_analysis_end_to_end` | ✅ 2 sites × 2 days (2027-03-01…03, 6 h step) → `EPHEMERIS_GEOMETRIC`, persisted, timeline present |

## Frontend

| Command | Result |
|---|---|
| `npx tsc -b` (strict) | ✅ 0 errors |
| `npx vitest run` | ✅ **27 passed** (4 files) |
| `npm run build` | ✅ built successfully |
| `npx oxlint src` | Not re-run in Phase 2 (Phase 1: 0 errors, 11 warnings) |

New Vitest coverage: stored `/comparison/:id` renders Science Transparency + real provenance without synthetic banner.

## Performance

### Synthetic (unchanged methodology from Phase 1)

| Endpoint | Notes |
|---|---|
| `POST /demo/synthetic-analysis` | Phase 1 local timings still apply; **not** mixed with Horizons latency |

### Real Horizons (Phase 2)

| Scenario | Result |
|---|---|
| Live 2-site × 2-day × 360 min analysis (unit test) | Completed in the live pytest session (~seconds wall time for this short window; **not** a load test) |
| Cached repeat `POST /analyses` (same inputs) | Returns prior analysis id with **zero** extra Horizons calls (unit-tested) |
| Lighthouse / concurrent users / p95 under load | **NOT MEASURED** |

Do not compare synthetic ~115 ms p50 figures with live Horizons runs.

## Not executed

- DeepSeek live call (no API key provided) — Phase 3.
- Full browser E2E walkthrough of planner → comparison → report on live API (API path covered by live pytest + UI unit test with mocks).
- Lighthouse / keyboard / screen-reader full audit.
