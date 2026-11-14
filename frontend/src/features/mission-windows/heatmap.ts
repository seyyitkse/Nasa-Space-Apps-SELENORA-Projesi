import type { EpochState } from '../analysis-data/adapter'
import type { LaneBody } from '../analysis-data/stateStyle'

export interface HeatCell {
  day: string // YYYY-MM-DD (UTC)
  hour: number // 0..23 UTC
  samples: number
  visible: number
  blocked: number
  unknown: number // UNKNOWN or UNRESOLVED
}

const DAY_MS = 86_400_000

function stateOf(e: EpochState, body: LaneBody) {
  return body === 'sun' ? e.sun : body === 'earth' ? e.earth : e.joint
}

/**
 * Bucket *sampled* epochs into UTC day × hour cells. Days/hours without samples
 * are absent (rendered as "no data") — nothing is extrapolated.
 */
export function buildHeatmap(epochs: EpochState[], body: LaneBody, fromMs?: number, toMs?: number) {
  const cells = new Map<string, HeatCell>()
  const days: string[] = []
  for (const e of epochs) {
    if (fromMs !== undefined && e.t < fromMs) continue
    if (toMs !== undefined && e.t >= toMs) continue
    const d = new Date(e.t)
    const day = d.toISOString().slice(0, 10)
    const hour = d.getUTCHours()
    const key = `${day}|${hour}`
    let c = cells.get(key)
    if (!c) {
      c = { day, hour, samples: 0, visible: 0, blocked: 0, unknown: 0 }
      cells.set(key, c)
      if (days[days.length - 1] !== day && !days.includes(day)) days.push(day)
    }
    const s = stateOf(e, body)
    c.samples++
    if (s === 'VISIBLE') c.visible++
    else if (s === 'BLOCKED') c.blocked++
    else if (s === 'UNKNOWN' || s === 'UNRESOLVED') c.unknown++
  }
  return { days, cells }
}

export function dayStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}

export function dayEndMs(day: string): number {
  return dayStartMs(day) + DAY_MS
}
