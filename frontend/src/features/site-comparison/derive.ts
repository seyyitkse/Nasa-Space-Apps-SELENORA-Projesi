import type { Interval, SiteResult, SiteTimeline, WeightKey } from '@/types/api'

export type Body = 'sun' | 'earth' | 'joint'

export interface Segment {
  start: number
  end: number
  visible: boolean
}

function isVisible(p: SiteTimeline['points'][number], body: Body): boolean {
  const sun = (p.sun_elevation_deg ?? -Infinity) > 0
  const earth = (p.earth_elevation_deg ?? -Infinity) > 0
  return body === 'sun' ? sun : body === 'earth' ? earth : sun && earth
}

/** Collapse a sampled series into contiguous visible / not-visible segments. */
export function segments(points: SiteTimeline['points'], body: Body, stepMinutes: number): Segment[] {
  const out: Segment[] = []
  const stepMs = stepMinutes * 60_000
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const t = Date.parse(p.t)
    const vis = isVisible(p, body)
    const last = out[out.length - 1]
    if (last && last.visible === vis) last.end = t + stepMs
    else out.push({ start: t, end: t + stepMs, visible: vis })
  }
  return out
}

/** Rows for Recharts: one row per timestamp, `s{i}` = value of site i. */
export function elevationRows(timelines: SiteTimeline[], body: 'sun' | 'earth') {
  const first = timelines[0]
  if (!first) return []
  return first.points.map((p, i) => {
    const row: Record<string, number | null> = { t: Date.parse(p.t) }
    timelines.forEach((tl, s) => {
      const pt = tl.points[i]
      row[`s${s}`] = pt ? (body === 'sun' ? pt.sun_elevation_deg : pt.earth_elevation_deg) : null
    })
    return row
  })
}

/** Cumulative hours of joint (Sun + Earth) visibility per site over time. */
export function cumulativeJointRows(timelines: SiteTimeline[], stepMinutes: number) {
  const first = timelines[0]
  if (!first) return []
  const acc = timelines.map(() => 0)
  return first.points.map((p, i) => {
    const row: Record<string, number> = { t: Date.parse(p.t) }
    timelines.forEach((tl, s) => {
      const pt = tl.points[i]
      if (pt && isVisible(pt, 'joint')) acc[s] = (acc[s] ?? 0) + stepMinutes / 60
      row[`s${s}`] = Math.round((acc[s] ?? 0) * 10) / 10
    })
    return row
  })
}

export function longest(intervals: Interval[]): Interval | null {
  return intervals.reduce<Interval | null>((best, i) => (!best || i.duration_hours > best.duration_hours ? i : best), null)
}

export interface RankingExplanation {
  tie: boolean
  leader: SiteResult
  runnerUp: SiteResult | null
  delta: number
  driver: { metric: WeightKey; diff: number } | null
}

/** Deterministic explanation of why the leader ranks first (no AI involved). */
export function explainRanking(sites: SiteResult[]): RankingExplanation | null {
  const scored = sites.filter((s) => s.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const leader = scored[0]
  if (!leader) return null
  const runnerUp = scored[1] ?? null
  if (!runnerUp) return { tie: false, leader, runnerUp: null, delta: 0, driver: null }
  const delta = Math.round(((leader.score ?? 0) - (runnerUp.score ?? 0)) * 100) / 100
  let driver: RankingExplanation['driver'] = null
  for (const c of leader.contributions) {
    const other = runnerUp.contributions.find((o) => o.metric === c.metric)
    const diff = Math.round((c.contribution - (other?.contribution ?? 0)) * 100) / 100
    if (!driver || Math.abs(diff) > Math.abs(driver.diff)) driver = { metric: c.metric, diff }
  }
  return { tie: delta === 0, leader, runnerUp, delta, driver }
}
