import { describe, expect, it } from 'vitest'

import type { ResolvedSite } from '@/stores/missionStore'

import {
  normalizeWeights,
  type PlannerInput,
  sampleCount,
  toAnalysisRequest,
  validatePlanner,
  weightsTotal,
} from './validation'

const siteA: ResolvedSite = {
  ref: { kind: 'reference', id: 'a' },
  name: 'A',
  latitude_deg: -89.68,
  longitude_deg: -166,
  source: 'reference',
}
const siteB: ResolvedSite = {
  ref: { kind: 'custom', id: 'b' },
  name: 'B',
  latitude_deg: -89.44,
  longitude_deg: -141.8,
  source: 'custom',
}

const valid: PlannerInput = {
  missionName: 'Test mission',
  siteA,
  siteB,
  startDate: '2026-12-01',
  endDate: '2026-12-15',
  timeStepMinutes: 60,
  horizonModel: 'GEOMETRIC',
  weights: { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 },
}

describe('mission planner validation', () => {
  it('accepts a valid mission', () => {
    expect(validatePlanner(valid)).toEqual({})
  })

  it('requires both sites and distinct coordinates', () => {
    expect(validatePlanner({ ...valid, siteA: null }).siteA).toBe('siteRequired')
    expect(validatePlanner({ ...valid, siteB: { ...siteA, ref: { kind: 'custom', id: 'x' } } }).siteB).toBe('sameSite')
  })

  it('rejects bad date ranges', () => {
    expect(validatePlanner({ ...valid, startDate: '' }).startDate).toBe('dateRequired')
    expect(validatePlanner({ ...valid, startDate: '2026-02-31x' }).startDate).toBe('dateRequired')
    expect(validatePlanner({ ...valid, endDate: '2026-11-30' }).endDate).toBe('dateOrder')
    expect(validatePlanner({ ...valid, endDate: '2027-01-15' }).endDate).toBe('dateSpan')
  })

  it('enforces weights totalling 100', () => {
    expect(validatePlanner({ ...valid, weights: { sun_visibility: 50, earth_visibility: 40, joint_visibility: 20 } }).weights).toBe('weightsSum')
    expect(validatePlanner({ ...valid, weights: { sun_visibility: -5, earth_visibility: 85, joint_visibility: 20 } }).weights).toBe('weightRange')
    expect(validatePlanner({ ...valid, missionName: ' ' }).missionName).toBe('missionName')
  })

  it('normalizes weights to exactly 100', () => {
    const n = normalizeWeights({ sun_visibility: 50, earth_visibility: 50, joint_visibility: 50 })
    expect(weightsTotal(n)).toBe(100)
    expect(normalizeWeights({ sun_visibility: 0, earth_visibility: 0, joint_visibility: 0 })).toEqual({
      sun_visibility: 40,
      earth_visibility: 40,
      joint_visibility: 20,
    })
  })

  it('computes sample counts and builds the API request', () => {
    expect(sampleCount(valid)).toBe(14 * 24 + 1)
    const req = toAnalysisRequest(valid)
    expect(req.start_utc).toBe('2026-12-01T00:00:00Z')
    expect(req.sites[0]?.landing_site_id).toBe('a')
    expect(req.sites[1]?.landing_site_id).toBeNull()
  })
})
