# SELENORA — Competition Readiness (Phase 3.2)

**Date:** 2026-11-14  
**Branch:** `feature/phase3-live-validation`  
**Protected tag:** `phase3.1-live-validated` (`39dcdd3`)  
**Algorithm:** `0.3.0-phase3` · **AI prompt:** `explain-v1` · **Model:** `deepseek-flash`  
**Phase 4:** not started

Secrets, `.env`, and SQLite databases were **not** committed.

---

## 1. Scientific accuracy

| Claim | Status |
|---|---|
| Metrics come from NASA/JPL Horizons geometric Az/El (QUANTITIES=4, `coord@301`) | Verified |
| Ranking is deterministic (weighted sun / Earth / joint) | Verified |
| Ties produce **no** single recommendation | Verified on competition pair |
| DeepSeek explains only the evidence package; cannot override ranks | Verified (guards + live) |
| Geometric horizon ≠ terrain; Earth above horizon ≠ link budget | Surfaced in limitations + AI notes |
| Coordinates are approximate references, not Artemis III polygons | Explicit in seed + demo snapshot |

**Offline jury record:** analysis `dd025b63-dd42-4845-8c6b-89834b665b2d`  
Snapshot: `docs/competition_demo_snapshot.json` (pre-computed Horizons + DeepSeek; label as **cached / previously validated**, never as a live recalculation).

---

## 2. South-pole suitability & Equatorial Ref investigation

### What was “Equatorial Ref”?

| Field | Value |
|---|---|
| Coordinates | **0.0° N, 0.0° E** |
| South polar? | **No** |
| Origin | Phase 3.1 live e2e **test contrast** only (`live_explain_e2e.py`), to force a non-tie score against Shackleton |
| Engine ranking | Correct under 40/40/20 weights: equator had Earth + joint visibility → score **66.667** vs polar sun-only **40.0** |
| DeepSeek | Faithfully reported Equatorial Ref as winner — accurate for that test, **not** a mission recommendation |

**Do not present Equatorial Ref (or analysis `e517183e-…`) as a south-pole / Artemis landing candidate.**

### Competition sites (south polar only)

| Site | Lat | Lon (east+) | Seed id | Source |
|---|---|---|---|---|
| **Shackleton Rim Point A** | −89.68° | −166.0° | `shackleton-rim-a` | Approx. Bussey et al. (2010), *Icarus* 208 — Point A |
| **Connecting Ridge Point B** | −89.44° | −141.8° | `connecting-ridge-b` | Approx. Bussey et al. (2010), *Icarus* 208 — Point B |

Frame: planetocentric latitude, east-positive longitude (SELENORA / Horizons GEODETIC convention).  
`coordinate_status`: `APPROXIMATE_REFERENCE` — verify against IAU Gazetteer / Artemis III region docs before scientific publication.

### Competition demo result (live Horizons + DeepSeek)

| Window | 2026-12-01 → 2026-12-05 UTC · step 360 min |
|---|---|
| Quality | `EPHEMERIS_GEOMETRIC` |
| Point A | sun 100% · earth 0% · joint 0% · darkness 0 h · comm gap 102 h · score **40** · rank 1 |
| Point B | identical metrics · score **40** · rank 1 |
| Recommendation | **`null` (tie)** — scientifically expected under smooth-sphere geometry for this window |
| DeepSeek | Correctly stated the tie; unsupported numbers `[]`; cache hit on repeat |

---

## 3. API & backend status

| Check | Result |
|---|---|
| Port `127.0.0.1:8000` | Listening (restarted during Phase 3.2 gate) |
| `/health` | `ok` · `algorithm_version=0.3.0-phase3` · `ai_analyst=READY` (`deepseek-flash`) |
| Process note | Earlier listener was `start-selenora.bat` → `.venv` uvicorn `--reload` (worker PID historically 58632). **Do not trust HTTP 200 alone** — confirm `algorithm_version` + AI READY |
| Database | Existing `backend/data/selenora.db` preserved (gitignored); no wipe |
| Git protection | Tag `phase3.1-live-validated`; `.env` and `*.db` ignored |

---

## 4. Test results

| Suite | Result |
|---|---|
| Backend pytest (`-m "not live"`) | **58 passed**, 2 live deselected |
| Frontend Vitest | **28 passed** |
| TypeScript `tsc -b` | Clean |
| Production `npm run build` | Success |
| Live Horizons south-pole pair | `competition_south_pole_demo.py` → **RESULT=OK** |
| Live DeepSeek explain | EN briefing stored; cache verified |

Live API calls kept to one competition analysis + one EN explain (+ cache hit).

---

## 5. Critical issues

| Severity | Issue | Mitigation |
|---|---|---|
| High (demo messaging) | Equatorial Ref appeared in Phase 3.1 validation UI | Documented; scripts restored to south-polar pair only |
| Medium | Short Dec windows → identical polar geometric scores | Honest **tie**; do not invent a winner. Longer windows / terrain (Phase 4) may differentiate |
| Medium | Sync Horizons POST can block | Keep demo windows ≤ ~4 days @ 360 min |
| Low | Approximate coordinates | Always show Science Transparency + `APPROXIMATE_REFERENCE` |
| Low | Offline cache must be labelled | Use snapshot JSON / stored analysis id; say “previously validated” |

No blocker that prevents a scientifically honest jury demo.

---

## 6. Jury demo script (repeatable)

1. **Sites:** Shackleton Rim Point A + Connecting Ridge Point B (table above).  
2. **Dates:** 2026-12-01T00:00:00Z → 2026-12-05T00:00:00Z, step 360 min, weights 40/40/20, geometric horizon.  
3. **Run:** Mission Planner → real analysis **or** open stored id `dd025b63-dd42-4845-8c6b-89834b665b2d`.  
4. **Compare:** Site Comparison — sun / Earth / joint %, darkness, communication gaps (same id + window).  
5. **Score:** Explain deterministic weights; show **tie → no recommendation**.  
6. **AI:** Analyst → Generate briefing (or show cached); disclaimer: explanatory only.  
7. **Transparency / Reports:** provenance `jpl-horizons`, geometric limitations, no NASA endorsement.

**If offline:** open the stored analysis + AI report; state clearly it is a **previously validated** Horizons/DeepSeek run (`competition_demo_snapshot.json`), not a live recomputation.

**Script:** `backend/scripts/competition_south_pole_demo.py`

---

## 7. Phase 4 transition risks (do not start yet)

1. LOLA terrain may **break** geometric ties and change rankings — re-validate AI guards.  
2. Background / true HTTP 202 jobs for long windows.  
3. Official Artemis III region polygons vs approximate Bussey points.  
4. Token cost if every demo regenerates DeepSeek instead of using cache.

---

## Verdict

**Competition-ready for a scientifically honest Phase 3 demo** (Horizons + deterministic scores + DeepSeek explanation + transparency), provided Equatorial Ref is never presented as a polar candidate and ties are explained as engine truth.

**Phase 4 was not started.**
