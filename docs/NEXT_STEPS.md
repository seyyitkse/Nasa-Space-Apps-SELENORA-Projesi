# Next Steps — Phase 4 Handoff

Phase 3 AI Analyst is complete under mock tests. **Live DeepSeek was not tested** (no API key).

Do not start Phase 4 without user approval.

---

## Task 1 — Live DeepSeek smoke (when key available)

1. Set `DEEPSEEK_API_KEY` in `backend/.env` (never commit).
2. Confirm model via `GET https://api.deepseek.com/models`.
3. Run a short explain against a stored Horizons analysis.
4. Record token usage; adjust `DEEPSEEK_MODEL` if needed.

## Task 2 — LOLA terrain horizon (Phase 4 core)

Integrate LOLA DEM → local horizon → `EPHEMERIS_TERRAIN`. Keep geometric path as fallback.

## Task 3 — Optional async Horizons jobs

For large site×day windows, finish analysis in background while returning honest `PENDING/RUNNING` status (frontend polling already exists).

---

Ground rules unchanged: AI never computes numbers; every result carries `data_quality`; secrets stay server-side.
