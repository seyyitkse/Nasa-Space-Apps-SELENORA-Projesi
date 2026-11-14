# Next Steps — Cursor Handoff (prioritised)

Read first: `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, `docs/DATA_SOURCES.md`.
Ground rules: never return fabricated success; every result carries `data_quality`;
the AI never computes or changes numbers; keep `frontend/src/types/api.ts` in sync with `backend/app/schemas`.

---

## Task 1 — Real ephemeris analysis pipeline (Phase 2 core)

**Goal:** `POST /api/v1/analyses` runs a real JPL Horizons-based analysis and returns `EPHEMERIS_GEOMETRIC` results.

**Files:**
- `backend/app/services/analysis_service.py` (new) — orchestration
- `backend/app/api/v1/analyses.py` — replace 501s
- `backend/app/integrations/nasa/horizons.py` — reuse `HorizonsClient.observer_ephemeris`
- `backend/app/science/visibility.py`, `scoring.py` — reuse as-is
- `backend/app/services/demo_analysis_service.py` — extract shared result-building helpers (`_intervals`, timeline downsampling) into a common module
- `backend/app/models/analysis.py`, `backend/app/db/` — persistence (+ add Alembic)
- `backend/tests/test_analysis_service.py` (new)

**Steps:**
1. For each site × {SUN, EARTH}: fetch ephemeris with bounded concurrency (`asyncio.Semaphore(4)`), honouring `horizons_max_retries`.
2. Align Sun/Earth samples by timestamp; missing → NaN; compute `missing_fraction` → `PARTIAL` if > 5 %.
3. `visibility.summarize` → metrics/windows; `scoring.score_site` + `rank`; recommendation only if a unique rank 1.
4. Persist `MissionAnalysis`, `AnalysisSite`, `VisibilityTimeline`, `DataProvenance` (Horizons `signature.version`, DE441, retrieval time, query summary).
5. Use `analysis_cache_key(..., data_source_version="horizons-1.2-DE441")` + `CachedResult` to return repeated analyses instantly.
6. Implement `GET /analyses/{id}`, `/timeline` (downsample ≤ 720 pts/site).
7. Start with synchronous execution for ≤ 2 sites × ≤ 30 days; return `202` + status for larger jobs via a FastAPI `BackgroundTasks` job model (`PENDING → RUNNING → COMPLETED/FAILED`).

**Dependencies:** network access to `ssd.jpl.nasa.gov`; Alembic.

**Acceptance criteria:**
- Tests with mocked Horizons (use real fixtures in `tests/fixtures/`) cover: success, partial data, Horizons failure → `FAILED` with clear error, cache hit.
- A live test (`-m live`) runs a 2-site × 2-day analysis end to end.
- Results for 89.68° S 166.0° W on 2026-12-01 match the Horizons fixture values exactly at the sampled times.
- No endpoint returns success without computed data; `data_quality` is `EPHEMERIS_GEOMETRIC` or `PARTIAL`.

---

## Task 2 — Frontend on real analyses

**Goal:** Planner submits real analyses; Comparison/Reports/Analyst read real results by id.

**Files:**
- `frontend/src/services/selenoraApi.ts` — `getAnalysis(id)`, `getTimeline(id)`
- `frontend/src/hooks/useApi.ts` — `useAnalysis(id)` with polling while `PENDING/RUNNING`
- `frontend/src/pages/PlannerPage.tsx` — on 202/200 navigate to `/comparison/:id`
- `frontend/src/app/router.tsx` — add `comparison/:id`, `reports/:id`
- `frontend/src/pages/ComparisonPage.tsx`, `ReportsPage.tsx`, `AnalystPage.tsx` — source data from query instead of the demo store; keep demo as an explicit secondary mode
- Tests: extend `src/app/App.test.tsx`

**Steps:** progress UI (status + elapsed), error/partial states, keep `SyntheticBanner` only for `SYNTHETIC_DEMO`, show provenance (Horizons version, retrieval time) in the Science Transparency panel.

**Dependencies:** Task 1.

**Acceptance criteria:** typecheck/build/tests pass; a real 2-site analysis renders all charts; refresh on `/comparison/:id` reloads from the API; API failure shows `ErrorState` with request ID; no synthetic label on real data and vice versa.

---

## Task 3 — DeepSeek AI Mission Briefing (Phase 3 start)

**Goal:** `POST /api/v1/analyses/{id}/explain` returns a validated `ExplainResponse` in EN/TR.

**Files:**
- `backend/app/services/explain_service.py` (new)
- `backend/app/api/v1/analyses.py` — explain endpoint
- `backend/app/integrations/deepseek/client.py`, `prompts.py`
- `backend/app/services/ai_guard.py`
- `frontend/src/pages/AnalystPage.tsx` — enable "Generate AI briefing", render report cards, show `unsupported_numbers` warnings

**Steps:**
1. Build the AI input from the stored `AnalysisResult` only (strip free text supplied by users, e.g. mission name → pass as data, never as instructions).
2. Call `DeepSeekClient.generate_report`; on `ServiceNotConfiguredError`/`DeepSeekError` return 503/502 while results stay available.
3. Run `find_unsupported_numbers`; policy: store + display with a visible warning (or reject if > N flags).
4. Set `recommended_site_label` from the analysis, never from the AI.
5. Persist `AIReport` (language, model, report JSON); cache by (analysis id, language, model).
6. Verify the model id with DeepSeek `GET /models` and update `.env.example` defaults.

**Dependencies:** Task 1 (stored results), a `DEEPSEEK_API_KEY` from the user.

**Acceptance criteria:** unit tests with a fake completions backend (valid JSON, invalid JSON, timeout, invented numbers); UI shows loading, success, and failure states; scientific charts remain functional when the AI fails; no key appears in logs or responses.
