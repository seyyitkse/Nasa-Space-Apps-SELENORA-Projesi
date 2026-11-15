/**
 * Presentation logic for operational events. No science happens here: the
 * backend decides states and brackets; this only turns brackets into honest
 * ranges and never produces a single event time.
 */
import type { EventSample, VisibilityEvent } from './types'

export interface SpanParts {
  days: number
  hours: number
  minutes: number
}

/** Whole-minute parts of a non-negative duration (source resolution is minutes). */
export function spanParts(totalMinutes: number): SpanParts {
  const m = Math.max(0, Math.round(totalMinutes))
  return { days: Math.floor(m / 1440), hours: Math.floor((m % 1440) / 60), minutes: m % 60 }
}

export interface SpanUnits {
  d: string
  h: string
  min: string
}

/**
 * "2 d 3 h", "5 h 20 min", "40 min". Minutes are dropped beyond two days so a
 * coarse bracket is not dressed up with fine digits.
 */
export function formatSpan(totalMinutes: number, units: SpanUnits): string {
  const { days, hours, minutes } = spanParts(totalMinutes)
  if (days >= 2) return hours > 0 ? `${days} ${units.d} ${hours} ${units.h}` : `${days} ${units.d}`
  const h = days * 24 + hours
  if (h > 0) return minutes > 0 ? `${h} ${units.h} ${minutes} ${units.min}` : `${h} ${units.h}`
  return `${minutes} ${units.min}`
}

export interface CountdownRange {
  earliestMinutes: number
  latestMinutes: number
  /** The clock is inside the bracket: the event may already be in the past. */
  mayHaveOccurred: boolean
  /** The clock is past the bracket end: this event is no longer "next". */
  passed: boolean
}

/** Countdown to a bracket from an arbitrary clock (used for the live mode tick). */
export function countdownAt(event: Pick<VisibilityEvent, 'bracket_start_utc' | 'bracket_end_utc'>, clockMs: number): CountdownRange {
  const start = Date.parse(event.bracket_start_utc)
  const end = Date.parse(event.bracket_end_utc)
  return {
    earliestMinutes: Math.max(0, (start - clockMs) / 60_000),
    latestMinutes: Math.max(0, (end - clockMs) / 60_000),
    mayHaveOccurred: start < clockMs && clockMs <= end,
    passed: clockMs > end,
  }
}

/** Countdown as computed by the backend for its own reference. */
export function countdownFromServer(event: VisibilityEvent): CountdownRange | null {
  if (!event.countdown) return null
  return {
    earliestMinutes: event.countdown.earliest_minutes,
    latestMinutes: event.countdown.latest_minutes,
    mayHaveOccurred: event.countdown.may_have_occurred,
    passed: false,
  }
}

export type StateLabelKey = 'VISIBLE' | 'BELOW_GEOMETRIC_HORIZON' | 'TERRAIN_OCCULTED' | 'NOT_VISIBLE' | 'UNKNOWN'

/** A geometric "not visible" is below the horizon — never "terrain-blocked". */
export function stateLabelKey(sample: Pick<EventSample, 'state' | 'not_visible_reason'>): StateLabelKey {
  if (sample.state === 'VISIBLE') return 'VISIBLE'
  if (sample.state === 'UNKNOWN') return 'UNKNOWN'
  return sample.not_visible_reason ?? 'NOT_VISIBLE'
}

export function stateTone(key: StateLabelKey): 'success' | 'neutral' | 'danger' | 'warning' {
  if (key === 'VISIBLE') return 'success'
  if (key === 'UNKNOWN') return 'warning'
  if (key === 'TERRAIN_OCCULTED') return 'danger'
  return 'neutral'
}

/**
 * Pick the payload site for the page's site. Coordinates are the unique key of a
 * site within an analysis; the index is only a fallback.
 */
export function pickSite<S extends { latitude_deg: number; longitude_deg: number }>(
  sites: S[],
  siteIndex: number,
  coord?: { latitude_deg: number; longitude_deg: number },
): S | undefined {
  if (coord) {
    const hit = sites.find((s) => Math.abs(s.latitude_deg - coord.latitude_deg) < 1e-6 && Math.abs(s.longitude_deg - coord.longitude_deg) < 1e-6)
    if (hit) return hit
  }
  return sites[Math.min(Math.max(siteIndex, 0), sites.length - 1)]
}

/** Whether the wall clock lies inside the stored samples (live countdown allowed). */
export function clockInsideSamples(clockMs: number, firstSampleUtc: string, lastSampleUtc: string): boolean {
  return clockMs >= Date.parse(firstSampleUtc) && clockMs <= Date.parse(lastSampleUtc)
}

/** A selected cursor is usable as reference only inside the stored samples. */
export function usableReference(cursorMs: number | null, startUtc: string | undefined, endUtc: string | undefined): string | undefined {
  if (cursorMs === null || !startUtc || !endUtc) return undefined
  if (cursorMs < Date.parse(startUtc) || cursorMs > Date.parse(endUtc)) return undefined
  return new Date(cursorMs).toISOString()
}
