import { describe, expect, it } from 'vitest'

import { normalizeHorizonProfile, observerChunk, parseBoundsHeader, parseSizePxHeader } from './contracts'

// Deterministic fixtures shaped like Phase 5B responses — not live data.
describe('Phase 5B contract adapters', () => {
  it('normalises horizon-profile bins without inventing values', () => {
    const p = normalizeHorizonProfile({
      latitude_deg: -89.68, longitude_deg: -166, quality_label: 'LOCAL_TERRAIN_PARTIAL', observer_height_m: 2,
      max_range_m: 12000, complete_coverage_fraction: 0.125, dataset_version: 'v', attribution: 'a',
      bins: [
        { azimuth_deg: 0, horizon_elevation_deg: 6.4, has_any_data: true, complete_coverage: false, valid_range_m: 5750, distance_to_blocker_m: 225 },
        { azimuth_deg: 45, horizon_elevation_deg: 0, has_any_data: false, complete_coverage: false, valid_range_m: 0, distance_to_blocker_m: null },
        { azimuth_deg: 90, horizon_elevation_deg: 1.2, has_any_data: true, complete_coverage: true, valid_range_m: 12000, distance_to_blocker_m: null },
      ],
    })
    expect(p.horizon_elevation_deg).toEqual([6.4, null, 1.2]) // no-data bin → null, never 0°
    expect(p.complete).toEqual([false, false, true])
    expect(p.citation).toBe('a')
  })

  it('requires valid X-SELENORA-Bounds-M before placing a preview', () => {
    expect(parseBoundsHeader('-22347.488,-29415.262,17652.512,10584.738')).toEqual([-22347.488, -29415.262, 17652.512, 10584.738])
    expect(parseBoundsHeader('1,2,3')).toBeNull()
    expect(parseBoundsHeader(undefined)).toBeNull()
  })

  it('parses X-SELENORA-Size-Px for ImageStatic imageSize', () => {
    expect(parseSizePxHeader('768x512')).toEqual([768, 512])
    expect(parseSizePxHeader('bad')).toBeUndefined()
    expect(parseSizePxHeader(undefined)).toBeUndefined()
  })

  it('aligns live observer chunks to the analysis start and clips to its end', () => {
    const start = Date.parse('2026-12-01T00:00:00Z')
    const end = Date.parse('2026-12-08T00:00:00Z')
    expect(observerChunk(Date.parse('2026-12-02T05:00:00Z'), start, end, 60)).toEqual({
      start: '2026-12-02T00:00:00.000Z',
      end: '2026-12-03T00:00:00.000Z',
    })
    expect(observerChunk(Date.parse('2026-12-07T23:00:00Z'), start, end, 60)?.end).toBe('2026-12-08T00:00:00.000Z')
    expect(observerChunk(start, start, end, 10)).toBeNull() // endpoint minimum step is 30 min
  })
})
