# SELENORA — Phase 6C Unified Integration Plan

| | |
|---|---|
| Type | **Integration plan only.** No merge, no feature implementation, no Phase 7A/7B/7C code. |
| Branch for this document | `docs/phase7-operational-windows-design` |
| Status | Frozen reference until Phase 5F.2 is complete |
| Gate | **Phase 5F.2 must finish before any Phase 6C merge or worktree creation** |

This document is the immutable integration reference for unifying completed SELENORA workstreams after imagery quality work lands.

---

## 1. Gate (non-negotiable)

**Do not start Phase 6C integration until Phase 5F.2 is complete.**

Codex owns `feature/phase5f2-imagery-quality`. That worktree must not be cleaned, staged, committed, reset, stashed, cherry-picked, or merged by another agent while Codex is active.

When Codex reports completion:

1. Verify the final clean Phase 5F.2 commit SHA.
2. Confirm reports, tests, API/frontend imagery contract, and verification artifacts are in that commit history (or an agreed follow-up docs commit by the completing agent).
3. Only then begin the steps in §2.

---

## 2. Integration sequence (after 5F.2)

1. Verify the latest clean Phase 5F.2 commit.
2. Create worktree: `.worktrees/phase6c`.
3. Create branch: `feature/phase6c-unified-integration`.
4. Merge `feature/phase6a1-moon-quality` (Phase 6A history is already contained).
5. Merge the current tip of `docs/phase7-operational-windows-design` (includes Phase 6B + Phase 7 design docs).
6. Align API and frontend contracts.
7. Test all navigation and scientific features.
8. Produce `docs/PHASE6C_INTEGRATION_REPORT.md`.

**Do not start these merge operations now.** Preserve this plan only until the gate opens.

Suggested base for the integration branch: the final Phase 5F.2 tip (imagery + tile contract), then bring in 6A.1 and the docs/design tip that carries 6B + Phase 7 design.

---

## 3. Technical requirements to preserve

### Imagery / tiles (5F.2 contract)

- Keep the Phase 5F.2 frontend/backend imagery and tile API contract together.
- Raster preview `blob`, CRS header, and new tile endpoints must remain compatible.

### Globe / sites APIs

- Bind the 3D Moon to `/api/v1/globe/sites`.
- Keep `/api/v1/sites` for Mission Planner.

### Navigation hand-offs

Complete these transitions:

- 3D Moon → Lunar Explorer (Ay Kaşifi)
- Lunar Explorer → LOLA 3D
- LOLA 3D → Mission Planner (Görev Planlayıcı)

### Science integrity

- Do not change research points or reference coordinates.
- Do not break Horizons, terrain visibility, scoring, or UNKNOWN scientific behaviour.

### Data / secrets / cache isolation

- Backup the SQLite database and copy it into the isolated integration worktree.
- Preserve `.env` and secret keys; never commit them.
- Manage durable map cache via `SELENORA_MAP_CACHE_DIR`.

### Verification bar for Phase 6C

- Backend tests
- Frontend tests
- TypeScript check
- Production build
- Real browser smoke tests

---

## 4. Explicit non-goals for Phase 6C

- Phase 7A / 7B / 7C implementation will **not** start in Phase 6C.
- Phase 7 design documents on `docs/phase7-operational-windows-design` must be **preserved**, not executed.
- No push to `main` / `origin/main` as part of opening Phase 6C.
- No rebase or force-push as part of the integration bootstrap.

---

## 5. Known parallel branch tips at plan freeze

These were verified by Git at plan-preservation time. Update SHA values only after confirming with `git rev-parse` / `git log -1`.

| Stream | Branch | Expected tip at freeze |
|---|---|---|
| Phase 5F | `feature/phase5f-immersive-integration` | `a9f7ec2` |
| Phase 5F.1 | `feature/phase5f1-lroc-fix` | `cef848b` |
| Phase 5F.2 | `feature/phase5f2-imagery-quality` | **in progress** (do not treat as complete) |
| Phase 6A | `feature/phase6a-interactive-moon` | `409a062` |
| Phase 6A.1 | `feature/phase6a1-moon-quality` | `1a13d02` |
| Phase 6B | `feature/phase6b-lunar-data` | `c80002d` |
| Imagery research | `docs/lunar-imagery-requirements` | `dce986a` |
| Phase 7 design | `docs/phase7-operational-windows-design` | tip advances when this plan is committed |

Note: Phase 6A.1 already contains Phase 6A. Phase 7 design branch already contains Phase 6B history.

---

## 6. First action after Codex finishes 5F.2

1. Read-only audit of `feature/phase5f2-imagery-quality` HEAD and worktree cleanliness.
2. Confirm imagery/tile contract and verification evidence.
3. Only if clean and complete: create `.worktrees/phase6c` and `feature/phase6c-unified-integration`, then follow §2.

Until then: **no Phase 6C merges, no new integration worktree, no feature development under Phase 6C.**
