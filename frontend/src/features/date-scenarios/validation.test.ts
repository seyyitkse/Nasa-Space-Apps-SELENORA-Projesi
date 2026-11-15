import { describe, expect, it } from 'vitest'

import type { ResolvedSite } from '@/stores/missionStore'

import {
  hasScenarioErrors,
  scenarioSampleCount,
  toScenarioRequest,
  validateScenarioPlanner,
  type ScenarioPlannerInput,
} from './validation'

const custom: ResolvedSite = {
  ref: { kind: 'custom', id: 'custom-ridge-42' },
  name: 'Custom ridge 42',
  latitude_deg: -87.25,
  longitude_deg: 42.5,
  source: 'custom',
}

function input(): ScenarioPlannerInput {
  return {
    name: 'Seasonal comparison',
    site: custom,
    scenarios: [
      { id: 'dec-2026', label: 'December 2026', start: '2026-12-01T00:00', end: '2026-12-03T00:00' },
      { id: 'jan-2027', label: 'January 2027', start: '2027-01-01T00:00', end: '2027-01-03T00:00' },
    ],
    timeStepMinutes: 60,
    horizonModel: 'GEOMETRIC',
    weights: { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 },
  }
}

describe('date scenario validation', () => {
  it('builds a same-site request with independent UTC windows and custom identity', () => {
    const value = input()
    expect(hasScenarioErrors(validateScenarioPlanner(value))).toBe(false)
    const request = toScenarioRequest(value)
    expect(request.site.site_id).toBe('custom-ridge-42')
    expect(request.site.landing_site_id).toBeNull()
    expect(request.scenarios.map((item) => item.start_utc)).toEqual([
      '2026-12-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
    ])
    expect(new Set(request.scenarios.map(() => request.site.latitude_deg)).size).toBe(1)
  })

  it('rejects duplicate windows and unequal durations', () => {
    const duplicate = input()
    duplicate.scenarios[1] = { ...duplicate.scenarios[0]!, id: 'duplicate', label: 'Duplicate' }
    expect(validateScenarioPlanner(duplicate).rows.duplicate?.end).toBe('duplicate')

    const unequal = input()
    unequal.scenarios[1]!.end = '2027-01-04T00:00'
    expect(validateScenarioPlanner(unequal).rows['jan-2027']?.end).toBe('durationMismatch')
  })

  it('validates order, scenario count and sampling', () => {
    const value = input()
    value.scenarios[0]!.end = value.scenarios[0]!.start
    expect(validateScenarioPlanner(value).rows['dec-2026']?.end).toBe('dateOrder')
    expect(scenarioSampleCount(input().scenarios[0]!, 60)).toBe(49)
    const single = input()
    single.scenarios = single.scenarios.slice(0, 1)
    expect(validateScenarioPlanner(single).form).toBe('count')
  })
})
