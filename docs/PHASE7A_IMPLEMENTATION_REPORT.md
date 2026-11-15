# SELENORA — Phase 7A Implementation Report: Operational Sun/Earth Events

| | |
|---|---|
| Branch | `feature/phase7a-operational-events` |
| Worktree | `.worktrees/phase7a` |
| Base | `f01d2b4` — *Enable custom research points from the 3D Moon* (tip of `feature/phase6c-unified-integration`) |
| Scope | Phase 7A only. **7B / 7C not started.** Not merged, not pushed. |
| Spec | `docs/PHASE7_OPERATIONAL_WINDOWS_DESIGN.md` §4, with the corrections listed in §5 below |
| Date | 2026-11-15 |

## 1. Base verification

`f01d2b4` exists locally, is the tip of `feature/phase6c-unified-integration`, and contains the
Phase 6C custom-point change set (`MoonPage.tsx`, `MoonScene.tsx`, `pickHelpers.ts`,
`customSiteAdapter.ts`, `MoonCreatePoint.test.tsx`, …; 16 files vs `5ed7454`). The backend is
byte-identical to `5ed7454`. No other base was substituted.

Baseline gates on untouched `f01d2b4` (before any 7A change):

| Gate | Baseline | After 7A |
|---|---|---|
| Backend pytest | 170 passed, 1 skipped | **200 passed, 1 skipped** (+30) |
| Frontend Vitest | 141 passed (23 files) | **150 passed (24 files)** (+9) |
| `tsc -b` | clean | clean |
| `vite build` | pass | pass |
| oxlint | 0 errors, 42 warnings | 0 errors, 42 warnings (none in 7A files) |

Logs: `docs/screenshots/phase7a/phase7a-{pytest,vitest,tsc,lint,build}.log`. The pytest run used
the real local LOLA Site01/Site04 rasters, so the LOLA-dependent tests ran rather than skipped.
pytest is configured quiet, so the counts come from its progress lines.

## 2. What was built

### Backend (new files only, plus one router registration)

| File | Role |
|---|---|
| `backend/app/science/events.py` | Pure event logic over three-valued sample series. No I/O. |
| `backend/app/schemas/events.py` | Response contract. |
| `backend/app/services/events_service.py` | `/epochs` payload → tracks → response; reference-time rules. |
| `backend/app/api/v1/events.py` | `GET /api/v1/analyses/{analysis_id}/events`. |
| `backend/app/api/v1/__init__.py` | Router registration (only edit to an existing backend file). |
| `backend/tests/test_phase7a_events.py` | 30 tests. |

### Frontend (new folder, plus small registrations)

| File | Role |
|---|---|
| `frontend/src/features/operational-events/{types,logic,api}.ts` | Contract types, presentation logic, fetch hook + capability check. |
| `frontend/src/features/operational-events/OperationalEventsPanel.tsx` | Panel (container) and `OperationalEventsView` (pure view). |
| `frontend/src/features/operational-events/operationalEvents.test.tsx` | 9 tests. |
| `frontend/src/i18n/locales/phase7a.{en,tr}.ts` | Strings (`events7a.*`). |
| `frontend/src/i18n/locales/{en,tr}.ts` | Two-line registration each. |
| `frontend/src/pages/SimulatorPage.tsx` | Import + one `<OperationalEventsPanel>` line (below the main grid). |
| `frontend/src/pages/WindowsPage.tsx` | Import, one `cursorT` selector, one panel line (above the interval lists). |

Not touched: `analysis_service.py`, `visibility.py`, `terrain_visibility.py`, `scoring.py`,
`cache_keys.py`, `epochs_service.py`, `adapter.ts`, `ComparisonPage.tsx`, `PlannerPage.tsx`,
`contracts.ts`.

## 3. API contract

`GET /api/v1/analyses/{analysis_id}/events?reference_utc=<ISO-8601 with timezone>`

- Source: `epochs_service.load_epochs` (the same authoritative per-sample states as `/epochs`).
  No new JPL Horizons request. Terrain states are recomputed from the local LOLA horizon at
  request time, exactly as `/epochs` does.
- `reference_utc` is optional.
  - Given: must be timezone-aware and inside `[first_sample_utc, last_sample_utc]`, else
    `422 REFERENCE_OUT_OF_WINDOW`. `reference_mode = REQUESTED`.
  - Omitted: the current time if it lies inside the stored samples (`NOW`), otherwise the first
    stored sample (`WINDOW_START`). Window start is never labelled as "now".
- Errors: `404 NOT_FOUND` (unknown or not-completed analysis), `422` as above, `501` when the
  stored analysis has no persisted timelines (inherited from `/epochs`).

Response shape (contract version `7a.1`):

```text
EventsResponse {
  analysis_id, mission_name, horizon_model, data_quality, algorithm_version,
  terrain_engine_version?,            # TERRAIN only
  start_utc, end_utc, first_sample_utc, last_sample_utc, time_step_minutes,
  reference_utc, reference_mode: NOW | WINDOW_START | REQUESTED,
  generated_at_utc, events_contract_version, event_time_semantics,
  sites: [SiteEvents], provenance[], limitations[]
}
SiteEvents { site_index, label, latitude_deg, longitude_deg, landing_site_id?, dem_site_id?,
             terrain_complete_coverage_fraction?, sun: BodyEvents, earth: BodyEvents }
BodyEvents { body: SUN | EARTH, nominal_angular_radius_deg,
             geometric: EventTrack, terrain: EventTrack | null }   # terrain only for TERRAIN analyses
EventTrack {
  horizon: GEOMETRIC | TERRAIN,
  status: EVENT_CONFIRMED | UNKNOWN_AHEAD | NO_EVENT_IN_WINDOW | UNKNOWN_AT_REFERENCE | INSUFFICIENT_DATA,
  current: EventSample?,              # last stored sample at or before the reference
  next_change: VisibilityEvent?,      # first change of any kind (may be BECOMES_UNKNOWN)
  next_confirmed_event: VisibilityEvent?,   # first RISE/SET between adjacent known samples
  next_known: EventSample?,           # UNKNOWN_AT_REFERENCE only; not an event
  no_change_through_utc?,             # NO_EVENT_IN_WINDOW only
  sample_count, unknown_sample_count,
  transitions: [VisibilityEvent], transitions_truncated
}
VisibilityEvent {
  kind: RISE | SET | BECOMES_UNKNOWN | RESOLVES_TO_VISIBLE | RESOLVES_TO_NOT_VISIBLE,
  confirmed: bool,                    # true only for RISE/SET
  from_state, to_state,
  bracket_start_utc (exclusive), bracket_end_utc (inclusive), bracket_minutes,
  before: EventSample, after: EventSample,
  last_known_before_unknown?, differs_from_last_known?, unknown_samples_before,
  elevation_rate_deg_per_hour?, approx_disc_crossing_hours?,   # geometric RISE/SET only
  countdown?: { earliest_minutes, latest_minutes, may_have_occurred },   # next_* only
  earlier_events_excluded?            # RISE/SET in next_* only
}
EventSample { t, state: VISIBLE | NOT_VISIBLE | UNKNOWN, elevation_deg?, horizon_deg?,
              not_visible_reason?: BELOW_GEOMETRIC_HORIZON | TERRAIN_OCCULTED,
              unknown_reason?: MISSING_EPHEMERIS | TERRAIN_COVERAGE_INCOMPLETE | TERRAIN_DATA_UNAVAILABLE }
```

There is deliberately no single "event time" field anywhere in the contract (guarded by a test).

## 4. Event semantics

1. **Three-valued states.** `VISIBLE`, `NOT_VISIBLE`, `UNKNOWN`. `UNKNOWN` is never coerced.
2. **Brackets, not timestamps.** An event lies in `(bracket_start_utc, bracket_end_utc]` between
   two stored samples. `bracket_minutes` is the timing uncertainty and equals the real spacing of
   those two samples (not the nominal step).
3. **Confirmed means adjacent.** `RISE` / `SET` exist only between two *adjacent known* samples.
   They prove a net change inside the bracket, not exactly one crossing.
4. **Nothing is confirmed across UNKNOWN.** `VISIBLE → UNKNOWN … → NOT_VISIBLE` yields
   `BECOMES_UNKNOWN` then `RESOLVES_TO_NOT_VISIBLE` with `differs_from_last_known = true` and the
   last known sample attached. It is never reported as a set. `VISIBLE → UNKNOWN … → VISIBLE`
   yields `differs_from_last_known = false`.
5. **Confirmed event after an UNKNOWN run.** Still reported in `next_confirmed_event`, with
   `earlier_events_excluded = false` and track status `UNKNOWN_AHEAD`.
6. **Countdown is a range.** `earliest_minutes … latest_minutes` from the reference. If the
   reference is inside the bracket, `earliest = 0` and `may_have_occurred = true`. On the bracket
   start exactly, the event is still strictly ahead.
7. **No fabrication.** `NO_EVENT_IN_WINDOW` means no state change at any sampled epoch after the
   reference; `no_change_through_utc` is the last stored sample, not "forever".
   `UNKNOWN_AT_REFERENCE` gives no countdown. A track that is entirely `UNKNOWN` (or has fewer
   than two samples) is `INSUFFICIENT_DATA`.
8. **Geometric vs terrain.** A GEOMETRIC analysis gets a geometric track only; its not-visible
   state is `BELOW_GEOMETRIC_HORIZON` and is never called terrain-blocked (conceptually aligned
   with audit finding H3). A TERRAIN analysis gets both tracks, labelled; terrain not-visible is
   `TERRAIN_OCCULTED`.
9. **Disc centre.** Geometric events are disc-centre crossings of the 0° sphere.
   `approx_disc_crossing_hours = 2ρ / |mean elevation rate across the bracket|`, rounded to whole
   hours, with nominal ρ = 0.2666° (Sun) and 0.95° (Earth). It is an indication that the event is
   gradual; it does not change any state.
10. **Inclusive STOP sample.** Kept as an observation, so a change in the last bracket is found.

## 5. Deviations from the design document (§4)

| Design §4 | Implemented | Reason |
|---|---|---|
| §4.3‑5: `VISIBLE → UNKNOWN → BLOCKED` reported as "set occurred within […]" | **Not reported as a set.** Reported as `RESOLVES_TO_NOT_VISIBLE` + `differs_from_last_known` | Integration safety requirement: never infer a confirmed rise/set across UNKNOWN |
| §4.3‑3: optional linear-interpolated estimate | Not implemented | The bracket is the contract; no precision beyond the samples |
| §4.3‑4: optional live 1‑minute Horizons refinement | Not implemented | Would add a new external call path; deferred |
| §4.2 / §4.3‑7: limb events ("first light", "full disc") | Replaced by `approx_disc_crossing_hours` (indication only) | Limb times need interpolation or quantity 20 (§4.6) |
| §4.4: per-event `uncertainty_minutes` including DEM term | `bracket_minutes` only; the DEM / azimuth-bin term is stated in `limitations`, not quantified | Unverified (audit M2); engine not modified here |
| §4.5: `body`, `horizon`, `after`, `refine` query parameters | One call returns both bodies and all available horizon types; `reference_utc` replaces `after` | Fewer round trips; identical information |
| §4.5 kinds `clears_known_terrain` / `enters_unknown` | Single `BECOMES_UNKNOWN` (from-state and reason are in the samples) | Same meaning, one kind |

## 6. Tests

`backend/tests/test_phase7a_events.py` (30). Synthetic series are labelled as synthetic in the
file; the two Shackleton fixtures are real JPL Horizons responses.

| Requirement | Tests |
|---|---|
| Confirmed visible → blocked | `test_confirmed_visible_to_not_visible_is_a_bracketed_set` |
| Confirmed blocked → visible | `test_confirmed_not_visible_to_visible_is_a_bracketed_rise` |
| No transition in interval | `test_no_transition_reports_no_event_in_window_not_a_fabricated_one` |
| UNKNOWN between two valid states | `test_unknown_between_two_different_known_states_is_never_a_rise_or_set`, `test_unknown_between_equal_known_states_confirms_nothing`, `test_confirmed_event_after_unknown_gap_cannot_exclude_earlier_events` |
| Entire interval UNKNOWN | `test_entire_interval_unknown_is_insufficient_data`, `test_unknown_at_reference_gives_no_countdown` |
| Interval boundaries | `test_reference_exactly_on_a_sample_and_inside_a_bracket`, `test_event_in_the_last_bracket_and_reference_on_the_last_sample`, `test_event_in_the_first_bracket`, `test_reference_outside_the_sampled_span_is_rejected` |
| Different time resolutions | `test_brackets_are_nested_across_time_resolutions_and_contain_the_true_crossing` (10 / 60 / 360 min), `test_irregular_sample_spacing_uses_real_timestamps_not_the_nominal_step` |
| Geometric vs terrain | `test_geometric_analysis_has_no_terrain_track_and_never_says_terrain_blocked`, `test_terrain_analysis_reports_both_tracks_with_separate_classification`, `test_terrain_unknown_reason_distinguishes_missing_dem`, `test_events_endpoint_with_real_lola_terrain` |
| No false exact timestamp | `test_contract_has_no_single_event_timestamp_field` |
| No event fabrication | `test_no_event_fabrication_on_random_series` (300 seeded random series), `test_events_endpoint_on_real_horizons_fixtures_reports_no_event` |
| Reference modes / API errors | `test_reference_mode_never_labels_window_start_as_now`, `test_events_endpoint_brackets_and_reference_parameter`, `test_events_endpoint_unknown_analysis_is_404`, `test_events_route_is_advertised_in_openapi` |

Frontend (9): span formatting, live range countdown and "may already have happened", state
labels (geometric never "terrain"), reference validity, EN/TR key parity, geometric view,
terrain + UNKNOWN view, live tick with a stable `aria-live` region, Turkish rendering.

## 7. Behaviour on real data (isolated instance)

Isolated backend on port 8017 (worktree code, **copy** of the SQLite DB in a temp folder) and
Vite on port 5197. The working databases of other worktrees were not opened for writing.

Stored real analysis `2e8ded6e` (JPL Horizons, 28 d, 60 min, GEOMETRIC), reference = window start:

| Site | Body | Status | Next confirmed event (bracket, UTC) | ≈ disc crossing |
|---|---|---|---|---|
| Shackleton Rim A | Sun | `NO_EVENT_IN_WINDOW` (visible through 29 Dec 00:00) | — | — |
| Shackleton Rim A | Earth | `EVENT_CONFIRMED` | RISE, 14 Dec 23:00 – 15 Dec 00:00 | 33 h |
| Malapert | Sun | `EVENT_CONFIRMED` | SET, 3 Dec 08:00 – 09:00 | 16 h |
| Malapert | Earth | `EVENT_CONFIRMED` | SET, 2 Dec 16:00 – 17:00 | 37 h |

These match the design document's own measurements (no Sun transition at Point A in the window;
disc crossings of roughly 16 h for the Sun and 30–39 h for Earth).

New real TERRAIN analysis `4b949d29` (live JPL Horizons + local LOLA, Points A/B,
2026‑11‑13 → 2026‑11‑18, 60 min, `LOCAL_TERRAIN_PARTIAL`), reference = now:

| Site | Body | Geometric | Terrain |
|---|---|---|---|
| A | Sun | `NO_EVENT_IN_WINDOW` (visible) | `INSUFFICIENT_DATA` — 121 of 121 samples UNKNOWN |
| A | Earth | `EVENT_CONFIRMED`: RISE 17 Nov 21:00 – 22:00 | `NO_EVENT_IN_WINDOW` (behind terrain) |
| B | Sun | `NO_EVENT_IN_WINDOW` (visible) | `INSUFFICIENT_DATA` — 121 of 121 samples UNKNOWN |
| B | Earth | `EVENT_CONFIRMED`: RISE 17 Nov 23:00 – 18 Nov 00:00 | `NO_EVENT_IN_WINDOW` (behind terrain) |

The terrain Sun track is entirely UNKNOWN in this window, so no terrain sunrise or sunset is
offered. The geometric Earth rise is not echoed on the terrain track.

## 8. UI verification (real browser, isolated session)

- `/simulator`, TERRAIN analysis, EN, desktop: panel renders below the simulator grid; Sun and
  Earth columns; geometric and terrain tracks side by side; live mode active ("Reference: current
  time"); "in 2 d 14 h to 2 d 15 h"; "121 of 121 samples are unknown". No console errors.
  Screenshot `docs/screenshots/phase7a/01-simulator-terrain-live-en.jpg`.
- Switching to "Selected time" refetches with `reference_utc=<selected sample>` (network log) and
  shows "Durations are measured from the reference time, not from now."
- `/windows`, GEOMETRIC analysis, TR, 375 px: no horizontal overflow (document width 375, 0
  overflowing elements), 36 px toggle targets, "Live" disabled with an explanatory hint because
  the current time is outside the window. Screenshot `02-windows-geometric-mobile-tr.jpg`.
- Accessibility: reference toggle is a `radiogroup`; each track is a labelled `section`; one
  polite `role="status"` line per track that contains the state and bracket but not the ticking
  countdown; details/summary for the full change list and notes.
- If the backend does not advertise the route in `/openapi.json`, the panel says so instead of
  failing (same capability pattern as the rest of the app).

## 9. Integration dependencies and blockers

| Item | Relation to 7A |
|---|---|
| **H1** — TERRAIN metrics and window lists (`visibility.summarize`, `analysis_service` darkness / gap windows) | **Not used by 7A.** Events come from `/epochs`, whose per-body states are independent. Known integration blocker for the *page*, though: on `WindowsPage` the events panel sits above the existing interval lists, and for TERRAIN analyses those lists can contradict the panel until H1 lands. Not bypassed, not patched here. |
| **H1 follow-up** | If the H1 fix changes `TERRAIN_ALGORITHM_VERSION` or `/epochs` state semantics, re-run `test_phase7a_events.py`; the events code needs no change as long as the `/epochs` contract (`sun_state`, `sun_geometric_state`, …) is kept. |
| **H2** — weights missing from the analysis cache key | No effect on events (no scores used). Listed because 7C will depend on it. |
| **H3** — geometric BLOCKED shown as "Terrain-blocked" in `adapter.ts` | 7A maps this server-side (`BELOW_GEOMETRIC_HORIZON`) and does not touch `adapter.ts`. Until H3 lands, the lanes on the same page may still say "Terrain-blocked" for a geometric analysis while the events panel says "Below horizon". |
| **H4** — active-analysis mismatch between pages | The panel follows the workspace analysis (`result.id`), like Simulator and Windows. It inherits whatever H4 fixes. |
| **M2** — 5° azimuth bins, nearest-bin terrain horizon | Unverified audit finding. Terrain event brackets can be created or shifted by bin boundaries. Stated in `limitations`; engine untouched. |
| **M1** — terrain beyond the local DEM range is not modelled | Stated in `limitations`. |
| Merge surface | Existing files touched: `backend/app/api/v1/__init__.py`, `frontend/src/i18n/locales/{en,tr}.ts`, `SimulatorPage.tsx`, `WindowsPage.tsx`. All are small additive edits; conflicts with the H1–H4 branches should be limited to import blocks. |
| Environment | None new. No new Python or npm dependency, no migration, no new environment variable. |

## 10. Known limitations

- Timing resolution is the analysis step (10–1440 min). There is no refinement.
- No limb events; the disc-crossing figure is a first-order indication with nominal radii.
- Terrain events inherit every limitation of the Phase 4.1 terrain engine (local 12 km range,
  5° bins, `UNKNOWN` where the DEM cannot decide).
- `/events` recomputes the `/epochs` payload on each call; with the largest allowed analysis
  (10 sites × 4321 samples) this is the same cost as `/epochs` itself. No caching was added.
- API `limitations` text is English only; the panel's own explanations are TR/EN.
- Dates in the panel use the app's existing `formatUtc` (English month names in both languages).

## 11. Not done (by instruction)

No merge, no push, no Phase 7B/7C work, no change to H1/H2 code, no edit in any other worktree.
The session's `.claude/launch.json` in the main checkout was extended temporarily for the isolated
preview and restored to its committed state afterwards.
