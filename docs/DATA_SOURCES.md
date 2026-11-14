# Data Sources, Data Quality & Scientific Assumptions

## 1. JPL Horizons (NASA/JPL Solar System Dynamics) — `INTEGRATED` (Phase 2)

- API: `https://ssd.jpl.nasa.gov/api/horizons.api` · Docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- Client: `backend/app/integrations/nasa/horizons.py`
- Orchestration: `backend/app/services/analysis_service.py` (`POST /api/v1/analyses`)
- **Verified against the live API on 2026-11-14** (fixture capture reported API signature 1.2 and DE441
  in the response header — these are recorded from live responses, not hard-coded as assumptions).
  Real responses are stored in `backend/tests/fixtures/` and parsed by unit tests.
- Live Phase 2 e2e: 2 south-polar sites × 2 days starting **2027-03-01** (non-December window) passed.

### Observer definition used

| Parameter | Value | Meaning |
|---|---|---|
| `CENTER` | `'coord@301'` | User-defined site on the Moon (body 301) |
| `COORD_TYPE` | `'GEODETIC'` | Site given as lon/lat/alt |
| `SITE_COORD` | `'<E-lon>,<lat>,<alt_km>'` | **East-positive** longitude (deg), latitude (deg), altitude 0 km |
| `COMMAND` | `'10'` Sun · `'399'` Earth | Target body |
| `EPHEM_TYPE` | `'OBSERVER'` | Observer table |
| `QUANTITIES` | `'4'` | Apparent azimuth & elevation (`Azi_(a-app)`, `Elev_(a-app)`) |
| `ANG_FORMAT` | `'DEG'` | Decimal degrees (note: `ANGLE_FORMAT` is rejected with HTTP 400) |
| `CSV_FORMAT` | `'YES'` | Parsed between `$$SOE` / `$$EOE` using the header line |
| `STEP_SIZE` | `'<n> m'` | Minutes |

What Horizons reported for these requests (from the live response header):
- `Center pole/equ : MEAN_ME (high precision)` → **lunar Mean-Earth/polar-axis body-fixed frame**.
- `Center radii : 1737.4 km` → spherical reference surface.
- `Atmos refraction: NO (AIRLESS)`; azimuth clockwise from north; elevation relative to the plane
  perpendicular to the reference-surface zenith ("geometric horizon").
- West longitudes are echoed as east (e.g. −166.0 → 194.0 E).
- Times are UT (UTC after 1962).

Sample real values (89.68° S, 166.0° W, 2026-12-01 00:00 UT): Sun az 86.07°, el +1.49°;
Earth az 172.67°, el −1.93°.

## 2. LRO / LOLA topography — `PLANNED` (Phase 4)

- https://science.nasa.gov/mission/lro/data-products/ · PDS Geosciences LOLA node.
- Intended product: south-polar LOLA DEM (polar stereographic GeoTIFF, e.g. 20–60 m/px tiles).
- Planned computations: terrain elevation, local horizon profile (max terrain elevation angle per
  azimuth, ray-marched over ~100–200 km), terrain shadowing → `EPHEMERIS_TERRAIN`.
- Interface: `HorizonProfileProvider` in `backend/app/integrations/nasa/lola.py`.
- **Until integrated, every analysis uses a geometric horizon and says so.** The map shows no base raster
  and an explicit "Base raster not connected" notice.

## 3. DeepSeek — AI explanation layer (not a data source)

- OpenAI-compatible API at `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), model from `DEEPSEEK_MODEL`
  (default `deepseek-flash`; alternative `deepseek-v4-pro`).
- Phase 3: `POST /api/v1/analyses/{id}/explain` sends an allow-listed **evidence package** (not raw timelines).
- Output validated by Pydantic; `find_unsupported_numbers` + ranking contradiction guard.
- ⚠️ **Live DeepSeek was not tested in Phase 3** (no API key in the build environment). Verify
  `GET /models` with your key before demos and adjust `DEEPSEEK_MODEL` if needed.
- Status: `INTEGRATED` when key present, else `NOT_CONFIGURED`.

## 4. Reference landing sites (seed data)

`backend/app/db/seed.py` — six south-polar locations with `coordinate_status = APPROXIMATE_REFERENCE`.
They are rounded feature coordinates (IAU Gazetteer feature centres; Bussey et al. 2010 points A/B) for
demonstration only and are **not** the official Artemis III candidate-region definitions. Verify against
the IAU Gazetteer of Planetary Nomenclature before scientific use.

## Data-quality labels

| Label | Meaning | Ranked? |
|---|---|---|
| `EPHEMERIS_GEOMETRIC` | Horizons ephemeris, smooth-sphere horizon | Yes |
| `EPHEMERIS_TERRAIN` | Horizons ephemeris + LOLA horizon | Yes |
| `SYNTHETIC_DEMO` | Analytic model, not real data — always shown with a banner | Yes (demo only) |
| `PARTIAL` | Some inputs missing | No |
| `UNAVAILABLE` | No usable data | No |

Analyses with > 5 % missing samples are not ranked (`science/scoring.is_scorable`).

## Scientific assumptions (current engine)

1. Visible ⇔ elevation **strictly** greater than the horizon elevation (0° geometric).
2. The Sun is evaluated at its disc **centre** (angular radius ≈ 0.27° is not modelled → partial-disc
   illumination counts as dark when the centre is below the horizon).
3. Sample-and-hold durations: each sample represents one time step; all durations are ±1 step.
4. Earth above the horizon is a **geometric** line-of-sight condition only — not a link budget, not
   antenna masks, not DSN scheduling.
5. Score = Σ (weightᵢ/100 × metricᵢ%) — a comparative heuristic, not a safety score.
6. Ties produce no single recommendation.

## SYNTHETIC_DEMO model (`backend/app/science/synthetic.py`)

Spherical geometry: elevation = asin(sin φ sin φ_b + cos φ cos φ_b cos(λ − λ_b)) for a body with
sub-point (φ_b, λ_b). Sub-solar latitude ±1.54° (346.6 d), sub-solar longitude 360°/29.53 d;
sub-Earth latitude ±6.7° (27.21 d), sub-Earth longitude ±7.9° (27.55 d). Latitude phases are anchored
to the two real Horizons samples above (±0.3°, unit-tested) so December 2026 looks plausible; it drifts
from reality elsewhere and must never be presented as ephemeris.
