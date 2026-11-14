import { describe, expect, it } from 'vitest'

import type { EpochState } from '../analysis-data/adapter'
import { buildHeatmap } from './heatmap'

// Deterministic fixture — not live data.
const ep = (iso: string, sun: EpochState['sun']): EpochState => ({
  t: Date.parse(iso),
  iso,
  sunElevation: 1,
  earthElevation: 1,
  sunAzimuth: null,
  earthAzimuth: null,
  sun,
  earth: 'VISIBLE',
  sunGeometric: 'VISIBLE',
  earthGeometric: 'VISIBLE',
  joint: sun === 'VISIBLE' ? 'VISIBLE' : sun === 'UNRESOLVED' || sun === 'UNKNOWN' ? 'UNKNOWN' : 'NOT_VISIBLE',
  sunTerrainHorizonDeg: null,
  earthTerrainHorizonDeg: null,
  holdHours: 0.5,
  contributesDuration: true,
  authoritative: false,
})

describe('mission window heatmap', () => {
  const epochs = [
    ep('2026-12-01T00:00:00Z', 'VISIBLE'),
    ep('2026-12-01T00:30:00Z', 'BLOCKED'),
    ep('2026-12-01T01:00:00Z', 'UNRESOLVED'),
    ep('2026-12-02T23:00:00Z', 'BELOW_HORIZON'),
  ]

  it('buckets real samples by UTC day and hour', () => {
    const { days, cells } = buildHeatmap(epochs, 'sun')
    expect(days).toEqual(['2026-12-01', '2026-12-02'])
    expect(cells.get('2026-12-01|0')).toMatchObject({ samples: 2, visible: 1, blocked: 1, unknown: 0 })
    expect(cells.get('2026-12-01|1')).toMatchObject({ samples: 1, unknown: 1 })
    expect(cells.has('2026-12-01|5')).toBe(false) // no data → no cell (never extrapolated)
  })

  it('honours date filters with a half-open range', () => {
    const { days } = buildHeatmap(epochs, 'sun', Date.parse('2026-12-02T00:00:00Z'))
    expect(days).toEqual(['2026-12-02'])
    expect(buildHeatmap(epochs, 'joint').cells.get('2026-12-01|1')?.unknown).toBe(1)
  })
})
