# SELENORA — Submission README Documentation Report

**Branch:** `docs/submission-readme`  
**Worktree:** `.worktrees/readme-submission`  
**Base:** `origin/main` @ `6e283a021d06490da9ded29a413a4fb36099d827` (Phase 7A/7B/7C merge PR #7)  
**Date:** 2026-11-15  

## Purpose

Replace the outdated Phase 3 root README with an award-oriented, scientifically accurate English README that NASA Space Apps judges can understand without installing the software.

## Deliverables

1. Updated root `README.md`
2. Curated screenshots in `docs/assets/readme/`
3. This report
4. Focused documentation commit on `docs/submission-readme` (no merge to `main`)

## Sources of truth

| Topic | Primary sources |
| --- | --- |
| Release scope / tests | `docs/PHASE7BC_UNIFIED_RELEASE_REPORT.md` |
| Horizons / quality labels | `docs/DATA_SOURCES.md`, backend Horizons client |
| Terrain / UNKNOWN | `docs/PHASE4_TERRAIN_REPORT.md`, `docs/PHASE4_1_TERRAIN_VALIDATION.md` |
| Events / windows | `docs/PHASE7A_*` reports |
| Solar potential | `docs/PHASE7B_COMPLETION_REPORT.md` |
| Date scenarios | `docs/PHASE7C_IMPLEMENTATION_REPORT.md` |
| Architecture / setup | `docs/ARCHITECTURE.md`, `backend/.env.example`, `start-selenora.bat`, `backend/pyproject.toml`, `frontend/package.json` |
| Routes | `frontend/src/app/router.tsx`, `backend/app/api/v1/*` |
| SVS attribution | `frontend/src/features/moon-globe/asset.ts` (SVS 14959) |

## Screenshot curation

| README asset | Origin | Role |
| --- | --- | --- |
| `01-hero-mission-control.png` | User-captured EN Mission Control (2026-11-15) | Hero |
| `02-moon-3d.png` | `docs/screenshots/phase7bc-integration/02-moon-standard.png` | 3D Moon (no Phase 7E mission catalog UI) |
| `03-lunar-explorer.png` | User-captured Lunar Explorer | LROC + LOLA footprints |
| `04-horizon-simulator-terrain.png` | User-captured Horizon Simulator | LOLA 3D terrain visualization |
| `05-mission-planner.png` | User-captured Mission Planner | Sites / dates / weights |
| `06-site-comparison.png` | User-captured Site Comparison | Deterministic GEOMETRIC comparison |
| `07-mission-windows.png` | User-captured Mission Windows | Phase 7A heatmap |
| `08-date-scenarios-results.jpg` | `docs/screenshots/phase7c/02-scenario-results-desktop.jpg` | Phase 7C Dec/Jan style results |
| `09-relative-solar-potential.jpg` | `docs/screenshots/phase7b-completion/04-explorer-panel-visible-after.jpg` | Phase 7B solar panel |

Avoided as primary evidence: Mission Reports with SUPERSEDED algorithm banners; synthetic-demo-as-real NASA results; Phase 7E lunar-missions globe UI; incomplete loading states.

## Claims intentionally not made

- Phase 7D / 7E completed
- NASA / JPL endorsement
- Electrical power (W / kWh) forecasting
- Flight certification / landing safety approval
- Invented team member names (roster not in repo docs)
- Deployed public demo URL (none verified in docs)

## License note

No `LICENSE` file exists at `6e283a0`. The README reports this rather than inventing a license.

## Integration guidance for `main`

1. Review `docs/submission-readme` (this worktree).
2. Open a PR into `main` when ready; do not fast-forward other feature worktrees.
3. After Phase 7D/7E are tested and merged, refresh feature lists and screenshots in a follow-up docs commit.
4. Optionally add an explicit open-source `LICENSE` and the official Space Apps team roster before final submission packaging.

## Git isolation

- Main project folder branch was not switched.
- Phase 7D / 7E worktrees were not modified.
- No automatic merge or push to `main`.
