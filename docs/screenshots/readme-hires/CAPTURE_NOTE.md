# README screenshot recapture (high resolution)

Ten README images were replaced after an audit found them unreadable at GitHub's display width (~830 px), or missing the content their captions describe.

| Image | Audit finding | Replacement |
|---|---|---|
| 01 Mission Control | 1920 px view shrunk to 1024 px; text ~6 px on GitHub | Hero card, 2× |
| 03 Lunar Explorer | Map/layer labels unreadable | Map + basemap panel, 2× |
| 04 Horizon Simulator | Byte-identical to the old blurry capture | "3D terrain & Sun direction" card, 2× |
| 04b Scientific close-up | 2× enlargement of the old 1024 px panel | HEIGHT / Sun / provenance panel cropped from native 2× pixels |
| 05 Mission Planner | Text unreadable; Turkish-locale dates | Full planner, en-US |
| 06 Site Comparison | Per-metric values unreadable | Scores, metrics, coverage, 2× |
| 07 Mission Windows | Grid and legend unreadable | Controls + full December grid, 2× |
| 08 Date Scenarios | January 2027 card not visible | Both scenario cards |
| 09 Relative Solar Potential | No solar values shown (settings only); JPEG | All four panel geometries, PNG |
| 11 Apollo 11 detail | Detail panel not visible | Globe + mission list + detail panel |

`02`, `10`, `12` and `13` passed and are unchanged.

## Capture method

- Running SELENORA app: FastAPI on a temporary SQLite database (production data untouched) and Vite.
- Headless Microsoft Edge, 1280×800 CSS viewport, device scale 2, en-US locale, UTC timezone, English UI, Scientist mode, sidebar collapsed.
- Each image is cropped from the 2× pixels around exact element bounds. No upscaling, retouching or edited values.

## Real analyses behind the images

- `site-comparison-dec2026.json`: South Pole Reconnaissance, Shackleton Rim — Point A vs Malapert Massif (approx.), 2026-12-01 → 2026-12-29 UTC, 60 min, GEOMETRIC, weights 40/40/20. This reproduces the original README result: 65.803 vs 62.292. Used by 05, 06, 07 and 09.
- `horizon-terrain-jan2027.json`: TERRAIN, 2027-01-01 → 2027-01-15 UTC, Point B on LOLA Site01. Used by 04 and 04b. The panel's site elevation (1796.6 m) and γ (218.2°) match `surface_z_m` and `true_north_grid_azimuth_deg` in this record.
- `date-scenarios-dec2026-jan2027.json`: Shackleton Rim — Point A, Dec 2026 vs Jan 2027. Earth visibility 0.0% → 27.679%, score 40.00 → 56.608. Used by 08.

`BEFORE_AFTER_github_size.jpg` compares old and new images at GitHub display width.

Known app UI issue (not a capture artifact): the Sun-status side panel is a fixed 260 px wide, so the long badge "TERRAIN-BLOCKED · SERVER, THIS MOMENT" is clipped at its right edge.
