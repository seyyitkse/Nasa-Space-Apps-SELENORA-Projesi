import { describe, expect, it } from 'vitest'

import type { SiteResult, SiteTimeline } from '@/types/api'

import { cumulativeJointRows, explainRanking, longest, segments } from './derive'

const tl = (label: string, sun: number[], earth: number[]): SiteTimeline => ({
  label,
  points: sun.map((s, i) => ({
    t: new Date(Date.UTC(2026, 11, 1, i)).toISOString(),
    sun_elevation_deg: s,
    earth_elevation_deg: earth[i] ?? null,
  })),
})

const site = (label: string, score: number, c: [number, number, number]): SiteResult => ({
  label,
  latitude_deg: -89,
  longitude_deg: 0,
  landing_site_id: null,
  metrics: {
    sun_visibility_pct: 0,
    earth_visibility_pct: 0,
    joint_visibility_pct: 0,
    longest_sunlight_hours: 0,
    longest_darkness_hours: 0,
    longest_earth_visibility_hours: 0,
    longest_communication_gap_hours: 0,
    longest_joint_visibility_hours: 0,
  },
  score,
  rank: null,
  contributions: [
    { metric: 'sun_visibility', weight_pct: 40, value_pct: 0, contribution: c[0] },
    { metric: 'earth_visibility', weight_pct: 40, value_pct: 0, contribution: c[1] },
    { metric: 'joint_visibility', weight_pct: 20, value_pct: 0, contribution: c[2] },
  ],
  darkness_windows: [],
  communication_gaps: [],
  joint_windows: [],
})

describe('comparison derivations', () => {
  it('builds visibility segments (strictly above 0°)', () => {
    const s = segments(tl('A', [1, 2, 0, -1, 3], []).points, 'sun', 60)
    expect(s.map((x) => x.visible)).toEqual([true, false, true])
    expect((s[1]!.end - s[1]!.start) / 3_600_000).toBe(2)
  })

  it('accumulates joint visibility hours', () => {
    const rows = cumulativeJointRows([tl('A', [1, 1, -1, 1], [1, -1, 1, 1])], 60)
    expect(rows.map((r) => r.s0)).toEqual([1, 1, 1, 2])
  })

  it('finds the longest interval', () => {
    expect(
      longest([
        { start_utc: 'a', end_utc: 'b', duration_hours: 3 },
        { start_utc: 'c', end_utc: 'd', duration_hours: 7 },
      ])?.duration_hours,
    ).toBe(7)
    expect(longest([])).toBeNull()
  })

  it('explains the ranking from score contributions', () => {
    const exp = explainRanking([site('B', 50, [20, 20, 10]), site('A', 62, [30, 22, 10])])
    expect(exp?.leader.label).toBe('A')
    expect(exp?.delta).toBe(12)
    expect(exp?.driver).toEqual({ metric: 'sun_visibility', diff: 10 })
    expect(explainRanking([site('A', 50, [20, 20, 10]), site('B', 50, [25, 15, 10])])?.tie).toBe(true)
  })
})
