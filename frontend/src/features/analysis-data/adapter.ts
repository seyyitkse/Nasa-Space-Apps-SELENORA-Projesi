/**
 * Explicit data adapter between the analysis API and Phase 5A visualisations.
 *
 * Rules (scientific honesty):
 * - Only sampled epochs returned by the API are used. No interpolation.
 * - GEOMETRIC state is the backend rule: visible ⇔ elevation > 0° (strict); null → UNKNOWN.
 * - TERRAIN state is derived from the backend's terrain windows, which contain
 *   only *known* non-visible samples (UNKNOWN samples are excluded server-side):
 *     inside a darkness/gap window → BLOCKED (geometric visible) or BELOW_HORIZON;
 *     outside → VISIBLE only if the site has zero unknown samples and the window
 *     list is complete; otherwise UNRESOLVED (visible *or* unknown — the API does
 *     not expose per-sample terrain state).
 */
import type { AnalysisResult, Interval, SiteResult, TimelinePoint } from '@/types/api'

export type BodyState = 'VISIBLE' | 'BELOW_HORIZON' | 'BLOCKED' | 'UNKNOWN' | 'UNRESOLVED'
export type Body = 'sun' | 'earth'

/** Backend MAX_WINDOWS — a list this long may be truncated. */
export const MAX_WINDOWS = 50

export interface EpochState {
  t: number
  iso: string
  sunElevation: number | null
  earthElevation: number | null
  sun: BodyState
  earth: BodyState
  /** Geometric (0°) state regardless of analysis mode. */
  sunGeometric: BodyState
  earthGeometric: BodyState
  joint: 'VISIBLE' | 'NOT_VISIBLE' | 'UNKNOWN'
}

export function geometricState(elevation: number | null | undefined): BodyState {
  if (elevation === null || elevation === undefined || Number.isNaN(elevation)) return 'UNKNOWN'
  return elevation > 0 ? 'VISIBLE' : 'BELOW_HORIZON'
}

interface ParsedWindow {
  start: number
  end: number
}

function parseWindows(ws: Interval[]): ParsedWindow[] {
  return ws.map((w) => ({ start: Date.parse(w.start_utc), end: Date.parse(w.end_utc) }))
}

/** Half-open membership [start, end). */
export function inWindows(t: number, ws: ParsedWindow[]): boolean {
  for (const w of ws) if (t >= w.start && t < w.end) return true
  return false
}

export function isTerrainAnalysis(result: Pick<AnalysisResult, 'horizon_model'>): boolean {
  return result.horizon_model === 'TERRAIN'
}

/** Can samples outside the terrain windows be declared VISIBLE? */
export function terrainCleanVisible(site: SiteResult, body: Body): boolean {
  const unknown = body === 'sun' ? site.terrain?.sun_unknown_fraction : site.terrain?.earth_unknown_fraction
  const windows = body === 'sun' ? site.darkness_windows : site.communication_gaps
  return unknown === 0 && windows.length < MAX_WINDOWS
}

export function terrainState(
  t: number,
  geometric: BodyState,
  windows: ParsedWindow[],
  cleanVisible: boolean,
): BodyState {
  if (geometric === 'UNKNOWN') return 'UNKNOWN'
  if (inWindows(t, windows)) return geometric === 'VISIBLE' ? 'BLOCKED' : 'BELOW_HORIZON'
  // Outside known-dark windows the backend classified the sample VISIBLE or UNKNOWN.
  // Note: a body slightly below 0° can still clear a *negative* terrain horizon
  // (e.g. from a ridge), so geometric BELOW_HORIZON does not imply "not visible" here.
  return cleanVisible ? 'VISIBLE' : 'UNRESOLVED'
}

function jointOf(a: BodyState, b: BodyState): EpochState['joint'] {
  if (a === 'VISIBLE' && b === 'VISIBLE') return 'VISIBLE'
  const known = (s: BodyState) => s === 'VISIBLE' || s === 'BELOW_HORIZON' || s === 'BLOCKED'
  if ((known(a) && a !== 'VISIBLE') || (known(b) && b !== 'VISIBLE')) return 'NOT_VISIBLE'
  return 'UNKNOWN'
}

export function buildEpochs(
  result: Pick<AnalysisResult, 'horizon_model'> & Partial<Pick<AnalysisResult, 'end_utc'>>,
  site: SiteResult,
  points: TimelinePoint[],
): EpochState[] {
  // The backend holds each sample until the next one, clamped to [start, end):
  // a sample at/after end_utc carries zero duration and is never part of any
  // window, so classifying it would be meaningless (and could look VISIBLE).
  const endMs = result.end_utc ? Date.parse(result.end_utc) : Infinity
  const inWindow = points.filter((p) => Date.parse(p.t) < endMs)
  const terrain = isTerrainAnalysis(result)
  const dark = parseWindows(site.darkness_windows)
  const gaps = parseWindows(site.communication_gaps)
  const sunClean = terrain ? terrainCleanVisible(site, 'sun') : true
  const earthClean = terrain ? terrainCleanVisible(site, 'earth') : true
  return inWindow.map((p) => {
    const t = Date.parse(p.t)
    const sunGeometric = geometricState(p.sun_elevation_deg)
    const earthGeometric = geometricState(p.earth_elevation_deg)
    const sun = terrain ? terrainState(t, sunGeometric, dark, sunClean) : sunGeometric
    const earth = terrain ? terrainState(t, earthGeometric, gaps, earthClean) : earthGeometric
    return {
      t,
      iso: p.t,
      sunElevation: p.sun_elevation_deg,
      earthElevation: p.earth_elevation_deg,
      sun,
      earth,
      sunGeometric,
      earthGeometric,
      joint: jointOf(sun, earth),
    }
  })
}

/** Index of the sample at or before `t` (cursor never lands between samples). */
export function nearestSampleIndex(epochs: { t: number }[], t: number): number {
  if (epochs.length === 0) return -1
  let lo = 0
  let hi = epochs.length - 1
  if (t <= epochs[0]!.t) return 0
  if (t >= epochs[hi]!.t) return hi
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (epochs[mid]!.t <= t) lo = mid
    else hi = mid
  }
  // choose the closer of lo / hi
  return t - epochs[lo]!.t <= epochs[hi]!.t - t ? lo : hi
}

/** Recommendation availability, mirroring backend refusal rules. */
export type RecommendationStatus =
  | { kind: 'recommended'; label: string }
  | { kind: 'tie' }
  | { kind: 'refused'; reason: 'partial_terrain' | 'partial' | 'unavailable' | 'unscored' }

export function recommendationStatus(result: AnalysisResult): RecommendationStatus {
  if (result.recommended_site_label) return { kind: 'recommended', label: result.recommended_site_label }
  if (result.data_quality === 'LOCAL_TERRAIN_PARTIAL') return { kind: 'refused', reason: 'partial_terrain' }
  if (result.data_quality === 'PARTIAL') return { kind: 'refused', reason: 'partial' }
  if (result.data_quality === 'UNAVAILABLE') return { kind: 'refused', reason: 'unavailable' }
  const scores = result.sites.map((s) => s.score)
  if (scores.some((s) => s === null)) return { kind: 'refused', reason: 'unscored' }
  return { kind: 'tie' }
}

/** Client-side ranking is allowed only where the backend itself produced scores. */
export function canRescore(result: AnalysisResult): boolean {
  return result.sites.length > 0 && result.sites.every((s) => s.score !== null) && recommendationStatus(result).kind !== 'refused'
}
