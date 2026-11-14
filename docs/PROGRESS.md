# Progress

_Last updated: 2026-11-14 — end of Phase 1._

## Phase 1 — Premium Foundation ✅ complete

### Frontend
- [x] Vite + React 19 + TypeScript (strict) + Tailwind v4 + shadcn-style components (Radix) + Motion + React Router + TanStack Query + Axios + Zustand + Recharts + OpenLayers + Lucide
- [x] Design system (tokens, typography, cards, buttons, badges, states) — `docs/DESIGN_SYSTEM.md`
- [x] Responsive shell: collapsible desktop sidebar, mobile drawer, top bar with live API status + EN/TR toggle
- [x] **Mission Control**: hero with original Moon illustration, CTA buttons (real routes), mission overview, planner access, live system health, NASA data sources, example sites, analysis status
- [x] **Lunar Explorer**: south-polar stereographic OpenLayers map, graticule, reference & custom sites, coordinate entry with validation, layer toggles, click-to-pick, site details, assign to Site A/B, explicit "no base raster" notice
- [x] **Mission Planner**: name, sites, dates, resolution, horizon model, weight sliders (sum = 100, normalise), client validation, real API submit (honest 501), synthetic preview
- [x] **Site Comparison**: empty state; with SYNTHETIC_DEMO data → score cards, metric tiles, Sun/Earth elevation line charts, explainable ranking, visibility timeline with failure highlights, bar & cumulative area charts, scenario re-weighting (server-side), assumptions & limitations
- [x] **AI Mission Analyst** workspace: provider status, language choice, guardrails, deterministic evidence package, report-card layout (awaiting Phase 3)
- [x] **Mission Reports**: stored-analysis list (API), session report view with metadata, sites, metrics table, provenance, limitations, print
- [x] i18n EN/TR (typed), reduced-motion support, error boundary, skeletons, error states with request IDs

### Backend
- [x] FastAPI modular monolith, settings, DI, structured logging, error model, request IDs, Server-Timing, CORS, rate limiting, gzip
- [x] SQLite + SQLAlchemy models for sites, analyses, site results, timelines, AI reports, provenance, cache
- [x] `GET /health`, `GET /api/v1/sites[/{id}]`, `GET /api/v1/data-sources`, `GET /api/v1/analyses`
- [x] Analysis contract (`POST /analyses`, `GET /analyses/{id}`, `/timeline`, `/explain`) — schemas final, returns 501/404
- [x] JPL Horizons client (query builder, retry/back-off, parser) — verified against live API
- [x] Visibility & scoring engine (NumPy), cache keys, AI number guard
- [x] DeepSeek client skeleton (secure config, JSON validation, failure normalisation)
- [x] SYNTHETIC_DEMO endpoint exercising the full deterministic pipeline
- [x] 41 unit/API tests + 1 live test

## Not done / known gaps (by design for Phase 1)

- [ ] Real ephemeris analyses (Phase 2) — `POST /analyses` returns 501
- [ ] Persistence of analyses, timelines, provenance (models exist, not written)
- [ ] DeepSeek briefings (Phase 3) — client exists, endpoint returns 404/501
- [ ] LOLA terrain horizon & base raster (Phase 4)
- [ ] PDF export (print only)
- [ ] Alembic migrations
- [ ] Lighthouse & load testing (NOT MEASURED)
- [ ] Official Artemis candidate-region coordinates (seed sites are approximate)
- [ ] The "SELENORA Project Master Brief" document was not in the workspace — reconcile when available

## Phase 2 — Scientific MVP ⏳ awaiting approval
See `docs/NEXT_STEPS.md`.
