# SELENORA — Submission README Documentation Report

**Branch:** `docs/submission-readme`  
**Worktree:** `.worktrees/readme-submission`  
**Merged main tip:** `origin/main` @ `32a7a20e848dd9af51f56ae27c55105c608b3155` (PR #8 — Phase 7D/7E)  
**Prior README commit preserved:** `ad39e6e`  
**Date:** 2026-11-15  

## Purpose

Finalize the judge-facing English README, Apache-2.0 LICENSE/NOTICE, and publication readiness for NASA Space Apps Challenge 2026 after Phase 7D/7E landed on `main`.

## Git isolation

1. Fetched `origin` and verified `32a7a20` on `origin/main`.
2. Merged `origin/main` into `docs/submission-readme` (merge commit preserved `ad39e6e` history and curated assets).
3. No science/code engine changes beyond SPDX license metadata in package manifests.
4. No reset/delete of worktrees; no merge to `main`; no visibility change.

## Deliverables

| Item | Status |
| --- | --- |
| Root `README.md` covering Phases 7A–7E | Updated |
| Original 9 curated screenshots | Preserved |
| Phase 7D/7E screenshots `10`–`13` | Added from submission-integration / phase7d-mvp |
| `LICENSE` (Apache-2.0 official text) | Added |
| `NOTICE` (NASA / third-party attribution boundary) | Added |
| SPDX in README + `backend/pyproject.toml` + `frontend/package.json` | Added |

## Screenshot map (`docs/assets/readme/`)

| File | Source | Topic |
| --- | --- | --- |
| `01`–`09` | Prior curated set (`ad39e6e`) | Hero through solar/scenarios |
| `10-lunar-missions-layer.png` | `docs/screenshots/submission-integration/01-moon-missions-layer.png` | Phase 7E |
| `11-apollo11-detail.png` | `docs/screenshots/submission-integration/02-apollo11-detail.png` | Phase 7E |
| `12-phase7d-remote-dem.png` | `docs/screenshots/phase7d-mvp/phase7d-01-custom-point-remote-dem.png` | Phase 7D |
| `13-phase7d-provenance.png` | `docs/screenshots/submission-integration/03-phase7d-provenance.png` | Phase 7D provenance |

## Scientific accuracy notes documented in README

- Remote Product 90 DEM = mesh visualisation only; does not extend TERRAIN horizon/scoring.
- Missions layer ≠ candidate-site scoring; planned targets are not confirmed landings.
- Test counts referenced from submission integration report: **292** backend / **219** frontend.

## Publication security (read-only)

| Check | Result |
| --- | --- |
| Tracked `.env` / `.pem` / `.db` / `.glb` / credentials | None found |
| History additions of secret-looking paths | Only `.env.example` files |
| High-entropy `sk-…` pattern in tracked non-lock files | 0 hits |
| Tracked files > 1 MB | None found |
| LUNARIS branding | None found |
| Tracked LROC/LOLA overview PNGs | Present under `frontend/public/lunar-overview/` with local README attribution; covered in `NOTICE` (not relicensed as Apache-2.0 data) |

No historical live credentials detected. No history rewrite performed.

## License compatibility (high level)

Apache-2.0 is compatible with typical permissive stack licenses used here (MIT/BSD-style React, FastAPI/Starlette ecosystem, etc.). Copyleft-only redistribution issues were not identified in the direct dependency declarations reviewed. NASA assets remain under their own terms — see `NOTICE`.

## Integration guidance

1. Push `docs/submission-readme`.
2. Open PR into `main` (do not auto-merge).
3. After merge, repository may be set Public by the owner for judging.
4. Optionally paste the official Space Apps team roster into the competition form (not invented in README).
