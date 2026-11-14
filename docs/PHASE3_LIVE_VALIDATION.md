# SELENORA Phase 3.1 — Live DeepSeek Validation

**Date:** 2026-11-14  
**Branch:** `feature/phase3-live-validation`  
**Scope:** Prove live DeepSeek + real Horizons explain path; stabilize guards/API semantics. **Phase 4 not started.**

Secrets (API keys, Authorization headers) are omitted from this report.

---

## 1. DeepSeek connection status

| Check | Result |
|---|---|
| `DEEPSEEK_API_KEY` present in backend `.env` | Yes (`configured=True`, key length 35) |
| `GET https://api.deepseek.com/models` | Success (~581 ms, 2 model ids) |
| Configured model reachable | `deepseek-flash` present |
| Non-thinking JSON completion | Success |
| Pydantic `AIMissionReport` validation | Passed |
| Smoke script | `backend/scripts/live_deepseek_smoke.py` → `RESULT=OK` |

## 2. Model identity

- Configured / used: **`deepseek-flash`**
- Base URL: `https://api.deepseek.com`
- Prompt version: `explain-v1`
- Algorithm version (analysis): `0.3.0-phase3`

## 3. JSON Output validation

- Live completion returned a single JSON object matching the required keys (`summary`, `key_findings`, `site_advantages`, `site_disadvantages`, `comparison_explanation`, `mission_tradeoffs`, `scientific_limitations`, `data_quality_notes`).
- Re-validated with `AIMissionReport.model_validate(...)`.
- Empty / invalid JSON paths remain covered by unit tests (mocked DeepSeek).

## 4. Real NASA analysis → AI report (e2e)

Script: `backend/scripts/live_explain_e2e.py`

| Step | Result |
|---|---|
| Real Horizons `POST /api/v1/analyses` | HTTP **200**, status `COMPLETED`, `EPHEMERIS_GEOMETRIC` |
| Analysis id (primary) | `e517183e-ae04-449a-8e19-7bddc8a0410b` |
| Sites | Shackleton A (−89.68°, −166°) vs **Equatorial Ref (0°, 0°)** — *test-only contrast site, not a south-pole landing candidate* |
| Deterministic recommendation | **Equatorial Ref** (score 66.667, rank 1) vs Shackleton A (40.0, rank 2) — expected: Earth visibility at equator dominates equal 40/40/20 weights |
| Scientific note | Equatorial Ref was introduced only to break polar score ties during live validation. **Do not present it as an Artemis / south-pole candidate.** Competition demos must use two south-polar sites (see `docs/COMPETITION_READINESS.md`). |
| `POST .../explain` (EN) | HTTP 200, model `deepseek-flash`, ~4.6 s |
| Ranking contradiction | None |
| Unsupported numbers (EN) | `[]` |
| Persist AI report | Stored in `ai_reports` |
| `GET .../explain` | HTTP 200 |
| TR explain | HTTP 200, unsupported `[]` |
| UI Analyst | Cached EN briefing rendered with evidence metrics + disclaimer |
| UI Mission Reports | Same analysis shows AI block (`deepseek-flash`, recommendation label) |

Earlier windows also exercised **tie** behaviour (identical south-polar scores → `recommended_site_label=None`); guards correctly treated ties as non-contradicting.

## 5. Numeric accuracy & ranking

- Evidence package now includes **`window_hours`** so “48-hour window” claims are grounded.
- `find_unsupported_numbers` ignores ISO-8601 timestamps in prose (false positive on fractional seconds fixed).
- Allowed numeric forms expanded to 0–6 decimal places.
- `ranking_contradicts` covers EN + TR recommend phrases; false positives for mere mention of other sites covered by unit tests.
- Soft policy: up to 8 unsupported numbers → warn; ranking contradiction → hard reject (502), scientific row untouched.

## 6. Cache test

| Call | `cached` | Latency |
|---|---|---|
| First EN explain | `false` | ~4591 ms |
| Second EN explain (same evidence) | **`true`** | **~6 ms** |
| DeepSeek calls on cache hit | None | — |

## 7. Latency & token usage

| Operation | Latency | Tokens (when returned) |
|---|---|---|
| `/models` list | ~581 ms | — |
| Smoke `generate_report` (synthetic evidence) | ~3217 ms | prompt 821 / completion 684 / **total 1505** |
| Live EN explain (real analysis) | ~4591 ms | stored on `ai_reports.token_usage` |
| Live TR explain | ~7159 ms | stored |
| Horizons analysis create | ~2000–2400 ms | N/A |

## 8. Backend / frontend test results

| Suite | Result |
|---|---|
| Backend pytest (`-m "not live"`) | **58 passed**, 2 live deselected |
| Frontend vitest | **28 passed** |
| `tsc -b` | 0 errors |
| `npm run build` | success |
| Live smoke (DeepSeek) | `RESULT=OK` (separate script, not in unit suite) |
| Live e2e (Horizons + explain) | `RESULT=OK` (separate script) |

## 9. Issues found & fixes

| Issue | Fix |
|---|---|
| Sync completed analyses returned HTTP **202** | `POST /analyses` now returns **200** when status is not `PENDING`/`RUNNING`; 202 reserved for in-flight work |
| “48” flagged as unsupported | Evidence package adds `window_hours` |
| Provenance ISO timestamp fractional seconds flagged | Strip ISO datetimes before number scan; broaden allowed decimal forms |
| Weak TR ranking phrases | Hardened `_RECOMMEND_PREFIX` (EN+TR) + unit coverage |
| Reports page ignored UI language (showed latest TR while EN selected) | `AiReportBlock` passes i18n language into `useExplanation` |
| Polar-only Dec pair produced a score tie | E2e uses polar vs equatorial sites for a clear recommendation (ties still validated separately) |

## 10. Remaining risks before Phase 4

1. **Geometric horizon only** — LOLA / `EPHEMERIS_TERRAIN` still Phase 4; AI must keep stating that limitation.
2. **Heuristic ranking guard** — phrase variants outside EN/TR patterns could slip; keep soft numeric warnings visible in UI.
3. **Sync Horizons POST** — large windows can still block the request thread; background 202 path not implemented.
4. **Cost** — each language/regenerate burns tokens; cache mitigates repeats.
5. **Near-identical polar sites** often tie under short windows — expected scientifically; demos should prefer differentiated sites or longer windows.

**Phase 4 was not started.** Live DeepSeek integration is proven on this branch.
