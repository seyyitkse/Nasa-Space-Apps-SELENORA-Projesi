# Test Results

Environment: Windows 11 Pro, Python 3.12.10, Node 24.15.0, npm 11.12.1.
Run date: **2026-11-14**. Only tests listed here were actually executed.

## Backend — `cd backend; .\.venv\Scripts\python.exe -m pytest -v`

**41 passed, 1 deselected (live)** in ~3 s.

| File | Tests | Covers |
|---|---|---|
| `tests/test_api.py` | 10 | `/health` components + headers; seeded sites flagged approximate; 404 error shape; data-source honesty + no secret leakage; `POST /analyses` validates then 501; rejects bad weights / latitude / reversed dates / > 30 days / single site / naive timestamps; unknown analysis 404; synthetic demo labelled + deterministic + contributions sum to score; CORS allow/deny; rate limiting (429, `/health` exempt) |
| `tests/test_integrations.py` | 15 | Horizons query builder (Moon topocentric observer); table parser incl. flag columns; explicit parse errors; retry-then-succeed on 503; give-up after timeouts; no retry on 4xx; **parsing of two real Horizons responses** (Sun & Earth, frame `MEAN_ME`); DeepSeek not-configured error, JSON validation, failure normalisation ×3; AI number guard; secret redaction |
| `tests/test_science.py` | 16 | Visibility mask (strict >, NaN, terrain horizon); runs/transitions; longest darkness & comm gap; joint = intersection; mismatched series; missing-data fraction & scorability; score formula; invalid weights ×3; dense ranking with ties/None; synthetic model ranges & determinism; elevation geometry sanity; cache key stability/sensitivity; synthetic anchor vs real Horizons fixture (±0.3°) |

### Live integration — `pytest -m live -o addopts=""`

**1 passed.** Calls the real JPL Horizons API (Sun, 89.68° S 166.0° W, 2026-12-01, 6 h step) and checks
5 samples with |elevation| < 3°. This test initially **failed** (HTTP 400: `ANGLE_FORMAT` not recognised);
fixed to `ANG_FORMAT`.

## Frontend

| Command | Result |
|---|---|
| `npx tsc -b` (strict, `noUncheckedIndexedAccess`) | ✅ 0 errors |
| `npx vitest run` | ✅ **26 passed** (4 files) |
| `npm run build` | ✅ built in < 1 s (Vite 8 / Rolldown) |
| `npx oxlint src` | ✅ 0 errors, 11 warnings (React fast-refresh "only-export-components" in router/providers; `setState` in `componentDidUpdate` of the error boundary — intentional reset) |

Vitest files:
- `features/lunar-explorer/projection.test.ts` — pole at origin, orientation, true scale at pole, round-trip ×5, range errors.
- `features/mission-planner/validation.test.ts` — valid input, sites, date range rules, weight sum/range, normalisation, sample count, request building.
- `features/site-comparison/derive.test.ts` — visibility segments, cumulative joint hours, longest interval, ranking explanation incl. tie.
- `app/App.test.tsx` — Mission Control renders with live health; offline state; sidebar navigation; planner validation blocks submit; comparison empty state; EN→TR switch; 404 page.

Production bundle (gzip): main 104 kB · shared vendor (axios/query) 82 kB · Explorer route (OpenLayers) 86 kB · Comparison route (Recharts) 123 kB · CSS 13 kB.

## Manual / browser checks (Claude browser pane, dev servers on :8000 and :5173)

| Check | Result |
|---|---|
| Mission Control shows real `/health` data (API online, component states, version, uptime) | ✅ |
| Data sources & example sites loaded from API | ✅ |
| Lunar Explorer: polar map, graticule, markers, select via list/URL, click-to-pick, assign Site A/B | ✅ |
| Planner → "Run ephemeris analysis" shows the honest 501 panel (673 samples/site) | ✅ |
| Planner → synthetic preview → comparison dashboard (tiles, elevation chart, ranking explanation, timeline with outage highlights, bar & cumulative area charts) | ✅ |
| Horizontal overflow at 375 px on all 6 routes | ✅ none (after fixes: timeline SVG flex sizing, grid `minmax(0,1fr)` tracks, card `min-width:0`) |
| Mobile drawer opens/closes (Escape) | ✅ |
| Turkish UI | ✅ (also covered by a test) |

## Performance

Local API latency, measured with `httpx` against a dedicated uvicorn instance (rate limit raised, only HTTP 200 counted), same machine:

| Endpoint | n | p50 | p95 |
|---|---|---|---|
| `GET /health` | 100 | 1.7 ms | 2.5 ms |
| `GET /api/v1/sites` | 100 | 2.6 ms | 3.4 ms |
| `GET /api/v1/data-sources` | 100 | 1.7 ms | 2.3 ms |
| `POST /demo/synthetic-analysis` 2 sites × 30 d × 60 min | 20 | 10.4 ms | 16.7 ms |
| `POST /demo/synthetic-analysis` 10 sites × 30 d × 60 min (7 210 samples/body) | 10 | 115 ms | 177 ms |

(A first run accidentally hit the 120 req/min limiter and recorded 429 timings; it was discarded.)

| Target | Status |
|---|---|
| Cached API p95 < 800 ms (server side) | Local, single client: met for current endpoints. **Under load: NOT MEASURED.** |
| Lighthouse Performance ≥ 90 | **NOT MEASURED** — `lighthouse` could not find a local Chrome installation. |
| External latency (JPL Horizons, DeepSeek) | **NOT MEASURED** systematically (single live Horizons call completed in ~1 s). |
| Load test (concurrent users) | **NOT MEASURED** |

## Not executed

- DeepSeek live call (no API key provided).
- Keyboard-only full walkthrough and screen-reader audit (partial: focus rings, skip link, aria labels implemented).
- Cross-browser testing (only the Chromium-based pane).
