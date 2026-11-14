# Test fixtures

| File | Content | Origin |
|---|---|---|
| `horizons_sun_shackleton_a_2026-12-01.json` | Sun az/el, observer 89.68°S 166.0°W (194.0°E), 2026-12-01 00:00 → 12-02 00:00 UT, 6 h step | **Real** JPL Horizons API response (v1.2, DE441), captured 2026-11-14 |
| `horizons_earth_shackleton_a_2026-12-01.json` | Earth az/el, same observer/time span | **Real** JPL Horizons API response (v1.2, DE441), captured 2026-11-14 |

`FIXTURE_RESULT` inside `test_integrations.py` is a hand-written table with
illustrative values used only to test parser edge cases — it is not real data.

Regenerate with `pytest -m live` plus the snippet in `docs/TEST_RESULTS.md`.
