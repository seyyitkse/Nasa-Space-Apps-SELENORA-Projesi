import { BODY_COLORS } from '@/components/shared/siteColors'

import type { BodyState, EpochState } from './adapter'

export type LaneBody = 'sun' | 'earth' | 'joint'
export type LaneState = BodyState | EpochState['joint']

export const STATE_FILL: Record<string, string> = {
  BELOW_HORIZON: 'rgba(148,163,184,0.10)',
  NOT_VISIBLE: 'rgba(148,163,184,0.10)',
  BLOCKED: 'rgba(248,113,113,0.55)',
  UNKNOWN: 'url(#sel-unknown-hatch)',
  UNRESOLVED: 'url(#sel-unresolved-hatch)',
}

export function stateFill(body: LaneBody, state: LaneState): string {
  if (state === 'VISIBLE') return BODY_COLORS[body]
  return STATE_FILL[state] ?? 'transparent'
}

export function laneState(e: EpochState, body: LaneBody): LaneState {
  return body === 'sun' ? e.sun : body === 'earth' ? e.earth : e.joint
}

export interface LaneSegment {
  start: number
  end: number
  state: LaneState
}

/** Merge consecutive epochs with identical state; each sample holds until the next one. */
export function laneSegments(epochs: EpochState[], body: LaneBody, stepMs: number, endT?: number): LaneSegment[] {
  const out: LaneSegment[] = []
  epochs.forEach((e, i) => {
    const next = epochs[i + 1]?.t ?? Math.min(e.t + stepMs, endT ?? e.t + stepMs)
    const s = laneState(e, body)
    const last = out[out.length - 1]
    if (last && last.state === s && last.end === e.t) last.end = next
    else out.push({ start: e.t, end: next, state: s })
  })
  return out
}

export const STATE_TONE: Record<string, 'success' | 'neutral' | 'danger' | 'warning' | 'violet'> = {
  VISIBLE: 'success',
  BELOW_HORIZON: 'neutral',
  NOT_VISIBLE: 'neutral',
  BLOCKED: 'danger',
  UNKNOWN: 'warning',
  UNRESOLVED: 'warning',
}
