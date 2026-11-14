import { describe, expect, it } from 'vitest'

import type { AnalysisResult, SiteResult } from '@/types/api'

import type { AuthoritativeSiteEpochs, EpochsResponse } from '@/services/contracts'

import {
  buildEpochs,
  canRescore,
  epochsFromAuthoritativeSite,
  geometricState,
  mapAuthoritativeBody,
  MAX_WINDOWS,
  nearestSampleIndex,
  recommendationStatus,
  resolveSiteEpochs,
} from './adapter'

// Deterministic test fixture — NOT live NASA data.
const metrics = {
  sun_visibility_pct: 50,
  earth_visibility_pct: 50,
  joint_visibility_pct: 25,
  longest_sunlight_hours: 1,
  longest_darkness_hours: 1,
  longest_earth_visibility_hours: 1,
  longest_communication_gap_hours: 1,
  longest_joint_visibility_hours: 1,
}
const hour = (h: number) => new Date(Date.UTC(2026, 11, 1, h)).toISOString()

function site(partial: Partial<SiteResult> = {}): SiteResult {
  return {
    label: 'A',
    latitude_deg: -89.68,
    longitude_deg: -166,
    landing_site_id: null,
    metrics,
    score: 50,
    rank: 1,
    contributions: [],
    darkness_windows: [],
    communication_gaps: [],
    joint_windows: [],
    ...partial,
  }
}
const points = [0, 1, 2, 3].map((h) => ({
  t: hour(h),
  sun_elevation_deg: [1.2, 1.1, -0.2, null][h] ?? null,
  earth_elevation_deg: [0.5, -0.3, 0.4, 0.1][h] ?? null,
}))

describe('analysis adapter', () => {
  it('uses the strict > 0° geometric rule and null → UNKNOWN', () => {
    expect(geometricState(0)).toBe('BELOW_HORIZON')
    expect(geometricState(0.0001)).toBe('VISIBLE')
    expect(geometricState(null)).toBe('UNKNOWN')
  })

  it('classifies GEOMETRIC analyses from elevation only', () => {
    const e = buildEpochs({ horizon_model: 'GEOMETRIC' }, site(), points)
    expect(e.map((x) => x.sun)).toEqual(['VISIBLE', 'VISIBLE', 'BELOW_HORIZON', 'UNKNOWN'])
    expect(e.map((x) => x.joint)).toEqual(['VISIBLE', 'NOT_VISIBLE', 'NOT_VISIBLE', 'UNKNOWN'])
  })

  it('marks terrain-blocked samples from backend darkness windows ([start, end))', () => {
    const s = site({
      darkness_windows: [{ start_utc: hour(1), end_utc: hour(3), duration_hours: 2 }],
      terrain: {
        dem_file: null, dem_site_id: null, resolution_m: 5, horizon_coverage_fraction: 0.1,
        observer_height_m: 2, surface_z_m: 0, dataset_version: 'x',
        sun_unknown_fraction: 0, earth_unknown_fraction: 0,
      },
    })
    const e = buildEpochs({ horizon_model: 'TERRAIN' }, s, points)
    // h0 outside window & clean → VISIBLE; h1 geometric visible but in window → BLOCKED;
    // h2 below 0° in window → BELOW_HORIZON; h3 null elevation → UNKNOWN
    expect(e.map((x) => x.sun)).toEqual(['VISIBLE', 'BLOCKED', 'BELOW_HORIZON', 'UNKNOWN'])
    expect(e[1]!.sunGeometric).toBe('VISIBLE')
  })

  it('refuses to claim VISIBLE when the site has unknown terrain samples', () => {
    const s = site({
      terrain: {
        dem_file: null, dem_site_id: null, resolution_m: 5, horizon_coverage_fraction: 0.1,
        observer_height_m: 2, surface_z_m: 0, dataset_version: 'x',
        sun_unknown_fraction: 0.07, earth_unknown_fraction: 0,
      },
    })
    const e = buildEpochs({ horizon_model: 'TERRAIN' }, s, points)
    expect(e[0]!.sun).toBe('UNRESOLVED')
    expect(e[0]!.joint).toBe('UNKNOWN')
  })

  it('treats a full (possibly truncated) window list as unresolved outside windows', () => {
    const many = Array.from({ length: MAX_WINDOWS }, (_, i) => ({
      start_utc: new Date(Date.UTC(2027, 0, 1, i)).toISOString(),
      end_utc: new Date(Date.UTC(2027, 0, 1, i, 30)).toISOString(),
      duration_hours: 0.5,
    }))
    const s = site({
      darkness_windows: many,
      terrain: {
        dem_file: null, dem_site_id: null, resolution_m: 5, horizon_coverage_fraction: 1,
        observer_height_m: 2, surface_z_m: 0, dataset_version: 'x',
        sun_unknown_fraction: 0, earth_unknown_fraction: 0,
      },
    })
    expect(buildEpochs({ horizon_model: 'TERRAIN' }, s, points)[0]!.sun).toBe('UNRESOLVED')
  })

  it('drops the zero-duration sample at end_utc (half-open analysis window)', () => {
    const e = buildEpochs({ horizon_model: 'GEOMETRIC', end_utc: hour(3) }, site(), points)
    expect(e.map((x) => x.iso)).toEqual([hour(0), hour(1), hour(2)])
  })

  it('maps authoritative VISIBLE/BLOCKED/UNKNOWN without inventing clear sky', () => {
    expect(mapAuthoritativeBody('BLOCKED', 1.5, false)).toBe('BLOCKED')
    expect(mapAuthoritativeBody('BLOCKED', -1, true)).toBe('BELOW_HORIZON')
    expect(mapAuthoritativeBody('UNKNOWN', 2, false)).toBe('UNKNOWN')
    const authSite: AuthoritativeSiteEpochs = {
      label: 'A',
      latitude_deg: -89.68,
      longitude_deg: -166,
      samples: [
        {
          t: hour(0),
          sun_azimuth_deg: 86,
          sun_elevation_deg: 1.5,
          earth_azimuth_deg: 170,
          earth_elevation_deg: -1.9,
          sun_state: 'BLOCKED',
          earth_state: 'BLOCKED',
          joint_state: 'NOT_VISIBLE',
          sun_terrain_horizon_deg: 12,
          earth_terrain_horizon_deg: -1.2,
          sun_geometric_state: 'VISIBLE',
          earth_geometric_state: 'BLOCKED',
          hold_hours: 1,
          contributes_duration: true,
        },
        {
          t: hour(3),
          sun_azimuth_deg: 90,
          sun_elevation_deg: 2,
          earth_azimuth_deg: 171,
          earth_elevation_deg: -1,
          sun_state: 'VISIBLE',
          earth_state: 'UNKNOWN',
          joint_state: 'UNKNOWN',
          hold_hours: 0,
          contributes_duration: false,
        },
      ],
    }
    const e = epochsFromAuthoritativeSite(authSite, hour(3))
    expect(e).toHaveLength(1)
    expect(e[0]!.sun).toBe('BLOCKED')
    expect(e[0]!.earth).toBe('BLOCKED')
    expect(e[0]!.joint).toBe('NOT_VISIBLE')
    expect(e[0]!.sunAzimuth).toBe(86)
    expect(e[0]!.authoritative).toBe(true)
    expect(e[0]!.sunGeometric).toBe('VISIBLE')
    expect(e[0]!.earthGeometric).toBe('BELOW_HORIZON')
  })

  it('prefers authoritative /epochs over timeline-derived UNRESOLVED', () => {
    const s = site({
      terrain: {
        dem_file: null, dem_site_id: null, resolution_m: 5, horizon_coverage_fraction: 0.1,
        observer_height_m: 2, surface_z_m: 0, dataset_version: 'x',
        sun_unknown_fraction: 0.07, earth_unknown_fraction: 0,
      },
    })
    const derived = buildEpochs({ horizon_model: 'TERRAIN' }, s, points)
    expect(derived[0]!.sun).toBe('UNRESOLVED')
    const auth: EpochsResponse = {
      analysis_id: 'x',
      mission_name: 'm',
      horizon_model: 'TERRAIN',
      data_quality: 'LOCAL_TERRAIN_PARTIAL',
      algorithm_version: '1',
      start_utc: hour(0),
      end_utc: hour(4),
      time_step_minutes: 60,
      sample_count_per_site: 1,
      duration_semantics: '[start_utc, end_utc)',
      sites: [
        {
          label: 'A',
          latitude_deg: -89.68,
          longitude_deg: -166,
          samples: [
            {
              t: hour(0),
              sun_azimuth_deg: 10,
              sun_elevation_deg: 1,
              earth_azimuth_deg: 20,
              earth_elevation_deg: 1,
              sun_state: 'UNKNOWN',
              earth_state: 'VISIBLE',
              joint_state: 'UNKNOWN',
              hold_hours: 1,
              contributes_duration: true,
            },
          ],
        },
      ],
      provenance: [],
      limitations: [],
    }
    const resolved = resolveSiteEpochs({ horizon_model: 'TERRAIN', end_utc: hour(4) }, s, points, auth)
    expect(resolved[0]!.sun).toBe('UNKNOWN')
    expect(resolved[0]!.authoritative).toBe(true)
  })

  it('snaps cursor times to the nearest sampled epoch', () => {
    const e = [{ t: 0 }, { t: 10 }, { t: 20 }]
    expect(nearestSampleIndex(e, -5)).toBe(0)
    expect(nearestSampleIndex(e, 14)).toBe(1)
    expect(nearestSampleIndex(e, 16)).toBe(2)
    expect(nearestSampleIndex(e, 99)).toBe(2)
    expect(nearestSampleIndex([], 1)).toBe(-1)
  })

  it('mirrors backend recommendation refusal', () => {
    const base = {
      id: 'x', mission_name: 'm', status: 'COMPLETED', algorithm_version: '1', start_utc: hour(0),
      end_utc: hour(4), time_step_minutes: 60, horizon_model: 'TERRAIN',
      weights: { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 },
      assumptions: [], limitations: [], provenance: [], created_at: hour(0),
    } as const
    const partial = { ...base, data_quality: 'LOCAL_TERRAIN_PARTIAL', recommended_site_label: null, sites: [site({ score: null, rank: null })] } as unknown as AnalysisResult
    expect(recommendationStatus(partial)).toEqual({ kind: 'refused', reason: 'partial_terrain' })
    expect(canRescore(partial)).toBe(false)
    const tie = { ...base, data_quality: 'EPHEMERIS_GEOMETRIC', recommended_site_label: null, sites: [site(), site({ label: 'B' })] } as unknown as AnalysisResult
    expect(recommendationStatus(tie)).toEqual({ kind: 'tie' })
    expect(canRescore(tie)).toBe(true)
  })
})
