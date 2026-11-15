# SELENORA — Scientific Integrity Hotfix Report (H1 + H2)

**Branch:** `feature/phase6c-science-hardening`  
**Worktree:** `.worktrees/phase6c-science`  
**Base:** `f01d2b4` (`feature/phase6c-unified-integration`, backed up on GitHub)  
**Commits:**

| ID | Commit | Scope |
|----|--------|--------|
| H1 | `25abcde` | TERRAIN visibility validity masks + null metrics |
| H2 | `d27bcae` | Decision weights in analysis cache identity |

**Not done:** merge to main, push of this branch, Phase 7, Codex `feature/phase6c1-mission-control-map` worktree.

---

## H1 — TERRAIN visibility metrics

### Root cause

`summarize` / terrain pair aggregation used a **joint** Sun∧Earth finite mask as the denominator for Sun and Earth percentages. When Earth was UNKNOWN while Sun was VISIBLE:

1. Joint-valid sample count could be empty or reduced → **0% or understated solar visibility**.
2. Darkness / blocked windows could treat non-VISIBLE samples (including UNKNOWN peers via shared logic) inconsistently with three-valued states.

UNKNOWN was effectively able to pollute percentages and darkness classification.

### Reproduction (synthetic fixtures; no fabricated NASA data)

| Case | Before (joint denom) | After (separate denoms) |
|------|----------------------|-------------------------|
| Sun all VISIBLE, Earth all UNKNOWN | `sun_visibility_pct = 0.0` | `sun = 100.0`, `earth = null` |
| Mixed 4-sample fixture (Sun/Earth VISIBLE/BLOCKED/UNKNOWN) | `sun ≈ 50%` (1/2 joint-valid) | `sun ≈ 66.67%` (2/3 sun-valid); `earth ≈ 66.67%`; `joint = 50%` |
| All UNKNOWN | often `0%` | all pcts `null`; not scorable; no darkness windows |
| All VISIBLE | `100%` | `100%` unchanged |

Darkness windows use **BLOCKED-only** masks; UNKNOWN is never darkness.

### Fix summary

- Separate validity masks and denominators for Sun, Earth, and joint.
- Percentages → `null` when no scientifically valid samples exist.
- Preserve VISIBLE / BLOCKED / UNKNOWN; windows use blocked masks.
- Frontend: `formatPct` / comparison / explain / rescore handle `null` as unavailable (`—`), refuse rescoring without numeric metrics.
- `TERRAIN_ALGORITHM_VERSION` → `0.4.2-phase6c-science-h1`; prior terrain algo versions treated as superseded for cache reuse.

### Changed files (H1)

- `backend/app/science/visibility.py`
- `backend/app/science/terrain_visibility.py`
- `backend/app/science/scoring.py`
- `backend/app/schemas/analysis.py`
- `backend/app/services/analysis_service.py`
- `backend/app/services/result_builder.py`
- `backend/app/core/config.py`
- `backend/tests/test_visibility_h1_unknown.py` (new)
- `backend/tests/test_terrain.py`, `test_duration_invariants.py`, `test_analysis_service.py` (version expectation)
- `frontend/src/types/api.ts`, `lib/format.ts`, `features/guided/explain.ts`, `explain.test.ts`
- `frontend/src/features/site-comparison/rescore.ts`, `GeometricTerrainCompare.tsx`
- `frontend/src/pages/ComparisonPage.tsx`, `features/ai-analyst/evidence.tsx`

### Tests

- `tests/test_visibility_h1_unknown.py` — all-UNKNOWN, partial-UNKNOWN, all-VISIBLE, separate denoms, darkness excludes UNKNOWN
- Existing science / terrain / duration / analysis suites green for targeted set
- Frontend: `explain.test.ts` (5 tests) passed

---

## H2 — Analysis cache weights

### Root cause

`analysis_cache_key(...)` hashed sites, window, step, horizon, algorithm, and data-source versions — **not** decision weights. Ranking and `recommended_site_label` depend on weights, so 40/40/20 and 80/10/10 produced the **same** cache key and could silently reuse an incompatible recommendation. `/explain` builds evidence from the **stored** result (including weights and recommendation); a wrong cache hit therefore yields a stale explanation.

### Reproduction

Before H2, `analysis_cache_key` had no `weights` parameter → 40/40/20 and 80/10/10 collided by construction.

After H2:

| Weights | Key prefix (sha256) |
|---------|---------------------|
| 40/40/20 | `026cef541f1a6ea91dd8f680…` |
| 80/10/10 | `32e4ef5d225400b9aae38909…` |
| identical inputs | keys match |

### Fix summary

- Require `weights` in `analysis_cache_key` (sorted keys, rounded percents).
- Pass `req.weights.model_dump()` from analysis and demo services.
- Explain path unchanged but now only sees analyses keyed with the weights that produced the ranking.

### Changed files (H2)

- `backend/app/services/cache_keys.py`
- `backend/app/services/analysis_service.py`
- `backend/app/services/demo_analysis_service.py`
- `backend/tests/test_science.py` (`test_cache_key_weights_40_40_20_vs_80_10_10`)
- `backend/tests/test_analysis_service.py`

### Cache / version migration impact

| Change | Effect |
|--------|--------|
| H1 `TERRAIN_ALGORITHM_VERSION` bump | Old terrain cache entries superseded; geometric `ALGORITHM_VERSION` unchanged |
| H2 weights in key | Pre-H2 cache entries (no weights in hash) will miss; new analyses recompute. Safe: avoids wrong ranking reuse |
| DB | No schema migration; no destructive DB ops |

---

## Validation run

- Backend targeted: visibility H1, science, analysis_service, duration, terrain — **pass**
- Full suite: one prior env miss for LOLA path in worktree; fixed via junction to `data/raw/lola`. Re-run of mesh guard + science set — **pass**
- Frontend lint (`oxlint`): warnings only (pre-existing), exit 0
- Frontend `explain.test.ts`: **pass**
- `tsc -b` in worktree via `node_modules` junction: R3F/`three` resolution noise unrelated to H1/H2; H1 null typing fixed in ComparisonPage / evidence / explain tests. Main frontend `tsc -b` remains clean for non-H1 tree.

---

## Remaining findings (read-only assessment — not fixed)

Recommended order after H1/H2: **H4 → H3 → M3 → M5**.

### H3 — GEOMETRIC below-horizon labeled terrain-blocked

- **Confirmed.** Epochs API maps `elevation ≤ 0` → `BLOCKED` in GEOMETRIC mode (`epochs_service._geometric_state`). Schema has no `BELOW_HORIZON`. UI string for `BLOCKED` is “Terrain-blocked”.
- Frontend already remaps geometric BLOCKED→BELOW_HORIZON only for `*Geometric` lanes, not authoritative `sun_state`/`earth_state`.
- **Fix later:** FE map when `horizon_model === 'GEOMETRIC'`, and/or extend API BodyState. Do not change LOLA terrain classification.

### H4 — Comparison page vs active analysis

- **Confirmed.** Nav → `/comparison` without id; page shows demo unless `:analysisId` present; ignores `workspaceStore.analysisId`.
- **Fix later:** resolve store id or redirect to `/comparison/:analysisId`. Backend unchanged.

### M3 — Exact lunar pole → 500

- **Confirmed.** `latitude_deg=-90` allowed by terrain API; `true_north_grid_azimuth_deg` raises `ValueError` for lat not in `(-90, 90]`; only `FileNotFoundError` caught → HTTP 500.
- **Fix later:** define pole north convention and/or return 422; do not change 3D Moon pick components for this.

### M5 — MOON_ME docs vs model axes

- **Docs discrepancy confirmed; math not proven wrong.** Backend MOON_ME: +Z north. Frontend `orientation.ts` documents model-space permutation (north = +Y after transform). Comments that “geometry axes match MOON_ME” can confuse scientific Cartesian with Three.js model space.
- **Fix later:** glossary / doc clarity + test vectors; **do not** change transforms on comment mismatch alone.

---

## Remaining scientific limitations

- Terrain completeness still drives `LOCAL_TERRAIN_PARTIAL` and may suppress ranking when coverage is incomplete (by design).
- GEOMETRIC mode remains a smooth-sphere approximation (H3 labeling aside).
- Cache identity still does not include mission name (intentional; science inputs only).
- No live Horizons refetch in this hotfix; fixtures and synthetic cases only.

---

## Explicit non-goals (honored)

- No Phase 7  
- No merge to main  
- No push of `feature/phase6c-science-hardening` pending review  
- No Codex `phase6c1` worktree edits  
- No 3D Moon point-creation component changes  
- No fabricated NASA data / undocumented science approximations  
- No destructive database changes  
