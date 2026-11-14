import { describe, expect, it } from 'vitest'

import type { SiteResult } from '@/types/api'

import { denseRank, explainChange, rescore, scoreMetrics, weightsValid } from './rescore'

// Deterministic fixture metrics (not live data).
const site = (label: string, sun: number, earth: number, joint: number): SiteResult => ({
  label,
  latitude_deg: -89,
  longitude_deg: 0,
  landing_site_id: null,
  metrics: {
    sun_visibility_pct: sun,
    earth_visibility_pct: earth,
    joint_visibility_pct: joint,
    longest_sunlight_hours: 0,
    longest_darkness_hours: 0,
    longest_earth_visibility_hours: 0,
    longest_communication_gap_hours: 0,
    longest_joint_visibility_hours: 0,
  },
  score: 0,
  rank: 1,
  contributions: [],
  darkness_windows: [],
  communication_gaps: [],
  joint_windows: [],
})

const W = { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 }

describe('client re-weighting mirrors backend scoring.py', () => {
  it('matches score = Σ w/100 × metric with 3-decimal rounding', () => {
    const { score, contributions } = scoreMetrics(site('A', 100, 47.1234, 47.1).metrics, W)
    expect(contributions.sun_visibility).toBe(40)
    expect(contributions.earth_visibility).toBe(18.849)
    expect(contributions.joint_visibility).toBe(9.42)
    expect(score).toBe(68.269)
  })

  it('uses dense ranking with ties', () => {
    expect(denseRank([50, 70, 50])).toEqual([2, 1, 2])
  })

  it('validates weights like the backend', () => {
    expect(weightsValid(W)).toBe(true)
    expect(weightsValid({ ...W, joint_visibility: 30 })).toBe(false)
    expect(weightsValid({ sun_visibility: -10, earth_visibility: 90, joint_visibility: 20 })).toBe(false)
  })

  it('explains a leader change driven by a weight shift', () => {
    const sites = [site('Rim', 100, 50, 50), site('Massif', 60, 70, 60)]
    expect(rescore(sites, W).find((s) => s.rank === 1)?.label).toBe('Rim')
    const earthHeavy = { sun_visibility: 10, earth_visibility: 80, joint_visibility: 10 }
    const exp = explainChange(sites, W, earthHeavy)
    expect(exp.kind).toBe('leader')
    if (exp.kind === 'leader') {
      expect(exp.leader).toBe('Massif')
      expect(exp.previous).toBe('Rim')
      expect(exp.driver).toBe('earth_visibility')
    }
  })

  it('reports ties instead of picking a winner', () => {
    expect(explainChange([site('A', 50, 50, 50), site('B', 50, 50, 50)], W, W)).toEqual({ kind: 'tie', labels: ['A', 'B'] })
  })
})
