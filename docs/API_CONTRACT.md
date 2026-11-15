# API Contract (v1)

Base URL (dev): `http://127.0.0.1:8000` — the frontend calls it through the Vite proxy.
Interactive docs: `/docs` (Swagger) and `/openapi.json`.
Source of truth: `backend/app/schemas/*.py`; TS mirror: `frontend/src/types/api.ts`.

## Conventions

- JSON only. Timestamps ISO-8601 **with timezone** (UTC, `Z`). Naive timestamps are rejected.
- Coordinates: planetocentric latitude −90..90°, **east-positive** longitude −180..180°.
- Every response carries `X-Request-ID` and `Server-Timing: app;dur=<ms>`.
- Rate limit: 120 requests/min/IP (configurable). `/health` and docs are exempt. 429 includes `Retry-After`.
- Error shape (all 4xx/5xx):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [...], "request_id": "a1b2…" } }
```

Codes: `VALIDATION_ERROR` (422), `NOT_FOUND` (404), `NOT_IMPLEMENTED` (501), `RATE_LIMITED` (429),
`SERVICE_NOT_CONFIGURED` (503), `EXTERNAL_SERVICE_ERROR` / `HORIZONS_ERROR` / `AI_PROVIDER_ERROR` (502), `INTERNAL_ERROR` (500).

## Live endpoints (Phase 2)

### `GET /health` → `HealthResponse`
```json
{ "status": "ok", "service": "SELENORA API", "version": "0.1.0", "api_version": "v1",
  "algorithm_version": "0.2.0-phase2", "environment": "development",
  "server_time_utc": "2026-11-14T06:40:00Z", "uptime_seconds": 42.1,
  "components": [ { "name": "database", "status": "OK", "detail": "SQLite reachable" },
                  { "name": "horizons_client", "status": "READY", "detail": "…not probed…" },
                  { "name": "scientific_engine", "status": "READY", "detail": "Horizons → visibility → scoring" },
                  { "name": "terrain_model", "status": "NOT_IMPLEMENTED", "detail": "…" },
                  { "name": "ai_analyst", "status": "NOT_CONFIGURED", "detail": "DEEPSEEK_API_KEY not set." } ] }
```
`status` is `degraded` if any component is `DOWN`. Component states: `OK | READY | DEGRADED | DOWN | NOT_CONFIGURED | NOT_IMPLEMENTED`.

### `GET /api/v1/sites` → `LandingSiteList`
`{ items: LandingSite[], total, coordinate_frame, longitude_convention, disclaimer }`
`LandingSite = { id, name, latitude_deg, longitude_deg, region, description, coordinate_source, coordinate_status }`.
All seeded sites have `coordinate_status = "APPROXIMATE_REFERENCE"`.

### `GET /api/v1/sites/{site_id}` → `LandingSite` | 404

### `GET /api/v1/data-sources` → `{ items: DataSource[] }`
`DataSource = { id, name, provider, category: EPHEMERIS|TOPOGRAPHY|AI_EXPLANATION, description, url, documentation_url, integration_status: CLIENT_READY|INTEGRATED|PLANNED|NOT_CONFIGURED, used_for[], phase, notes }`.

### `POST /api/v1/demo/synthetic-analysis` → `DemoAnalysisResponse`
Body: `AnalysisCreate` (below). Runs the real visibility + scoring code on the
**SYNTHETIC_DEMO** elevation model. Returns `{ result: AnalysisResult, timeline: TimelineResponse }`
with `data_quality = "SYNTHETIC_DEMO"`. Nothing is persisted. Timeline is downsampled to ≤ 720 points/site.

### `GET /api/v1/analyses` → `AnalysisStatus[]`
Lists persisted analyses (newest first).

### `POST /api/v1/analyses` → `AnalysisStatus` (**202**)
Runs the real Horizons → visibility → scoring pipeline (or returns a cache hit).
- Success: `{ id, status: "COMPLETED", data_quality: "EPHEMERIS_GEOMETRIC"|"PARTIAL" }`
- Horizons failure: **502** `HORIZONS_ERROR` (row stored as `FAILED`)
- `horizon_model=TERRAIN`: **501** (Phase 4)
- Identical inputs: cache hit returns the previous analysis id (no new Horizons calls)

### `GET /api/v1/analyses/{id}` → `AnalysisResult`
Full stored result. `PENDING`/`RUNNING` return a minimal payload; clients may poll.

### `GET /api/v1/analyses/{id}/timeline` → `TimelineResponse`
Downsampled elevation series (≤ 720 points/site). **404** until `COMPLETED`.

### `POST /api/v1/analyses/{id}/explain` → `ExplainResponse`
Body: `{ language: "en"|"tr", regenerate?: boolean }`.
- Builds server-side evidence package from stored analysis; calls DeepSeek; validates JSON; persists `AIReport`.
- Cache hit when same analysis + language + model + prompt version + evidence hash (unless `regenerate`).
- **503** if `DEEPSEEK_API_KEY` missing; **502** `AI_PROVIDER_ERROR` on provider/validation failure.
- Scientific analysis rows are never deleted on AI failure.
- `recommended_site_label` always from the deterministic engine.

### `GET /api/v1/analyses/{id}/explain` → `ExplainResponse`
Latest stored briefing (optional `?language=en|tr`). **404** if none.

## Models

```text
AnalysisCreate {
  mission_name: str (2..160)
  sites: SiteInput[2..10]           # distinct coordinates
  start_utc, end_utc: datetime(tz)  # end > start, span ≤ 30 days
  time_step_minutes: int 10..1440 = 60
  horizon_model: "GEOMETRIC" | "TERRAIN" = "GEOMETRIC"
  weights: { sun_visibility, earth_visibility, joint_visibility }  # percent, each 0..100, sum = 100 (±0.01)
}
SiteInput { label: str(1..160), latitude_deg, longitude_deg, landing_site_id?: str }

AnalysisResult {
  id, mission_name, status, data_quality, algorithm_version,
  start_utc, end_utc, time_step_minutes, horizon_model, weights,
  sites: SiteResult[], recommended_site_label: str|null,   # decided by the deterministic engine only
  assumptions: str[], limitations: str[], provenance: Provenance[], created_at
}
SiteResult {
  label, latitude_deg, longitude_deg, landing_site_id,
  metrics: VisibilityMetrics, score: float|null, rank: int|null,
  contributions: ScoreContribution[],                        # explainable ranking
  darkness_windows, communication_gaps, joint_windows: Interval[]   # ≤ 50 longest each, sorted by start
}
VisibilityMetrics { sun_visibility_pct, earth_visibility_pct, joint_visibility_pct,
  longest_sunlight_hours, longest_darkness_hours, longest_earth_visibility_hours,
  longest_communication_gap_hours, longest_joint_visibility_hours }
ScoreContribution { metric, weight_pct, value_pct, contribution }   # contribution = weight_pct/100 × value_pct
Interval { start_utc, end_utc, duration_hours }
Provenance { source_id, description, retrieved_at, version }
TimelineResponse { analysis_id, data_quality, downsampled, step_minutes, sites: [{ label, points: [{ t, sun_elevation_deg, earth_elevation_deg }] }] }

AIMissionReport { summary, key_findings[], site_advantages{label: str[]}, site_disadvantages{label: str[]},
  comparison_explanation, scientific_limitations[], data_quality_notes[] }
ExplainResponse { analysis_id, language, model, recommended_site_label, report: AIMissionReport,
  unsupported_numbers: str[], generated_at }
```

`data_quality ∈ EPHEMERIS_GEOMETRIC | EPHEMERIS_TERRAIN | SYNTHETIC_DEMO | PARTIAL | UNAVAILABLE`.
Scores are only produced for `EPHEMERIS_*` / `SYNTHETIC_DEMO` with ≤ 5 % missing samples; otherwise `score = rank = null`.

## Phase 7A — operational events

`GET /api/v1/analyses/{analysis_id}/events?reference_utc=<ISO-8601 with timezone>` returns, per site
and per body (Sun, Earth), the current visibility state and the next state changes as **brackets
between stored samples** — never as exact timestamps. GEOMETRIC analyses expose a geometric track;
TERRAIN analyses expose geometric and terrain tracks side by side. `UNKNOWN` is preserved and no
rise/set is confirmed across UNKNOWN samples. Full contract and semantics:
`docs/PHASE7A_IMPLEMENTATION_REPORT.md` §3–§4.

## Phase 7C — same site, alternative mission dates

### `POST /api/v1/scenarios` → `ScenarioComparisonResult`

Runs 2–10 independent JPL Horizons windows for one stable site identity. This
endpoint is additive: `POST /api/v1/analyses` still requires 2–10 geographically
distinct sites.

```text
ScenarioComparisonCreate {
  name: str (2..160)
  site: {
    site_id: str,                  # stable reference/custom identity
    label: str,
    latitude_deg, longitude_deg,
    landing_site_id?: str|null
  }
  scenarios: ScenarioWindow[2..10]
  time_step_minutes: int 10..1440
  horizon_model: "GEOMETRIC" | "TERRAIN"
  weights: DecisionWeights
}
ScenarioWindow {
  scenario_id: str,
  label: str,
  start_utc, end_utc: datetime(tz)
}
```

Rules:

- All timestamps are normalised to UTC and every window must have equal duration.
- Duplicate IDs, labels and date ranges are rejected.
- Each window is at most 30 days; the whole request is capped at 30,000 sampled epochs.
- The site coordinates and identity are shared by construction; each date receives
  an independent Sun and Earth Horizons request and independent provenance.
- Cache identity includes site identity/coordinates, every UTC range, resolution,
  horizon model, current algorithm/data-source versions and H2 decision weights.
- A date change can never hit ephemeris cached for another date.
- `UNKNOWN` remains unavailable evidence; it is not counted as darkness or visibility.
- If any scenario is `PARTIAL` or `LOCAL_TERRAIN_PARTIAL`, cross-scenario ranks and
  recommendation are suppressed. Existing H1 null metrics remain null.
- No synthetic fallback is used. Horizons failures remain 502 errors and the failed
  comparison is retained for audit.

The response contains the stable site, shared settings and `scenarios[]`. Every
scenario contains its exact UTC range, sample count, `data_quality`, algorithm
version, `SiteResult`, assumptions, limitations and provenance. The optional
`recommended_scenario_id` is produced only by the existing deterministic weighted
visibility score over comparable evidence; it is not a NASA safety recommendation.

### `GET /api/v1/scenarios` → `ScenarioComparisonStatus[]`

Lists persisted comparison runs, including failed runs and their error messages.

### `GET /api/v1/scenarios/{comparison_id}` → `ScenarioComparisonResult`

Restores a completed comparison. `cache_status=STORED` distinguishes restoration
from a `MISS` calculation or an identical-request `HIT`.
