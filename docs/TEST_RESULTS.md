# Test Results

Environment: Windows 11 Pro, Python 3.12.10, Node 24.x.
Run date: **2026-11-14** (Phase 3). Only listed tests were executed.

## Backend — `cd backend; .\.venv\Scripts\python.exe -m pytest`

**56 passed**, live deselected by default.

New / updated coverage:
- `tests/test_explain_service.py` — evidence package, ranking contradiction, 503 without key, mock success + cache, migration preserves rows
- `tests/test_integrations.py` — DeepSeek empty content rejection; `GeneratedReport` unwrap

### Live

| Test | Result |
|---|---|
| JPL Horizons live | Not re-run this phase (Phase 2: 2 passed) |
| DeepSeek live | **not tested** — no API key |

## Frontend

| Command | Result |
|---|---|
| `npx tsc -b` | ✅ 0 errors |
| `npx vitest run` | ✅ **28 passed** |
| `npm run build` | ✅ success |

## Migration

- Backup created under `backend/data/*.db.backup*` (gitignored)
- `run_migrations` on existing DB added `result_json`, `timeline_json`, AI metadata columns
- Unit test proves legacy SQLite keeps `keep-me` row

## Not executed

- Live DeepSeek completions / `/models`
- Lighthouse / load tests
