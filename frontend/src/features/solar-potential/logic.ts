/**
 * Presentation logic for the relative solar potential. No science happens here:
 * the backend computes every bound. This only formats them and never collapses
 * a range into a single number.
 */
import type { HorizonType, IndexEstimate, PanelResult, SiteComparison, SolarParams, SolarPotentialResponse } from './types'

/** Above this unknown share the wording says "mostly unknown". Wording only — never a calculation. */
export const HIGH_UNKNOWN_FRACTION = 0.1

export type IndexDisplay =
  | { kind: 'value'; value: number }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'unavailable'; reason: string }

/** What may honestly be shown for one estimate. A range stays a range. */
export function indexDisplay(estimate: IndexEstimate | null): IndexDisplay {
  if (!estimate || estimate.status === 'UNAVAILABLE' || estimate.index_min_pct === null || estimate.index_max_pct === null)
    return { kind: 'unavailable', reason: estimate?.unavailable_reason ?? 'NOT_COMPUTED' }
  if (estimate.status === 'DETERMINED' && estimate.index_pct !== null) return { kind: 'value', value: estimate.index_pct }
  return { kind: 'range', min: estimate.index_min_pct, max: estimate.index_max_pct }
}

/** Small indexes (horizontal panels at the pole are ~2 %) keep two decimals. */
export function formatIndexPct(value: number): string {
  const digits = value !== 0 && Math.abs(value) < 10 ? 2 : 1
  return `${value.toFixed(digits)}%`
}

export function formatIndex(display: IndexDisplay): string {
  if (display.kind === 'value') return formatIndexPct(display.value)
  if (display.kind === 'range') return `${formatIndexPct(display.min)} – ${formatIndexPct(display.max)}`
  return '—'
}

export function estimateFor(config: PanelResult, horizon: HorizonType): IndexEstimate | null {
  return horizon === 'TERRAIN' ? config.terrain : config.geometric
}

export function comparisonFor(data: SolarPotentialResponse, panel: PanelResult['panel'], horizon: HorizonType): SiteComparison | undefined {
  return data.comparisons.find((c) => c.panel === panel && c.horizon === horizon)
}

/** Bar geometry on a fixed 0–100 % scale: proven part, then the part the data cannot exclude. */
export function barSegments(display: IndexDisplay): { known: number; possible: number } {
  const clamp = (v: number) => Math.min(100, Math.max(0, v))
  if (display.kind === 'value') return { known: clamp(display.value), possible: 0 }
  if (display.kind === 'range') return { known: clamp(display.min), possible: clamp(display.max) - clamp(display.min) }
  return { known: 0, possible: 0 }
}

export interface ParamDraft {
  azimuth: string
  tilt: string
  trackingTilt: string
}

export type ParamField = keyof ParamDraft
export type ParamError = 'azimuthRange' | 'tiltRange'

/** Strict decimal number: no empty string, no exponent tricks, no trailing text. */
function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/**
 * Validate the panel inputs before anything is requested. An empty azimuth means
 * "let the backend choose"; an empty tilt means the default (vertical, 90°).
 */
export function parseParams(draft: ParamDraft): { params: SolarParams; errors: Partial<Record<ParamField, ParamError>> } {
  const params: SolarParams = {}
  const errors: Partial<Record<ParamField, ParamError>> = {}
  if (draft.azimuth.trim() !== '') {
    const az = parseNumber(draft.azimuth)
    if (az === null || az < 0 || az >= 360) errors.azimuth = 'azimuthRange'
    else params.azimuthDeg = az
  }
  if (draft.tilt.trim() !== '') {
    const tilt = parseNumber(draft.tilt)
    if (tilt === null || tilt < 0 || tilt > 90) errors.tilt = 'tiltRange'
    else params.tiltDeg = tilt
  }
  if (draft.trackingTilt.trim() !== '') {
    const tilt = parseNumber(draft.trackingTilt)
    if (tilt === null || tilt < 0 || tilt > 90) errors.trackingTilt = 'tiltRange'
    else params.trackingTiltDeg = tilt
  }
  return { params, errors }
}

export function sameParams(a: SolarParams, b: SolarParams): boolean {
  return a.azimuthDeg === b.azimuthDeg && a.tiltDeg === b.tiltDeg && a.trackingTiltDeg === b.trackingTiltDeg
}

/** Compass point for an azimuth clockwise from true north (N = 0°, E = 90°). */
export function compassKey(azimuthDeg: number): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
  return points[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8] ?? 'N'
}
