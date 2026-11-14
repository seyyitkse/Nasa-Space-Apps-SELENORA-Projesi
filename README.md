# SELENORA

**AI-Assisted Lunar Landing Site Decision Support Platform**
NASA Space Apps Challenge 2026 · *Lunar Landing Site Navigator*

> Explore the Moon. Understand the Evidence. Plan with Confidence.
> **Scientific computation drives the results. AI explains the evidence.**

SELENORA helps compare candidate landing sites near the lunar south pole by
Sun visibility, Earth visibility (direct-to-Earth geometry) and joint
visibility, with an explainable, user-weighted ranking. It is a research and
education tool — **not** a certified landing-safety or flight-operations system.

## Status — Phase 3 (AI Mission Analyst) ✅

| Area | State |
|---|---|
| React + TS + Vite frontend, 6 pages, EN/TR, responsive | Done |
| FastAPI: health, sites, data-sources, analyses, demo, explain | Live |
| **Real JPL Horizons analysis** (`POST /api/v1/analyses`) | Live — geometric horizon |
| Visibility + deterministic scoring | Live on ephemeris + synthetic demo |
| Persistence + Alembic migrations + analysis cache | Live (SQLite) |
| Science Transparency panel | Live |
| **DeepSeek AI briefings** (`POST …/explain`) | Live when `DEEPSEEK_API_KEY` set (mock-tested; live call not run in CI) |
| SYNTHETIC_DEMO pipeline | Live, always labelled separately |
| LOLA terrain | Planned (Phase 4) |

See [docs/PROGRESS.md](docs/PROGRESS.md) and [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md).

## Quick start — Windows PowerShell

Requirements: **Python 3.12+**, **Node.js 20+** (tested with Node 24.15, npm 11.12, Python 3.12.10).

### 1. Backend (FastAPI, port 8000)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
Copy-Item .env.example .env        # then edit .env (DEEPSEEK_API_KEY is optional)
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs · Health: http://127.0.0.1:8000/health

One-click (Windows): double-click `start-selenora.bat` at the repo root.

> If script execution is blocked: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`,
> or skip activation and call `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`.

### DeepSeek API key (optional, PowerShell)

Never put the key in the frontend or commit it.

```powershell
# Option A — persist in backend\.env (recommended for local demos)
cd backend
Copy-Item .env.example .env -ErrorAction SilentlyContinue
# Edit backend\.env and set:  DEEPSEEK_API_KEY=sk-...
# Optional: DEEPSEEK_MODEL=deepseek-flash   DEEPSEEK_BASE_URL=https://api.deepseek.com

# Option B — current PowerShell session only
$env:DEEPSEEK_API_KEY = "sk-..."   # do not share / screenshot this
$env:DEEPSEEK_MODEL = "deepseek-flash"
```

Without a key the API stays up; `POST /analyses/{id}/explain` returns **503** and all scientific results remain available.

### 2. Frontend (Vite, port 5173)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/health` to
`http://127.0.0.1:8000` (override with `$env:SELENORA_BACKEND_URL`).

### 3. Tests

```powershell
# backend
cd backend; .\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m pytest -m live -o addopts=""   # calls the real JPL Horizons API

# frontend
cd frontend
npx tsc -b          # typecheck (strict)
npx vitest run      # unit + component tests
npm run build       # production build
```

## Repository layout

```
backend/   FastAPI modular monolith (api · core · schemas · models · integrations · science · services · db)
frontend/  React 19 + TypeScript (strict) + Vite + Tailwind v4 + shadcn-style UI
docs/      Architecture, design system, API contract, data sources, decisions, progress, tests, next steps
data/      Reserved for downloaded datasets / caches (git-ignored subfolders)
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Design system](docs/DESIGN_SYSTEM.md) · [API contract](docs/API_CONTRACT.md)
- [Data sources & scientific assumptions](docs/DATA_SOURCES.md) · [Decisions](docs/DECISIONS.md)
- [Progress](docs/PROGRESS.md) · [Test results](docs/TEST_RESULTS.md) · [Next steps](docs/NEXT_STEPS.md)
- [Project brief](docs/PROJECT_BRIEF.md)

## Security

- API keys live only in `backend/.env` (git-ignored). The frontend never receives them.
- CORS is restricted to configured origins; wildcard origins are rejected at startup.
- In-memory rate limiting (default 120 req/min/IP), request IDs, structured JSON logs with secret redaction.

SELENORA is an independent student/competition project. It is not endorsed by NASA, JPL or DeepSeek.
