# Next Steps — Phase 3 Handoff (prioritised)

Read first: `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, `docs/DATA_SOURCES.md`.
Ground rules: never return fabricated success; every result carries `data_quality`;
the AI never computes or changes numbers; keep `frontend/src/types/api.ts` in sync with `backend/app/schemas`.

Phase 2 Scientific MVP is **complete**. Do not start Phase 3 without user approval.

---

## Task 1 — DeepSeek AI Mission Briefing (Phase 3 core)

**Goal:** `POST /api/v1/analyses/{id}/explain` returns a validated `ExplainResponse` in EN/TR grounded only in stored analysis numbers.

**Files:**
- `backend/app/services/explain_service.py` (new)
- `backend/app/api/v1/analyses.py` — implement explain endpoint (currently 501)
- `backend/app/integrations/deepseek/client.py`, `prompts.py`
- `backend/app/services/ai_guard.py`
- `frontend/src/pages/AnalystPage.tsx` — enable generate + render report cards

**Steps:**
1. Build AI input from stored `AnalysisResult` only.
2. Call `DeepSeekClient.generate_report`; map not-configured → 503, provider errors → 502.
3. Run `find_unsupported_numbers`; surface warnings.
4. `recommended_site_label` always from deterministic engine.
5. Persist `AIReport`; cache by (analysis id, language, model).
6. Verify model id via DeepSeek `GET /models` once a key is available.

**Dependencies:** valid `DEEPSEEK_API_KEY` from the user.

**Acceptance:** fake-backend unit tests; UI loading/success/failure; charts work when AI fails; no secrets in logs.

---

## Task 2 — Alembic + schema hardening

**Goal:** versioned migrations for `result_json`, `timeline_json`, `details`, and future AI tables.

**Why:** Phase 2 used SQLAlchemy `create_all` (fine for fresh SQLite / tests). Existing local DB files may miss new columns until recreated.

---

## Task 3 — Optional async job model for large windows

**Goal:** for >2 sites × long windows, return `202` with `PENDING/RUNNING` and finish via `BackgroundTasks` (or a worker), with frontend polling already wired.

Current Phase 2 path runs Horizons fetches synchronously inside the request (acceptable for demo-scale 2-site windows).

---

## Later (Phase 4+)

- LOLA terrain horizon → `EPHEMERIS_TERRAIN`
- Polar base raster on Lunar Explorer
- PDF export
- Load / Lighthouse measurement
