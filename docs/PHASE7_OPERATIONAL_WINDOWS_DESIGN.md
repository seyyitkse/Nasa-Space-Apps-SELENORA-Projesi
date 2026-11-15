# SELENORA — Phase 7 Design: Operational Windows (Research & Technical Proposal)

| | |
|---|---|
| Type | **Research and design only.** No code, scientific algorithm or other branch was changed. |
| Branch | `docs/phase7-operational-windows-design`, from `c80002d` (Phase 6B, latest backend). Not merged and not pushed. |
| Evidence date | 2026‑11‑14. Live calls to the SELENORA API (isolated instance, copied DB) and one real Horizons TERRAIN analysis (`6d5220ad…`, Points A/B, 14 days, 10 min). The official challenge page was read in the browser. |
| Proposed phase | **Phase 7: Operational Windows**, split into 7A countdown · 7B solar potential · 7C same‑site date scenarios. Implementation has **not** started. |

## 1. Current project state (corrects earlier assumptions)

| Area | Status | Where |
|---|---|---|
| Interactive 3D Moon | **Done.** NASA SVS 14959 globe, verified orientation, research‑site pins, hand‑off to LOLA 5 m | Phase 6A `409a062` |
| High‑quality 3D Moon | **Done.** Progressive High tier (re‑registered NASA topo model), LOLA tile footprints, resolution ladder | Phase 6A.1 `1a13d02` |
| Globe data / coordinates | **Done.** `GET /api/v1/globe/sites`, MOON_ME validation, **8 research sites** | Phase 6B `c80002d` |
| Beginner/Scientist modes, guided mission | **Done.** Explorer/Scientist toggle, guided mission, plain‑language results, TR/EN | Phase 5D `b3ff13e` (+ 5F) |
| Local 3D LOLA terrain with Sun direction | **Done** | Phase 5D / 5F |
| LROC map quality | **In progress (Codex).** 5F.1 committed `cef848b`; 5F.2 branch at the same commit | `feature/phase5f2-imagery-quality` |
| Time playback | **Done.** Steps through sampled epochs | `features/horizon-sim/TimeControls.tsx` |
| Custom coordinates | **Done** | Explorer / Planner custom sites |

Integration note (**confirmed gap**): 6A, 6A.1, 6B and 5F.1/5F.2 are **separate branches off `a9f7ec2`**, and none is merged. `main` / `origin/main` is still at `8ba4b5f` (pre‑5C). Any demo or submission needs an integration branch first.

## 2. The actual challenge requirements

Source: <https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/> (Details + Resources tabs, read 2026‑11‑14).

The core task is to **"compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the horizon to assess power generation potential and direct‑to‑Earth communication windows."** All objectives are phrased as "may", so they are guidance, not hard requirements. The text explicitly names:

- **Time remaining before sunset/Earthset** (twice): "Consider how to clearly communicate time remaining before sunset or Earthset, as this is critical operational information."
- **Alternative dates at the same site**: "…evaluate alternative sites in the same region, *or alternative dates at the same site*…"
- **Power generation potential**, with the solar elevation angle as a key metric.

The resources listed are Quickmap, Moon Trek and JPL Horizons.

## 3. Compliance matrix (confirmed vs. outdated)

| Challenge item | Status | Evidence |
|---|---|---|
| Curated site list | **Partial (confirmed gap).** 8 south‑polar research sites only; **no Apollo, CLPS, or other‑country sites** | `site_service` seeds (6B) |
| Custom coordinates | Met | Explorer/Planner custom sites |
| Side‑by‑side multi‑site comparison | Met (2–10 sites per analysis) | `AnalysisCreate.sites` |
| Landing date/time selection | Met (window ≤ 30 days, step 10–1440 min) | `AnalysisCreate` |
| **Alternative dates at the same site** | **Gap (confirmed live).** One site → HTTP 422 `too_short`; the same site twice → 422 "distinct coordinates"; one window per analysis; the comparison page shows one analysis | §6 |
| Sun/Earth position relative to the horizon | Met: az/el series, horizon profile, 3D terrain Sun direction, simulator | 5B/5D/5F |
| **Time remaining before sunset/Earthset** | **Gap (confirmed).** No countdown anywhere in backend or frontend | grep: no countdown/sunset code |
| Solar elevation, sunlight duration, Earth windows | Met | Visibility metrics, epochs |
| **Power generation potential** | **Gap (confirmed).** No incidence or panel model; only Sun visibility percentage and elevation | §5 |
| 2D maps / 3D visualisation | **Met (earlier "no 3D" is outdated).** 2D Explorer, 3D globe (6A/6A.1), local 3D LOLA (5D) | branches above |
| Temporal dynamics / animation | Met (timeline lanes, playback) | Simulator |
| Accessibility across skill levels | **Met (earlier "no education mode" is outdated).** Explorer/Scientist modes, guided mission, glossary, TR/EN | 5D |
| No‑atmosphere horizon | Met. Horizons `QUANTITIES=4` apparent az/el, no refraction; geometric sphere + LOLA terrain | `horizons.py` |
| Libration | Met implicitly. Horizons topocentric geometry; Earth elevation swings −7.2° … +6.1° at Point A over 28 days in stored data | analysis `2e8ded6e` |
| Real topography / steep craters | **Partial (confirmed).** LOLA 5 m local tiles work, but far‑field coverage is low: complete horizon coverage **6.9 % (A), 1.4 % (B)**. 33–53 % of Sun samples are UNKNOWN in the 14‑day test | `6d5220ad` |
| Integrated deliverable | **Gap.** Features live on unmerged branches | §1 |

## 4. 7A — Sun/Earth next rise/set countdown (scientific design)

### 4.1 Measured physics at the south pole (why a naive countdown is wrong)

From stored analyses `2e8ded6e` (28 d, 60 min, geometric) and `ef2ae03e` (15 d, 10 min), and the new TERRAIN run `6d5220ad`:

| Quantity | Measured |
|---|---|
| Sun elevation rate at polar sites | **0.002–0.04 °/h** (Point A ≈ 0.002, Malapert ≈ 0.024) |
| Time for the Sun's disc (Ø 0.53°) to cross the **geometric** horizon | **13–30 h** (median 16 h at Malapert) |
| Time for Earth's disc (Ø ≈ 1.9°) to cross | **30–39 h** |
| Point A, Dec 2026, geometric | **No Sun transition in 28 days** (elevation 0.88–1.76°) |
| Sun azimuth rate | **≈ 0.51 °/h** (it sweeps around the horizon) |
| **Terrain** event sharpness | Margin jumped **−1.40° → +0.09° within 10 min** (Sun clearing a ridge in azimuth); disc crossing ≈ 4–9 min |
| Terrain transitions observed | **BLOCKED → UNKNOWN**, not VISIBLE, because the far terrain is unknown |

Consequences:

- At the geometric horizon, "sunset" is a **many‑hour process**.
- At the terrain horizon it can be **abrupt**, but often **unverifiable**.
- A single countdown number would be misleading in both cases.

### 4.2 Definitions (to be shown in the UI)

- **Margin** m(t) = body elevation − horizon elevation at the body's azimuth. Horizon = 0° for **geometric (lunar sphere)**, or the LOLA horizon for **terrain**. The two are always computed and labelled separately.
- **Centre events:** m crosses 0. This is the existing engine convention (disc centre, `visibility.py`).
- **Limb events (new, reported alongside):** "first light" when m = −ρ (upper limb appears) and "full disc" when m = +ρ. Sun ρ ≈ 0.2666°; Earth ρ ≈ 0.95°. With Horizons range data ρ can be exact (§4.6).
- **States:** VISIBLE / BLOCKED / UNKNOWN exactly as `EpochSample`. UNKNOWN is never mapped to VISIBLE or BLOCKED.

### 4.3 Algorithm (new, read‑only over existing outputs)

Input: the authoritative `GET /analyses/{id}/epochs` (stored, any horizon model), plus a reference time t₀. t₀ is "now" if it falls inside the window, otherwise a user‑selected epoch. The countdown goes to the **next event after t₀ inside `[start, end)`**.

1. Find the first state change after t₀ for the requested body and horizon type. It lies between samples i and i+1.
2. **Bracket** (always shown): event ∈ (tᵢ, tᵢ₊₁]. The honest uncertainty is ± one step (10–1440 min).
3. **Estimate** (optional): linear interpolation of m between the two samples.
   - Geometric: valid, because m is smooth.
   - Terrain: shown only as "≈" with the bracket, because h(az) can be discontinuous.
4. **Refinement (optional, live):** request Horizons at a 1‑min step over the bracket only (a few dozen rows) and re‑evaluate m. The bracket then becomes ±1 min, plus horizon uncertainty (§4.4).
5. **UNKNOWN handling:**
   - VISIBLE → UNKNOWN → BLOCKED: report "set occurred within [first UNKNOWN, first BLOCKED]".
   - BLOCKED → UNKNOWN: report "**clears known terrain** at …, far terrain unknown". This is **not** a sunrise.
   - State UNKNOWN at t₀: no countdown.
6. **No transition after t₀ within the window:** show "**No sunset within the analysis window** (ends …). Sun remains above the {geometric|terrain} horizon for at least X h." This is a lower bound, never a countdown. Offer "extend window / new analysis".
7. **Limb timing:** report the times when m reaches ±ρ in the same way (bracket + estimate), as a "partial‑disc period".

### 4.4 Uncertainty budget (displayed per event)

| Source | Magnitude | Handling |
|---|---|---|
| Sampling step | ± step (default 60 min) | Bracket; optional 1‑min refinement |
| Disc vs centre | Hours (geometric, §4.1) | Separate limb events |
| Terrain horizon (DEM) | δh / (dm/dt). With δh ≈ 0.05–0.1° (5 m LOLA, Barker product 78) and a slow geometric rate → hours; at azimuth‑driven terrain events → minutes | Per event: δt ≈ δh/|dm/dt| from the two samples |
| Far‑terrain coverage | Can make the event unknowable | UNKNOWN semantics (§4.3‑5) |
| Coordinates (approximate seeds) | Site‑level | Already labelled APPROXIMATE |
| Observer height | 2 m default (0–50 m supported by `/terrain/horizon-profile`) | State it; panel height may differ (7B) |

### 4.5 API proposal (additive; no change to existing algorithms)

`GET /api/v1/analyses/{id}/events?body=sun|earth&horizon=geometric|terrain&after=<utc>&refine=false|true`

Response per site:

- `next_event` with fields `{kind: rise|set|clears_known_terrain|enters_unknown, centre: {bracket_start, bracket_end, estimate?}, limb: {first_light?, full_disc?}, uncertainty_minutes, basis: sampled|refined, horizon_type}`, **or**
- `no_event: {reason: no_transition_in_window|unknown_at_reference, visible_for_at_least_h}`.

The function is pure over stored epochs plus an optional Horizons refinement. It gets unit tests on synthetic series covering every branch above.

### 4.6 Optional enhancement (separate decision)

Add Horizons quantity 20 (observer range) to obtain exact Sun and Earth angular radii and Sun distance. This is a **new query field**, not a change to the existing visibility logic; it would be versioned (`algorithm_version` bump) if adopted.

## 5. 7B — Relative solar power potential (scientific design)

### 5.1 Scope and honesty

The first deliverable is a **relative, assumption‑explicit potential index**, not watts. There is no cell efficiency, temperature, dust, degradation, battery or shadow‑casting hardware. Absolute irradiance (W/m²) is reported only when §5.4 is adopted, and still labelled "incident irradiance, not electrical output".

### 5.2 Model

For each epoch with the Sun at elevation e and azimuth A:

- **Disc visibility fraction** f ∈ [0, 1]. It is the circular‑segment fraction of the solar disc above a horizon treated as straight across the disc, at centre margin m: f = [acos(−x) + x·√(1−x²)]/π with x = clamp(m/ρ, −1, 1). This is a stated first‑order approximation.
  - Geometric: h = 0.
  - Terrain: h = LOLA horizon at A. UNKNOWN epochs carry **no f** (see §5.3).
- **Incidence** cos θ for each panel scenario (unit normal **n**, Sun vector **s**):

| Scenario | cos θ | Notes |
|---|---|---|
| Horizontal | sin e | Expected ~2–3 % of ideal at the pole |
| Fixed vertical, facing azimuth A₀ (or tilt β) | max(0, sin e cos β + cos e sin β cos(A − A₀)) | A₀ user‑set or optimised over the window (reported as such) |
| Single‑axis azimuth‑tracking vertical | cos e | Typical polar mast design |
| Dual‑axis tracking | 1 | Upper bound |

- **Potential index:** P = Σ f · cos θ · hold_hours / Σ hold_hours (valid samples), as a percentage of an ideal dual‑axis panel in full sun for the same duration. It is reported with the sunlit‑hours and longest‑darkness metrics that already exist.

**Illustration** (real stored data `2e8ded6e`, geometric horizon only, Dec 2026):

| Site | Disc visible | 2‑axis | Vertical 1‑axis | Vertical fixed (best az) | Horizontal |
|---|---|---|---|---|---|
| Point A | 100 % | 100 % | 100 % | 33.7 % (195°) | 2.33 % |
| Malapert | 59.4 % | 59.4 % | 59.3 % | 33.5 % (25°) | 3.39 % |

Point A is terrain‑blocked during this window (Phase 4/5D), so the geometric 100 % must never be shown without the terrain result. This is why §5.3 matters.

### 5.3 Visibility states and UNKNOWN (mandatory rules)

- VISIBLE: f from the margin. BLOCKED: f = 0 (partial f near the edge when the margin is within ρ).
- **UNKNOWN is neither 0 nor visible.** Report a **range**:
  - P_min: UNKNOWN treated as 0.
  - P_max: UNKNOWN treated as the geometric f.
  - The unknown fraction is shown separately.
  - A single "best estimate" is **not** shown when the unknown fraction exceeds a threshold (proposal: 10 %).
- Geometric‑only and terrain results are always labelled. When the analysis is LOCAL_TERRAIN_PARTIAL, there is no recommendation (consistent with 5D).

### 5.4 Uncertainties and optional absolute layer

| Item | Effect | Treatment |
|---|---|---|
| Sun distance (≈ 0.983–1.017 AU) | ±3.4 % irradiance | Ignored in the relative index. In the absolute layer use S = 1361 W/m² · (1 AU/r)² with r from Horizons quantity 20 |
| Disc approximation (straight horizon) | Small, near edges | Documented |
| Panel height vs 2 m horizon | A higher mast lowers the horizon and changes terrain states | Expose `observer_height_m` (0–50 m, already supported by `/terrain/horizon-profile`). The analysis engine itself currently uses the default height, so the **gap** is a per‑scenario height in TERRAIN analyses |
| Sampling step | Integration error ~ step | Show the step; recommend ≤ 60 min |
| Earthshine / reflected light | Not modelled | Stated |

### 5.5 API proposal

`GET /api/v1/analyses/{id}/solar-potential?panel=horizontal|fixed&azimuth_deg=&tilt_deg=|azimuth_tracking|dual_axis&horizon=geometric|terrain`

Returns per site `{index_pct | null, index_min_pct, index_max_pct, unknown_fraction, sunlit_hours, assumptions[], uncertainty_notes[], optimised_azimuth_deg?}`. It is a pure function over stored epochs, with unit tests: synthetic Sun paths, panel geometry identities (dual‑axis ≥ 1‑axis ≥ fixed ≥ 0), and UNKNOWN range ordering.

## 6. 7C — Same site, different dates

**Verified behaviour (live API, 2026‑11‑14):**

- One site → `422 sites: List should have at least 2 items`.
- The same coordinates twice (to model two dates) → `422 Each site must have distinct coordinates`.
- One `start_utc/end_utc` per analysis.
- `ComparisonPage` renders one `analysisId`.

The engine already handles each site independently (Horizons per site; per‑site metrics), so the restriction is an **API‑contract choice, not a scientific limitation**.

**Proposed scope (options, recommend B):**

| Option | Change | Pros / cons |
|---|---|---|
| A | Allow `sites` min 1 and run one analysis per date; the client compares stored analyses | Smallest change. Ranking within a 1‑site analysis is trivial; cross‑analysis comparison must check equal step, window length and horizon model |
| **B (recommended)** | New `POST /api/v1/scenarios` taking `[{site, start_utc, end_utc}]` (same or different sites, 2–10 scenarios), reusing the existing per‑site pipeline; results keyed by scenario; scoring and ranking across scenarios with the existing deterministic formula; **requires equal window lengths and step** so percentages and durations are comparable | Cleanest semantics ("A on 1 Dec vs A on 1 Jan"); existing `/analyses` untouched |
| C | Relax the distinct‑coordinates rule and add per‑site windows inside `/analyses` | Breaks the current contract and stored‑result assumptions; not recommended |

UI: a "Date scenarios" mode in the Planner, plus Comparison and countdown/solar panels per scenario. The guided mission gains a "try another date" step. Date presets:

- **Same lunar phase next month:** +29.53 d synodic.
- **Next draconic cycle:** +27.21 d, the Sun‑elevation season at the pole.
- **±1 Earth week.**

Each preset is labelled as an exploration aid, not as an equivalent‑conditions guarantee.

## 7. Recommended Phase 7 plan (not started)

| Step | Content | Depends on |
|---|---|---|
| 7.0 | Integration branch: 5F.x + 6A.1 + 6B (coordinate with Codex/Cursor) | Owners' approval |
| **7A** | Events API (§4.5) + countdown UI (geometric | terrain | UNKNOWN; bracket + limb period; "no event in window") + optional 1‑min Horizons refinement | Epochs (exists) |
| **7B** | Solar‑potential API (§5.5) + panel scenario UI (4 panels, range when UNKNOWN, assumptions panel) | Epochs (exists) |
| **7C** | Scenario API option B + Planner/Comparison date mode | Existing pipeline |
| 7D (data) | Far‑field horizon from PGDA LOLA 80°S 20 m / 83°S 10 m COGs (see `docs/LUNAR_EXPLORER_IMAGERY_REQUIREMENTS.md`, branch `docs/lunar-imagery-requirements`) to reduce UNKNOWN. This is a **data** extension of the validated terrain engine and needs its own validation phase | Scientific review |
| 7E (catalogue) | Optional curated non‑polar sites (Apollo, CLPS targets, Chang'e, Chandrayaan‑3) with sourced coordinates. Horizons works anywhere; LOLA terrain stays polar‑only | Source verification |

Each step gets pure‑function unit tests on synthetic series, regression tests against stored analyses, and documentation of every assumption. Existing algorithms (`visibility.py`, `terrain_visibility.py`, `scoring.py`) stay unchanged. New logic consumes their outputs.

## 8. Sources

- Challenge: <https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/> (Resources: Quickmap <https://quickmap.lroc.asu.edu/>, Moon Trek <https://trek.nasa.gov/moon/>, JPL Horizons <https://ssd.jpl.nasa.gov/horizons/>)
- SELENORA code read: `backend/app/schemas/analysis.py`, `schemas/epochs.py`, `science/visibility.py`, `science/terrain_visibility.py`, `integrations/nasa/horizons.py`, `api/v1/ephemeris.py`, `api/v1/terrain.py`; frontend `ComparisonPage.tsx`, `TimeControls.tsx`
- Evidence analyses on the isolated API: `2e8ded6e` (28 d/60 min), `ef2ae03e` (15 d/10 min), `0070745b` (TERRAIN 24 h), `6d5220ad` (TERRAIN 14 d/10 min, created for this research)
