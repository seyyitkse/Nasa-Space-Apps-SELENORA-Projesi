# SELENORA — Project Brief

> Note: the separate "SELENORA Project Master Brief" referenced in the
> development prompt was **not present in the workspace** when Phase 1 was
> built. This brief is reconstructed from the Master Development Prompt v3.0.
> If the Master Brief exists, add it here and reconcile any differences
> (scientific accuracy and the official challenge text take precedence).

## Identity

- **Name:** SELENORA — AI-Assisted Lunar Landing Site Decision Support Platform
- **Competition:** NASA Space Apps Challenge 2026 — *Lunar Landing Site Navigator*
  (https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)
- **Slogan:** Explore the Moon. Understand the Evidence. Plan with Confidence.
- **Principle:** Scientific computation drives the results. AI explains the evidence.

## Problem

For candidate sites near the lunar south pole, users must be able to answer:

1. When is the Sun visible, and how does its elevation change?
2. What is the longest darkness interval?
3. When is the Earth visible (direct-to-Earth geometry)?
4. When are both visible?
5. How do two (up to ten) candidate sites differ, and how does that change with dates?
6. How does local terrain change visibility? (Phase 4)
7. Why does a site score higher, and what happens when mission priorities change?

## Non-goals / guardrails

- Not a certified landing-safety or flight-operations system.
- The AI never computes, changes or invents scientific values or rankings.
- No synthetic or missing data is ever presented as real (`SYNTHETIC_DEMO`, `PARTIAL`, `UNAVAILABLE` labels).
- No implied NASA/JPL/DeepSeek endorsement.

## Phases

1. **Premium Foundation** — UI, API skeleton, health, data sources, client skeletons, tests, docs. *(this delivery)*
2. **Scientific MVP** — JPL Horizons pipeline, visibility analysis, deterministic ranking, charts on real data.
3. **AI & Advanced Intelligence** — DeepSeek briefings, structured JSON, explainable ranking, scenario simulator.
4. **Advanced Science & Polish** — LOLA terrain horizon, performance, extended tests, optional 3D.
