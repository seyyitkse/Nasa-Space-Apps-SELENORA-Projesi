# Architecture

SELENORA is a **modular monolith**: one FastAPI process and one React SPA. No
microservices, queues or Kubernetes in this phase — boundaries are module
boundaries, so pieces can be split out later if load requires it.

```
Browser (React SPA) ──HTTP/JSON──▶ FastAPI ──▶ services ──▶ science (NumPy, deterministic)
        │                              │            │
        │ (no secrets)                 │            ├──▶ integrations/nasa/horizons (httpx, async)
        │                              │            ├──▶ integrations/nasa/lola (Phase 4)
        ▼                              ▼            └──▶ integrations/deepseek (explain only)
  Vite dev proxy /api, /health     SQLite (SQLAlchemy) — PostgreSQL-ready
```

## Backend (`backend/app`)

| Module | Responsibility |
|---|---|
| `main.py` | App factory, lifespan (DB init + seed, shared `httpx.AsyncClient`, client construction), middleware order, routers |
| `core/config.py` | `pydantic-settings` configuration; secrets as `SecretStr`; `ALGORITHM_VERSION` |
| `core/errors.py` | Error hierarchy (`NotFoundError`, `NotImplementedYetError`, `ExternalServiceError`, …) and one JSON error shape |
| `core/middleware.py` | Request-ID + `Server-Timing` + structured access log; per-IP sliding-window rate limit |
| `core/logging.py` | JSON-lines logging with API-key/bearer redaction |
| `api/deps.py` | Dependency injection: settings, DB session, Horizons/DeepSeek clients from `app.state` |
| `api/health.py`, `api/v1/*` | Thin HTTP layer; validation via Pydantic; no business logic |
| `schemas/` | Typed API contracts (request/response). Mirrored in `frontend/src/types/api.ts` |
| `models/` | SQLAlchemy 2.0 ORM: `LandingSite`, `MissionAnalysis`, `AnalysisSite`, `VisibilityTimeline`, `AIReport`, `DataProvenance`, `CachedResult` |
| `db/` | Engine/session management, idempotent seed data |
| `science/visibility.py` | Masks, runs, durations, joint visibility — pure NumPy, unit-tested |
| `science/scoring.py` | Weighted score with per-metric contributions; dense ranking; "refuse to rank" rules |
| `science/synthetic.py` | `SYNTHETIC_DEMO` analytic elevation model (always labelled) |
| `integrations/nasa/horizons.py` | Query builder, retry/back-off client, CSV table parser (verified against live API) |
| `integrations/nasa/lola.py` | `HorizonProfileProvider` protocol + `GeometricHorizon` placeholder |
| `integrations/deepseek/` | OpenAI-compatible client, system prompt, JSON-schema-validated output |
| `services/` | Use-cases: sites, data sources, health, demo analysis, cache keys, AI number guard |

### Data flow (Phase 2 target)

1. `POST /api/v1/analyses` validates `AnalysisCreate` (2–10 sites, ≤30 days, step 10–1440 min, weights = 100).
2. Service computes `analysis_cache_key` (coords, range, step, horizon, algorithm + data-source version) → returns cached result if present.
3. For each site × {Sun, Earth}: `HorizonsClient.observer_ephemeris` (bounded concurrency, retries) → elevation arrays.
4. `visibility.summarize` → metrics + windows; `scoring.score_site` + `scoring.rank` → deterministic recommendation.
5. Persist `MissionAnalysis`, `AnalysisSite`, `VisibilityTimeline`, `DataProvenance` (Horizons version, retrieval time).
6. `POST …/explain` sends **only the computed result** to DeepSeek → `AIMissionReport` validated by Pydantic → `find_unsupported_numbers` flags invented numbers → stored as `AIReport`. Failure never affects step 4/5 results.

The `SYNTHETIC_DEMO` endpoint already runs steps 4 (and the response shape of 5) on synthetic elevations, so the frontend is built against the final contract.

## Frontend (`frontend/src`)

| Folder | Responsibility |
|---|---|
| `app/` | Providers (TanStack Query, Motion `reducedMotion="user"`, tooltips), router with lazy routes |
| `pages/` | One file per route; composes feature components |
| `features/<name>/` | Feature logic + components: `dashboard`, `lunar-explorer`, `mission-planner`, `site-comparison` (AI analyst & reports live in their pages for now) |
| `components/ui/` | shadcn-style primitives on Radix (`radix-ui`), CVA variants |
| `components/layout/` | App shell, sidebar (desktop collapsible / mobile drawer), top bar |
| `components/shared/` | Page header, empty/error states, badges, error boundary, colours |
| `services/` | Axios client with normalised `ApiError`; typed endpoint functions |
| `stores/` | Zustand: persisted mission draft + custom sites; in-memory demo result; UI state |
| `hooks/` | TanStack Query hooks (`useHealth` polls every 30 s) |
| `i18n/` | i18next with typed EN/TR dictionaries |
| `types/api.ts` | Mirror of backend Pydantic schemas |

State rules: server state → TanStack Query; client/draft state → Zustand; URL state (selected site) → search params.

## Map projection

`features/lunar-explorer/projection.ts` implements a **spherical south-polar
stereographic** projection (R = 1 737.4 km, true scale at the pole, 0° E up).
EPSG:3857 is deliberately not used. OpenLayers gets a custom `Projection`
(`SELENORA:MOON_SPS`, metres). When the LOLA polar mosaic is added, its native
polar-stereographic CRS should be matched (likely needs `proj4` registration).

## Scaling notes

- Single process; rate limiter and caches are in-process. Before running more than one worker, move rate limiting and cache to Redis/PostgreSQL.
- `CachedResult` table + deterministic cache keys are in place for Phase 2.
- 10 sites × 30 days × hourly (7 210 samples/body) runs the synthetic pipeline in ~115 ms p50 locally (see TEST_RESULTS).
- Horizons fetches (2 bodies × N sites) dominate latency; Phase 2 must add bounded concurrency + caching.
