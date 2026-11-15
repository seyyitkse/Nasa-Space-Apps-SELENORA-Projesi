# SELENORA — Global Jury Demo (7 slides)

NASA Space Apps Challenge 2026 · Lunar Landing Site Navigator · Team SELENORA
(Ahmet Seyyit KÖSE — Team Leader · Nursena ÇAMKÖMÜRÜ — Team Member)

| File | Purpose |
|---|---|
| [`SELENORA_Global_Jury_Demo_7_Slides.pdf`](SELENORA_Global_Jury_Demo_7_Slides.pdf) | Public jury PDF (7 pages, 16:9) |
| [`SELENORA_Global_Jury_Demo_7_Slides.pptx`](SELENORA_Global_Jury_Demo_7_Slides.pptx) | Editable PowerPoint (7 slides, native text and shapes) |
| [`SELENORA_Global_Jury_Demo_contact_sheet.jpg`](SELENORA_Global_Jury_Demo_contact_sheet.jpg) | All 7 slides on one sheet |
| [`build_deck.js`](build_deck.js) | PptxGenJS generator (reproducible) |
| [`assets/`](assets/) | Screenshot crops, original logo mark, QR code, backgrounds |
| [`assets/evidence/`](assets/evidence/) | Raw SELENORA API results behind every number on the slides |

## Where each screenshot comes from

Live captures were taken on 2026-11-15 from the running app (code identical to `origin/main` `af01c91`):
FastAPI on a **temporary SQLite database** and Vite, headless Microsoft Edge at 1920×1080 with 2× device scale, EN UI, Scientist mode, en-US browser locale. Production data was not touched.

| Slide | Asset | Source |
|---|---|---|
| 1 | `s1-cover-3d-moon-missions.jpg` | Live · 3D Moon, High NASA SVS 14959 topographic model, Lunar Missions layer ON |
| 2 | `s2-horizon-simulator-terrain.jpg` | Live · Horizon Simulator, TERRAIN analysis, Shackleton Rim — Point A, 01 Jan 2027 00:00 UTC |
| 3 | `s3-lunar-explorer-lola-5m.jpg` | Live · Lunar Explorer, LOLA 5 m tile footprints on the LROC WAC mosaic |
| 3 | `s3-phase7d-provenance-pgda90.jpg` | Repository · `docs/assets/readme/13-phase7d-provenance.png` (verified Phase 7D capture) |
| 4 | `s4-site-comparison-ranking.jpg`, `s4-relative-solar-potential.jpg` | Live · Site Comparison, GEOMETRIC, 01–15 Jan 2027 UTC, 60 min |
| 5 | `s5-date-scenarios-dec-jan.jpg` | Live · Date Scenarios, Dec 2026 vs Jan 2027 |
| 5 | `s5-mission-windows-heatmap.jpg` | Live · Mission Windows, Jan 2027 window, Point A |
| 6 | `s6-3d-moon-south-pole-missions.jpg`, `s6-apollo11-detail.jpg` | Live · 3D Moon south-pole view and the Apollo 11 detail |
| 6 | `s6-global-vs-local-resolution.jpg` | Repository · `docs/assets/readme/12-phase7d-remote-dem.png` |
| 7 | QR / logo | QR generated for the repository URL (decode-verified); logo is the original `LogoMark` SVG from `frontend/src/components/layout/Logo.tsx` |

## Scientific verification notes

- **Date Scenarios** (`evidence/date-scenarios-dec2026-jan2027.json`): Earth visibility 0.0% → 27.679%, longest Earth gap 336 h → 243 h, score 40.00 → 56.608. This is the same result as the verified README capture (`3c0a9b92…`).
- **Site Comparison** (`evidence/site-comparison-geometric-jan2027.json`): Point A 56.608 (#1), Bussey 2010 Point D 55.179 (#2), Malapert Massif 25.358 (#3). GEOMETRIC horizon, so terrain shadowing is not modelled in this run.
- **Relative Solar Potential** (`evidence/solar-potential-jan2027.json`): this is a dimensionless sunlight index (contract 7b.1), not watts or kWh. With a fixed panel, A and D overlap, so they are not ranked.
- **Horizon Simulator** (`evidence/horizon-terrain-jan2027.json`): `LOCAL_TERRAIN_PARTIAL` using LOLA Site04 5 m. The Sun is +1.128° above the geometric horizon, but the terrain horizon is 8.69°, so the Sun is TERRAIN-BLOCKED. Because the evidence is incomplete, the engine refuses to rank.
- **Mission Windows** (`evidence/mission-events-jan2027.json`): Earth rises between 2027-01-11 02:00 and 03:00 UTC. The engine reports this 60-min bracket and does not interpolate an exact time.
- Remote PGDA Product 90 is described as 3D visualization only. The deck does not claim global validated terrain-horizon analysis.
- Test gates are quoted from `docs/SELENORA_SUBMISSION_INTEGRATION_REPORT.md`: backend 292 passed / 1 skipped, frontend 219 passed, plus TypeScript, lint and build passing.

SELENORA is not affiliated with or endorsed by NASA. NASA data and imagery are credited to their sources.
