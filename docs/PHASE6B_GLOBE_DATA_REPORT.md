# SELENORA — Phase 6B Globe Data & Coordinate Validation Report

**Branch:** `feature/phase6b-lunar-data`  
**Worktree:** `.worktrees/phase6b`  
**Base commit:** `a9f7ec2` — *Update Phase 5F verification provenance to commit 2bf0c08.*  
**Scope:** Backend geospatial data, coordinate docs, globe-ready API, tests only  
**Isolation:** No frontend edits · no LROC imagery service changes · no visibility/scoring math changes · not merged to main  
**Date:** 2026-11-14

---

## 1. Summary

Phase 6B validates lunar coordinate conventions for Claude’s interactive 3D globe, inspects the NASA SVS #14959 GLB geometry, verifies the existing seed-site catalog, and exposes a thin read-only globe marker endpoint that reuses Mission Planner coordinates.

| Item | Status |
|------|--------|
| Worktree / branch from Phase 5F | Done (`a9f7ec2`) |
| NASA ME / planetocentric research | Done (LRO white paper + SVS + Horizons) |
| SVS #14959 `moon_small.glb` inspection | Done (geometry axes match MOON_ME; UV caveats) |
| Seed site catalog verification | Done (IDs/coords unchanged) |
| `GET /api/v1/globe/sites` | Done (backward-compatible; reuses DB seeds) |
| Existing `/sites` + `/artemis/regions` | Preserved (+ clearer MOON_ME frame string) |
| Phase 6B pytest module | Done |

---

## 2. Source verification

| Source | Role | Verified |
|--------|------|----------|
| [NASA SVS #14959](https://svs.gsfc.nasa.gov/14959/) — Moon 3D Models (released 2026-01-29; updated 2026-04-01) | GLB assets for web/AR | Page + SVS JSON API `http://svs.gsfc.nasa.gov/api/14959` |
| `moon_small.glb` | Inspected binary | Downloaded to `data/raw/svs14959/` (gitignored); 13 799 876 bytes |
| [LRO/LGCWG lunar coordinate white paper](https://science.nasa.gov/wp-content/uploads/2024/01/luncoordwhitepaper-10-08.pdf) | Planetocentric + ME definition | Fetched |
| [NASA ACR lunar reference frames](https://www.nasa.gov/wp-content/uploads/2024/12/acr24-lunar-reference-frames.pdf) | ME for surface science | Snippet review |
| [NASA SVS CGI Moon Kit #4720](https://svs.gsfc.nasa.gov/4720) | Color maps centered on 0° lon | Related upstream of SVS models |
| Existing `docs/COORDINATE_SYSTEMS.md` | SELENORA Phase 4 decisions | Reused / extended |
| JPL Horizons client (`horizons.py`) | `SITE_COORD` east-positive GEODETIC `@301` | Code + existing fixtures |

Bright Data MCP was unavailable (invalid API token). Research used Cursor WebFetch/WebSearch and Exa fetch/search instead.

---

## 3. Coordinate convention (SELENORA + Claude contract)

### 3.1 Planetary convention

| Quantity | Convention |
|----------|------------|
| Latitude | **Planetocentric** (−90…+90°). Angle from equatorial plane to radius vector from Moon center of mass. |
| Longitude | **East-positive**, stored −180…+180°. Normalize with `((lon+180)%360)-180`, mapping −180→+180. |
| Body frame | **Mean Earth / Polar Axis (MOON_ME)**: +Z = mean north rotation axis; +X = mean Earth direction (prime meridian); +Y completes right-handed triad (+90° E). |
| Sphere radius | **1 737 400 m** (IAU/IAG / LRO white paper; matches LOLA + Horizons sphere). |

### 3.2 Relationship to Horizons observers

Mission Planner / analyses send the **same** stored lon/lat to Horizons as:

```text
CENTER='coord@301'
COORD_TYPE='GEODETIC'
SITE_COORD='<E-lon>,<lat>,<alt_km>'
```

Horizons echoes west longitudes as positive east (e.g. −166 → 194 E) and cites `MEAN_ME` / DE441 for ephemerides. Surface lon/lat are **not** silently shifted for DE421↔DE441.

### 3.3 Spherical 3D conversion (scientific ME)

Implemented in `backend/app/science/lunar_sphere.py`:

\[
\begin{aligned}
x &= R\cos\phi\cos\lambda \\
y &= R\cos\phi\sin\lambda \\
z &= R\sin\phi
\end{aligned}
\]

with \(\phi\) = planetocentric latitude, \(\lambda\) = east-positive longitude (radians), \(R = 1\,737\,400\,\mathrm{m}\).

Inverse: \(\lambda = \mathrm{atan2}(y,x)\), \(\phi = \mathrm{asin}(z/R)\).

### 3.4 NASA SVS #14959 GLB orientation (inspected)

**File:** `moon_small.glb` (Khronos glTF Blender I/O v5.0.21)

| Check | Result |
|-------|--------|
| Node TRS / matrix | **Identity** (mesh node `"Cube"` has no translation/rotation/scale/matrix) |
| POSITION AABB | Symmetric about origin; extent ≈ ±1.27186 model units |
| +Z extreme | North pole (lat ≈ +90°) |
| −Z extreme | South pole (lat ≈ −90°) |
| +X extreme | Lon ≈ 0°, lat ≈ 0° (mean-Earth / prime-meridian side) |
| +Y extreme | Lon ≈ +90° E, lat ≈ 0° |
| Geometry vs MOON_ME | **Match** (right-handed ME sphere) |
| UV | **Not** vanilla equirect: equator samples at lon 0°/±90° give `u≈(lon+180)/360` but `v≈0.375` (not 0.5); poles pinched (SVS documents this artifact); antimeridian nearest-vertex UV unreliable |

**Status string (API):** `GEOMETRY_AXES_MATCH_MOON_ME_UV_CAVEATS`

**Claude requirements:**

1. Place markers with `cartesian_me` from `/api/v1/globe/sites` (or identical ME formula) in the **mesh root / body frame**, then apply only documented Three.js/glTF import transforms (e.g. Y-up) consistently to mesh **and** markers.
2. Do **not** derive marker lon/lat from UV.
3. Validate visually: Shackleton Rim Point A (−166°, −89.68°) and Connecting Ridge Point B (−141.8°, −89.44°) must sit near the south pole (−Z), with relative azimuth consistent with longitude.
4. If the loader rotates the mesh, rotate marker vectors the same way; re-check poles and lon 0° (+X).
5. Prefer the grid GLB (`Moon_NASA_LRO_15k_Grid*.glb`) for human lat/lon line checks during integration.

---

## 4. Existing site catalog findings

Seed source: `backend/app/db/seed.py` → table `landing_sites`.  
**No seed lon/lat or IDs were modified in Phase 6B.**

| ID | Lat ° | Lon ° E | Source (summary) | Approx? | South-polar | Local LOLA 5 m | Geometric analysis |
|----|-------|---------|------------------|---------|--------------|----------------|--------------------|
| `shackleton-rim-a` | −89.68 | −166.0 | Bussey et al. 2010 Point A | APPROXIMATE_REFERENCE | Yes | Expected Site04 when DEM installed | Yes |
| `connecting-ridge-b` | −89.44 | −141.8 | Bussey et al. 2010 Point B | APPROXIMATE_REFERENCE | Yes | Expected Site01 when DEM installed | Yes |
| `shackleton-floor` | −89.67 | 129.78 | IAU Gazetteer center (rounded) | APPROXIMATE_REFERENCE | Yes | No | Yes |
| `de-gerlache` | −88.5 | −87.1 | IAU Gazetteer center (rounded) | APPROXIMATE_REFERENCE | Yes | No | Yes |
| `malapert-massif` | −86.0 | 2.9 | Approximate rounded | APPROXIMATE_REFERENCE | Yes | No | Yes |
| `nobile` | −85.2 | 53.5 | IAU Gazetteer center (rounded) | APPROXIMATE_REFERENCE | Yes | No | Yes |
| `bussey-2010-point-c` | −88.71 | −68.7 | Bussey 2010 Point C | APPROXIMATE_REFERENCE | Yes | No | Yes |
| `bussey-2010-point-d` | −88.74 | 124.5 | Bussey 2010 Point D | APPROXIMATE_REFERENCE | Yes | No | Yes |

### Artemis regions vs research seeds

- `GET /api/v1/artemis/regions` exposes **historical 2022** (13 named regions) and **current 2024 shortlist** (9 named regions).
- Polygons are **never** fabricated (`polygon: null`).
- Seed IDs `shackleton-rim-a` / `connecting-ridge-b` are **not** Artemis region IDs and must not be labelled as official Artemis III footprints.
- Connecting Ridge appears as a **2022** candidate-region *name* only; it is **not** on the Oct 2024 shortlist.

---

## 5. API changes

### Preserved

- `GET /api/v1/sites` — same items/IDs/coordinates; list metadata `coordinate_frame` clarified to MOON_ME + Horizons compatibility; disclaimer mentions “NASA landing recommendations”.
- `GET /api/v1/artemis/regions` — unchanged contract.

### Added (backward-compatible)

`GET /api/v1/globe/sites` → `GlobeSiteCatalog`

- Reuses DB `LandingSite` rows (no duplicate database).
- Adds: `longitude_normalized_deg`, `south_polar`, `local_lola_coverage`, `local_lola_tile`, `geometric_analysis_supported`, `cartesian_me`, `not_nasa_landing_recommendation: true`.
- Top-level: sphere radius, cartesian convention, SVS orientation status/note, disclaimers, related endpoints.

No fake positions or region polygons.

---

## 6. Exact contract for Claude (3D globe)

1. **Primary marker feed:** `GET /api/v1/globe/sites` (or `/api/v1/sites` lon/lat + local ME conversion).
2. **Coordinates:** planetocentric lat + east-positive lon; identical to Mission Planner / Horizons.
3. **Cartesian:** use `cartesian_me` (`MOON_ME_SPHERE_SCIENTIFIC`) or `lunar_sphere.lonlat_to_cartesian`.
4. **GLB:** NASA SVS #14959; geometry axes match ME as inspected; apply loader transforms to mesh and markers together.
5. **Labels:** every marker is `APPROXIMATE_REFERENCE` and `not_nasa_landing_recommendation: true`. UI copy must not imply NASA landing selection.
6. **Artemis names:** from `/api/v1/artemis/regions` only; never invent polygons; distinguish 2022 vs 2024.
7. **Do not** call LROC imagery services from this phase’s data layer; Codex owns imagery.

### Marker validation checklist

- [ ] South pole (−Z) near Shackleton region markers  
- [ ] Lon 0° (+X) faces mean-Earth / near-side center of texture qualitatively  
- [ ] Point A vs Point B azimuth separation ≈ Δlon ≈ 24.2° near the pole  
- [ ] Switching marker source between `/sites` and `/globe/sites` yields identical lon/lat  
- [ ] Disclaimer visible in UI  

---

## 7. Tests

Module: `backend/tests/test_phase6b_globe_data.py`

| Coverage | Tests |
|----------|-------|
| Longitude normalization | Parametrized wrap / ±180 |
| North/south poles | Cartesian +Z / −Z |
| Prime meridian / 90°E | +X / +Y |
| Lon/lat ↔ Cartesian round trips | Seed + edge cases |
| South-polar classification | ≤ −80° |
| Seed IDs + locked lon/lat | No silent drift |
| Source provenance | `coordinate_source` present; APPROXIMATE_REFERENCE |
| Horizons SITE_COORD compatibility | Point A query string |
| Globe API | IDs, cartesian, disclaimer, not-NASA flag |
| Artemis 2022 vs 2024 | Counts, null polygons, seed ID separation |

---

## 8. Remaining uncertainties (for Claude)

1. **UV / texture registration:** Geometry axes match ME, but UV is not a clean equirect; do not place markers from UV. Confirm near-side mare placement visually after import.
2. **Model radius units:** Mesh radius ≈ 1.272 (not 1.0). Scale markers to the loaded mesh radius (or normalize mesh to unit sphere) before applying 1 737 400 m scientific positions — use direction vectors × mesh radius.
3. **Engine import transforms:** glTF Y-up vs Z-up conventions in Three.js/R3F may add an extra rotation; keep mesh+markers coupled.
4. **DE421 (LOLA) vs DE441 (Horizons ephemeris):** unchanged Phase 4 limitation; metre-scale, not centimetre.
5. **Grid/Topo GLB variants** not byte-inspected in this pass (same SVS family expected; re-check if used as primary asset).
6. **Bright Data** MCP auth failed this session; re-run `/bd-setup` if automated SVS scrapes are needed later.

---

## 9. Files touched (Phase 6B)

| Path | Change |
|------|--------|
| `backend/app/science/lunar_sphere.py` | New ME sphere helpers |
| `backend/app/services/globe_sites.py` | Globe catalog service |
| `backend/app/schemas/globe.py` | Response schemas |
| `backend/app/api/v1/globe.py` | `GET /globe/sites` |
| `backend/app/api/v1/__init__.py` | Router include |
| `backend/app/services/site_service.py` | Clearer MOON_ME frame / disclaimer |
| `backend/tests/test_phase6b_globe_data.py` | Validation tests |
| `docs/PHASE6B_GLOBE_DATA_REPORT.md` | This report |
| `docs/COORDINATE_SYSTEMS.md` | Phase 6B appendix |

---

## 10. Stop condition

Phase 6B complete on `feature/phase6b-lunar-data`. Do not merge to main. Do not submit the competition project from this branch.
