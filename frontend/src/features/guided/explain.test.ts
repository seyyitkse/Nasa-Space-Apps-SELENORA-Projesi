import { describe, expect, it } from 'vitest'

import type { AnalysisResult, SiteResult } from '@/types/api'

import { explainResult } from './explain'
import { OBJECTIVE_WEIGHTS } from './presets'

// Deterministic fixtures — not live NASA results.
const metrics = (sun: number, earth: number, joint: number) => ({
  sun_visibility_pct: sun,
  earth_visibility_pct: earth,
  joint_visibility_pct: joint,
  longest_sunlight_hours: 0,
  longest_darkness_hours: 12,
  longest_earth_visibility_hours: 0,
  longest_communication_gap_hours: 30,
  longest_joint_visibility_hours: 0,
})
const site = (label: string, m: SiteResult['metrics'], extra: Partial<SiteResult> = {}): SiteResult => ({
  label,
  latitude_deg: -89,
  longitude_deg: 0,
  landing_site_id: null,
  metrics: m,
  score: 0.4 * m.sun_visibility_pct + 0.4 * m.earth_visibility_pct + 0.2 * m.joint_visibility_pct,
  rank: null,
  contributions: [],
  darkness_windows: [],
  communication_gaps: [],
  joint_windows: [],
  ...extra,
})
const base = {
  id: 'x', mission_name: 'm', status: 'COMPLETED', algorithm_version: '1',
  start_utc: '2026-12-01T00:00:00Z', end_utc: '2026-12-02T00:00:00Z', time_step_minutes: 60,
  weights: OBJECTIVE_WEIGHTS.balanced, assumptions: [], limitations: [], provenance: [], created_at: '2026-12-01T00:00:00Z',
}

describe('plain-language explanation', () => {
  it('uses the stored deterministic recommendation and states geometric limits', () => {
    const r = {
      ...base, horizon_model: 'GEOMETRIC', data_quality: 'EPHEMERIS_GEOMETRIC', recommended_site_label: 'A',
      sites: [site('A', metrics(100, 50, 50)), site('B', metrics(60, 50, 40))],
    } as unknown as AnalysisResult
    const e = explainResult(r, OBJECTIVE_WEIGHTS.balanced)
    expect(e.verdict).toEqual({ kind: 'recommended', site: 'A', source: 'stored', margin: 18 })
    expect(e.sites[0]!.established[0]).toEqual({ key: 'sun', params: { pct: 100 } })
    expect(e.sites[0]!.uncertain.map((s) => s.key)).toContain('noTerrain')
  })

  it('re-weights with the chosen objective using the backend formula', () => {
    const r = {
      ...base, horizon_model: 'GEOMETRIC', data_quality: 'EPHEMERIS_GEOMETRIC', recommended_site_label: 'A',
      sites: [site('A', metrics(100, 20, 20)), site('B', metrics(50, 80, 40))],
    } as unknown as AnalysisResult
    const e = explainResult(r, OBJECTIVE_WEIGHTS.earth)
    expect(e.verdict.kind).toBe('recommended')
    if (e.verdict.kind === 'recommended') {
      expect(e.verdict.site).toBe('B')
      expect(e.verdict.source).toBe('reweighted')
    }
  })

  it('never recommends under LOCAL_TERRAIN_PARTIAL and explains terrain/unknown time', () => {
    const terrain = {
      dem_file: 'f', dem_site_id: 'Site04', resolution_m: 5, horizon_coverage_fraction: 0.069, max_range_m: 12000,
      observer_height_m: 2, surface_z_m: 1592, dataset_version: 'v', sun_unknown_fraction: 0.07,
      earth_unknown_fraction: 0, unknown_hours: 11,
    }
    const r = {
      ...base, horizon_model: 'TERRAIN', data_quality: 'LOCAL_TERRAIN_PARTIAL', recommended_site_label: null,
      sites: [
        site('A', metrics(0, 0, 0), {
          score: null,
          terrain,
          geometric_comparison: {
            geometric: metrics(100, 0, 0), longest_darkness_hours_delta: 0, longest_communication_gap_hours_delta: 0,
            sun_visibility_pct_delta: -100, earth_visibility_pct_delta: 0, joint_visibility_pct_delta: 0,
          },
        }),
      ],
    } as unknown as AnalysisResult
    const e = explainResult(r, OBJECTIVE_WEIGHTS.sunlight)
    expect(e.verdict).toEqual({ kind: 'refused', reason: 'partial_terrain' })
    const keys = e.sites[0]!.established.map((s) => s.key)
    expect(keys).toContain('terrainBlocksSunAll')
    expect(e.sites[0]!.uncertain.map((s) => s.key)).toEqual(['unknownHours', 'partialCoverage', 'perEpochDerived'])
  })
})

describe('explanation keys are translated', () => {
  it('every statement key exists in EN and TR', async () => {
    const en = (await import('@/i18n/locales/phase5d.en')).default.guided
    const tr = (await import('@/i18n/locales/phase5d.tr')).default.guided
    const established = ['sun', 'earth', 'joint', 'darkness', 'gap', 'terrainBlocksSunAll', 'terrainReducesSun']
    const uncertain = ['unknownHours', 'partialCoverage', 'perEpochDerived', 'noTerrain']
    const general = ['earthLink', 'heuristic', 'synthetic', 'approxCoords']
    for (const d of [en, tr]) {
      for (const k of established) expect(d.established).toHaveProperty(k)
      for (const k of uncertain) expect(d.uncertain).toHaveProperty(k)
      for (const k of general) expect(d.general).toHaveProperty(k)
    }
  })
})

describe('validated example matching', () => {
  it('matches stored analyses of exactly the two chosen sites, in any order', async () => {
    const { matchingExamples } = await import('./examples')
    const s = (id: string, lat: number, lon: number) => ({ id, name: id, latitude_deg: lat, longitude_deg: lon, region: '', description: '', coordinate_source: '', coordinate_status: '' })
    const a = s('a', -89.68, -166)
    const b = s('b', -89.44, -141.8)
    const mk = (id: string, sites: [number, number][]) =>
      ({ id, status: 'COMPLETED', sites: sites.map(([lat, lon]) => ({ latitude_deg: lat, longitude_deg: lon })) }) as unknown as AnalysisResult
    const got = matchingExamples([mk('x', [[-89.44, -141.8], [-89.68, -166]]), mk('y', [[-89.68, -166], [-86, 2.9]])], a, b)
    expect(got.map((r) => r.id)).toEqual(['x'])
  })
})
