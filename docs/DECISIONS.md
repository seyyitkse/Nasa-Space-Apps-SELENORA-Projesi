# Technical Decisions (ADR log)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Modular monolith** (one FastAPI app, one SPA) | Competition timeline; boundaries via modules (`api → services → science/integrations`); splittable later. |
| D2 | Project root = repository root (`backend/`, `frontend/`, `docs/`, `data/`) instead of an extra `selenora/` folder | The workspace folder already is the project; avoids a redundant nesting level. |
| D3 | **Analysis endpoints return 501** until Phase 2, but validate input fully | Never fabricate success (prompt §5.2); lets the UI exercise real validation now. |
| D4 | Added `POST /api/v1/demo/synthetic-analysis` | Lets the comparison dashboard be built and demoed against the *final* response contract with the *real* visibility/scoring code, while the data is unmistakably labelled `SYNTHETIC_DEMO`. Separate path so it can never be confused with `/analyses`. |
| D5 | Synthetic latitude phases anchored to two real Horizons samples (2026-12-01) | An arbitrary phase put the Sun below the horizon for the whole demo window (degenerate, misleading demo). Anchoring keeps it plausible; documented + unit-tested. |
| D6 | Seed sites flagged `APPROXIMATE_REFERENCE` | Exact official Artemis region polygons were not available offline; honest labelling over false precision. |
| D7 | Spherical **south-polar stereographic** map projection implemented in TS (no proj4) | EPSG:3857 is undefined at the poles; a 30-line, unit-tested projection avoids a dependency. Add proj4 when the LOLA raster CRS must match exactly. |
| D8 | No base raster on the map yet | Showing a decorative "Moon texture" would imply data; an explicit "not connected" notice is used instead. |
| D9 | Horizons longitude passed east-positive −180..180 | Verified: Horizons echoes −166.0 as 194.0 E for `coord@301`. |
| D10 | `ANG_FORMAT` (not `ANGLE_FORMAT`) | Live API returned HTTP 400 for `ANGLE_FORMAT`; found via the live test, fixed, documented. |
| D11 | DeepSeek via the **OpenAI Python SDK** behind a small protocol | Matches DeepSeek's OpenAI-compatible API; protocol makes failure modes testable without network. |
| D12 | AI number guard (`find_unsupported_numbers`) | Enforces "AI may not create new numbers" mechanically, not only by prompt. |
| D13 | Recommended site decided only by `science/scoring.rank` | AI output schema has no field that can change the recommendation. |
| D14 | SQLite + SQLAlchemy 2.0 with portable types (JSON, DateTime(tz)) | Zero-ops now; `SELENORA_DATABASE_URL` switch to PostgreSQL later. No Alembic yet (schema still moving) — add before Phase 2 persistence. |
| D15 | In-process rate limiter & caches | Single-instance deployment. Must move to Redis/DB before multi-worker scaling. |
| D16 | shadcn/ui **conventions** written by hand on `radix-ui` + CVA (`components.json` included) | The shadcn CLI is interactive/network-bound; hand-written components follow the same structure so `npx shadcn add` works later. |
| D17 | Tailwind **v4** with CSS-variable tokens (`@theme inline`) | Single source of truth for colours; matches the required palette exactly. |
| D18 | Self-hosted variable fonts (`@fontsource-variable`) | No runtime dependency on Google Fonts; consistent offline demos. |
| D19 | i18next with **typed** dictionaries (TR typed against EN) | Missing Turkish keys fail the typecheck. |
| D20 | Route-level code splitting (`React.lazy`) | OpenLayers (~290 kB) and Recharts (~440 kB) load only on their pages. |
| D21 | Demo result kept in memory (Zustand, not persisted); mission draft persisted | Avoids stale synthetic data reappearing as if it were a saved report. |
| D22 | Vite dev proxy for `/api`, `/health` + restricted CORS on the backend | No CORS friction in dev; production can serve both from one origin. |
| D23 | Toolchain as scaffolded by `create-vite` (Vite 8, TypeScript 7, React 19, Vitest 5, oxlint) | Latest stable at build time; `tsc -b` strict mode passes. |
