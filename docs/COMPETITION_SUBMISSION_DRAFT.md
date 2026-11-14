# SELENORA — Competition Submission Draft (prep)

**Deadline:** 15 November 2026, 23:59 local  
**Safe demo baseline:** Geometric MVP + DeepSeek · tags `phase3.3-scientific-duration-fix`, `phase4.1-terrain-science-validation`  
**Status:** Draft fields for spaceappschallenge.org — fill final URLs/screenshots at upload time.

---

## Project title

SELENORA — AI-Assisted Lunar Landing Site Decision Support

## Tagline

Explore the Moon. Understand the Evidence. Plan with Confidence.

## One-paragraph summary

SELENORA helps mission planners compare south-polar lunar sites using live NASA/JPL Horizons ephemerides, a deterministic visibility/scoring engine, optional LOLA terrain horizons with scientific guardrails (true-north, VISIBLE/BLOCKED/UNKNOWN, partial coverage labels), and a DeepSeek explanation layer that never invents numbers. A React Mission Control UI surfaces science transparency for jury review.

## Challenge / theme alignment

NASA Space Apps — lunar exploration / Artemis-relevant site awareness using open NASA data.

## Data sources (cite on submission)

- NASA/JPL Horizons (Sun & Earth observer Az/El)
- NASA PGDA LOLA Site01/Site04 5 m DEMs (Barker et al., 2021; product 78)
- Optional viz: PGDA Product 90 south-polar grids (not auto-scored)
- Artemis III candidate region documentation (labels/links)
- DeepSeek API (explanation only)

## What works today (demo script)

1. Health + seeded south-polar reference sites  
2. Mission Planner → **GEOMETRIC** analysis (Points A & B)  
3. Site Comparison metrics, timelines, science transparency  
4. AI Mission Analyst explain (EN/TR) with ranking/number guards  
5. Optional: TERRAIN mode → expect `LOCAL_TERRAIN_PARTIAL`, no forced winner  
6. Optional Explorer: LOLA coverage / map preview APIs (Phase 5B)

## What we do **not** claim

- NASA-endorsed landing certification  
- Complete Moon-wide terrain visibility from local 5 m tiles  
- Fabricated Artemis III polygons  
- Link budget / DSN scheduling from Earth elevation  

## Links (fill before submit)

- GitHub repo: _TBD_  
- Demo video: _TBD_  
- Live deploy: _TBD_  
- Project page: _TBD_

## Team / credits

_TBD_

## Demo video outline (≤3 min)

1. Problem (south-pole light + Earth visibility trade)  
2. Live Horizons geometric run  
3. Science transparency panel  
4. DeepSeek briefing (show it cannot change scores)  
5. Optional terrain partial-coverage honesty  
6. Closing tagline  

---

Keep this file updated as deploy URLs land; do not overwrite Phase 3.3/4.1 tags.
