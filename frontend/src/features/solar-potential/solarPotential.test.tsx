import { act, fireEvent, render, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/phase7b.en'
import tr from '@/i18n/locales/phase7b.tr'

import { solarQueryParams } from './api'
import { barSegments, compassKey, formatIndex, formatIndexPct, indexDisplay, parseParams, sameParams } from './logic'
import { SolarPotentialPanel, SolarPotentialView } from './SolarPotentialPanel'
import type { IndexEstimate, PanelKind, PanelResult, SiteSolarPotential, SolarParams, SolarPotentialResponse } from './types'

/* Synthetic contract payloads for UI tests only — not NASA measurements. */

function estimate(horizon: IndexEstimate['horizon'], min: number | null, max: number | null, extra: Partial<IndexEstimate> = {}): IndexEstimate {
  const unavailable = min === null || max === null
  const determined = !unavailable && min === max
  return {
    horizon,
    status: unavailable ? 'UNAVAILABLE' : determined ? 'DETERMINED' : 'RANGE',
    index_pct: determined ? min : null,
    index_min_pct: min,
    index_max_pct: max,
    unavailable_reason: unavailable ? 'NO_KNOWN_VISIBILITY' : null,
    window_hours: 24,
    known_hours: 24,
    unknown_hours: 0,
    unknown_fraction: 0,
    edge_uncertain_hours: 0,
    ...extra,
  }
}

function config(panel: PanelKind, geometric: IndexEstimate | null, terrain: IndexEstimate | null, extra: Partial<PanelResult> = {}): PanelResult {
  return {
    panel,
    tilt_deg: panel === 'FIXED' || panel === 'AZIMUTH_TRACKING' ? 90 : null,
    azimuth_deg: panel === 'FIXED' ? 195 : null,
    azimuth_source: panel === 'FIXED' ? 'OPTIMISED_HINDSIGHT_GEOMETRIC' : null,
    available: true,
    unavailable_reason: null,
    geometric,
    terrain,
    ...extra,
  }
}

function site(index: number, label: string, configurations: PanelResult[], terrain: SiteSolarPotential['sun_terrain_visibility'] = null): SiteSolarPotential {
  return {
    site_index: index,
    label,
    latitude_deg: -89.5,
    longitude_deg: index * 10,
    landing_site_id: null,
    dem_site_id: null,
    terrain_complete_coverage_fraction: null,
    window_hours: 24,
    sample_count: 25,
    sun_above_geometric_horizon: {
      above_horizon_hours: 24,
      below_horizon_hours: 0,
      missing_ephemeris_hours: 0,
      above_horizon_fraction_min: 1,
      above_horizon_fraction_max: 1,
    },
    sun_terrain_visibility: terrain,
    configurations,
  }
}

function payload(sites: SiteSolarPotential[], horizon: 'GEOMETRIC' | 'TERRAIN', comparisons: SolarPotentialResponse['comparisons'] = []): SolarPotentialResponse {
  return {
    analysis_id: 'a1',
    mission_name: 'Test',
    horizon_model: horizon,
    data_quality: horizon === 'TERRAIN' ? 'LOCAL_TERRAIN_PARTIAL' : 'EPHEMERIS_GEOMETRIC',
    algorithm_version: 'x',
    terrain_engine_version: horizon === 'TERRAIN' ? 'y' : null,
    solar_contract_version: '7b.1',
    start_utc: '2026-12-01T00:00:00Z',
    end_utc: '2026-12-02T00:00:00Z',
    time_step_minutes: 60,
    generated_at_utc: '2026-11-15T00:00:00Z',
    headline_horizon: horizon,
    index_definition: 'API index definition.',
    sun_angular_radius_deg: 0.2666,
    sites,
    comparisons,
    electrical_energy: { available: false, reason: 'Not derivable.', missing_inputs: ['panel area and cell efficiency'] },
    assumptions: ['API assumption one.'],
    provenance: [{ source_id: 'jpl-horizons', description: 'Original Az/El source.', version: null }],
    limitations: ['API limitation one.'],
  }
}

const geometricPayload = () =>
  payload(
    [
      site(0, 'Rim A', [
        config('HORIZONTAL', estimate('GEOMETRIC', 2.33, 2.33), null),
        config('FIXED', estimate('GEOMETRIC', 33.7, 33.7), null),
        config('AZIMUTH_TRACKING', estimate('GEOMETRIC', 99.96, 99.96), null),
        config('DUAL_AXIS', estimate('GEOMETRIC', 100, 100), null),
      ]),
      site(1, 'Malapert', [
        config('HORIZONTAL', estimate('GEOMETRIC', 3.39, 3.39), null),
        config('FIXED', estimate('GEOMETRIC', 33.5, 33.5), null, { azimuth_deg: 25 }),
        config('AZIMUTH_TRACKING', estimate('GEOMETRIC', 59.3, 59.3), null),
        config('DUAL_AXIS', estimate('GEOMETRIC', 59.4, 59.4), null),
      ]),
    ],
    'GEOMETRIC',
    [
      { panel: 'HORIZONTAL', horizon: 'GEOMETRIC', status: 'DISTINGUISHABLE', leading_site_index: 1 },
      { panel: 'FIXED', horizon: 'GEOMETRIC', status: 'DISTINGUISHABLE', leading_site_index: 0 },
      { panel: 'AZIMUTH_TRACKING', horizon: 'GEOMETRIC', status: 'DISTINGUISHABLE', leading_site_index: 0 },
      { panel: 'DUAL_AXIS', horizon: 'GEOMETRIC', status: 'DISTINGUISHABLE', leading_site_index: 0 },
    ],
  )

const terrainPayload = () =>
  payload(
    [
      site(
        0,
        'Rim A',
        [
          config('DUAL_AXIS', estimate('GEOMETRIC', 100, 100), estimate('TERRAIN', 40, 70, { known_hours: 16.8, unknown_hours: 7.2, unknown_fraction: 0.3, edge_uncertain_hours: 2 })),
          config('FIXED', null, null, { available: false, unavailable_reason: 'NO_SUNLIT_SAMPLE_TO_OPTIMISE_AZIMUTH', azimuth_deg: null, azimuth_source: null }),
        ],
        { visible_hours: 9.6, blocked_hours: 7.2, unknown_hours: 7.2, visible_fraction_min: 0.4, visible_fraction_max: 0.7, unknown_fraction: 0.3 },
      ),
      site(
        1,
        'Rim B',
        [
          config('DUAL_AXIS', estimate('GEOMETRIC', 100, 100), estimate('TERRAIN', null, null, { known_hours: 0, unknown_hours: 24, unknown_fraction: 1 })),
          config('FIXED', estimate('GEOMETRIC', 30, 30), estimate('TERRAIN', 5, 5), { azimuth_source: 'REQUESTED', azimuth_deg: 90 }),
        ],
        { visible_hours: 0, blocked_hours: 0, unknown_hours: 24, visible_fraction_min: 0, visible_fraction_max: 1, unknown_fraction: 1 },
      ),
    ],
    'TERRAIN',
    [
      { panel: 'DUAL_AXIS', horizon: 'TERRAIN', status: 'UNAVAILABLE', leading_site_index: null },
      { panel: 'DUAL_AXIS', horizon: 'GEOMETRIC', status: 'NOT_DISTINGUISHABLE', leading_site_index: null },
      { panel: 'FIXED', horizon: 'TERRAIN', status: 'UNAVAILABLE', leading_site_index: null },
    ],
  )

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('solar potential · presentation logic', () => {
  it('never turns a range into a single number', () => {
    expect(indexDisplay(estimate('TERRAIN', 40, 70))).toEqual({ kind: 'range', min: 40, max: 70 })
    expect(indexDisplay(estimate('GEOMETRIC', 59.4, 59.4))).toEqual({ kind: 'value', value: 59.4 })
    expect(indexDisplay(estimate('TERRAIN', null, null))).toEqual({ kind: 'unavailable', reason: 'NO_KNOWN_VISIBILITY' })
    expect(indexDisplay(null)).toEqual({ kind: 'unavailable', reason: 'NOT_COMPUTED' })
    // A RANGE status with a stray index_pct must still be shown as a range.
    expect(indexDisplay({ ...estimate('TERRAIN', 40, 70), index_pct: 55 })).toEqual({ kind: 'range', min: 40, max: 70 })
    expect(formatIndex({ kind: 'range', min: 40, max: 70 })).toBe('40.0% – 70.0%')
    expect(formatIndex({ kind: 'unavailable', reason: 'x' })).toBe('—')
  })

  it('keeps two decimals for small indexes and draws bars on a fixed 0–100 scale', () => {
    expect(formatIndexPct(2.334)).toBe('2.33%')
    expect(formatIndexPct(59.44)).toBe('59.4%')
    expect(formatIndexPct(0)).toBe('0.0%')
    expect(barSegments({ kind: 'range', min: 40, max: 70 })).toEqual({ known: 40, possible: 30 })
    expect(barSegments({ kind: 'value', value: 59.4 })).toEqual({ known: 59.4, possible: 0 })
    expect(barSegments({ kind: 'unavailable', reason: 'x' })).toEqual({ known: 0, possible: 0 })
    expect(barSegments({ kind: 'range', min: -5, max: 140 })).toEqual({ known: 0, possible: 100 })
  })

  it('validates panel settings before anything is requested', () => {
    expect(parseParams({ azimuth: '', tilt: '', trackingTilt: '' })).toEqual({ params: {}, errors: {} })
    expect(parseParams({ azimuth: '195', tilt: '45,5', trackingTilt: ' 90 ' })).toEqual({
      params: { azimuthDeg: 195, tiltDeg: 45.5, trackingTiltDeg: 90 },
      errors: {},
    })
    expect(parseParams({ azimuth: '0', tilt: '0', trackingTilt: '' }).params).toEqual({ azimuthDeg: 0, tiltDeg: 0 })
    for (const azimuth of ['360', '-1', 'north', '1e2', '12abc', 'NaN', 'Infinity']) {
      expect(parseParams({ azimuth, tilt: '', trackingTilt: '' }).errors.azimuth).toBe('azimuthRange')
    }
    for (const tilt of ['91', '-0.1', 'flat']) {
      const out = parseParams({ azimuth: '', tilt, trackingTilt: tilt })
      expect(out.errors).toEqual({ tilt: 'tiltRange', trackingTilt: 'tiltRange' })
      expect(out.params).toEqual({})
    }
    expect(sameParams({ azimuthDeg: 10 }, { azimuthDeg: 10 })).toBe(true)
    expect(sameParams({ azimuthDeg: 10 }, {})).toBe(false)
    expect(solarQueryParams({ azimuthDeg: 0, trackingTiltDeg: 30 })).toEqual({ azimuth_deg: 0, tracking_tilt_deg: 30 })
    expect(solarQueryParams({})).toEqual({})
  })

  it('names compass points clockwise from north', () => {
    expect([0, 44, 90, 135, 180, 225, 270, 315, 359].map(compassKey)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'])
  })

  it('has identical EN and TR keys', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`]))
    expect(keys(tr).sort()).toEqual(keys(en).sort())
  })
})

describe('solar potential · view', () => {
  it('shows a geometric analysis with four panel types, per-site values and a site verdict', () => {
    render(<SolarPotentialView data={geometricPayload()} />)
    expect(screen.getByTestId('solar-horizon')).toHaveTextContent('Geometric horizon')
    expect(screen.getByText(/Terrain shadows are not considered/)).toBeInTheDocument()
    for (const panel of ['HORIZONTAL', 'FIXED', 'AZIMUTH_TRACKING', 'DUAL_AXIS']) {
      expect(screen.getByTestId(`solar-panel-${panel}`)).toBeInTheDocument()
    }
    const horizontal = within(screen.getByTestId('solar-panel-HORIZONTAL'))
    expect(within(horizontal.getByTestId('solar-row-HORIZONTAL-0')).getByTestId('solar-value')).toHaveTextContent('2.33%')
    expect(horizontal.getByRole('img', { name: 'Malapert, Horizontal panel: 3.39%' })).toBeInTheDocument()
    expect(horizontal.getByTestId('solar-compare-HORIZONTAL')).toHaveTextContent('Malapert is ahead')
    const fixed = within(screen.getByTestId('solar-row-FIXED-0'))
    expect(fixed.getByText(/tilt 90° · facing 195° \(S\) · direction chosen with hindsight/)).toBeInTheDocument()
    expect(within(screen.getByTestId('solar-row-FIXED-1')).getByText(/facing 25° \(NE\)/)).toBeInTheDocument()
    // No terrain statements in a geometric analysis.
    expect(screen.queryByTestId('solar-geometric-context')).not.toBeInTheDocument()
    expect(screen.queryByTestId('solar-unknown')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('solar-availability-0')).getByText('Terrain visibility is not part of a geometric analysis.')).toBeInTheDocument()
    // Provenance, the energy disclaimer and API notes are available on demand.
    const notes = within(screen.getByTestId('solar-notes'))
    expect(notes.getByText('jpl-horizons')).toBeInTheDocument()
    expect(notes.getByText('panel area and cell efficiency')).toBeInTheDocument()
    expect(notes.getByText('API limitation one.')).toBeInTheDocument()
    expect(notes.getByText(/never from the photo/)).toBeInTheDocument()
  })

  it('shows terrain ranges, unknown shares and unavailable values without inventing numbers', () => {
    render(<SolarPotentialView data={terrainPayload()} />)
    expect(screen.getByTestId('solar-horizon')).toHaveTextContent('Terrain-aware')

    const partial = screen.getByTestId('solar-row-DUAL_AXIS-0')
    expect(partial).toHaveAttribute('data-status', 'RANGE')
    expect(within(partial).getByTestId('solar-value')).toHaveTextContent('Range40.0% – 70.0%')
    expect(within(partial).getByRole('img', { name: 'Rim A, Dual-axis tracking panel: 40.0% to 70.0%' })).toBeInTheDocument()
    expect(within(partial).getByTestId('solar-unknown')).toHaveTextContent('Unknown for 30% of the window — A large part is unknown.')
    expect(within(partial).getByText('2.0 h near a terrain edge counted only in the maximum')).toBeInTheDocument()
    // The terrain-free value is context only, clearly labelled, never the headline.
    expect(within(partial).getByTestId('solar-geometric-context')).toHaveTextContent('Ignoring terrain (context only): 100.0%')
    expect(within(partial).getByTestId('solar-value')).not.toHaveTextContent('100.0%')

    const allUnknown = screen.getByTestId('solar-row-DUAL_AXIS-1')
    expect(allUnknown).toHaveAttribute('data-status', 'UNAVAILABLE')
    expect(within(allUnknown).getByTestId('solar-value')).toHaveTextContent('Not available')
    expect(within(allUnknown).getByText(/The terrain data cannot decide Sun visibility at any sample/)).toBeInTheDocument()
    expect(within(allUnknown).getByTestId('solar-unknown')).toHaveTextContent('Unknown for 100% of the window')
    expect(within(allUnknown).getByTestId('solar-value').textContent).not.toMatch(/\d/)

    const noAzimuth = screen.getByTestId('solar-row-FIXED-0')
    expect(within(noAzimuth).getByText(/The Sun never rises in this window/)).toBeInTheDocument()
    expect(within(noAzimuth).getByTestId('solar-value')).toHaveTextContent('Not available')
    expect(within(screen.getByTestId('solar-row-FIXED-1')).getByText(/direction you set/)).toBeInTheDocument()

    expect(screen.getByTestId('solar-compare-DUAL_AXIS')).toHaveTextContent('No ranking: at least one site has no value.')
    const availability = within(screen.getByTestId('solar-availability-0'))
    expect(availability.getByText('40% to 70% of the window')).toBeInTheDocument()
    expect(availability.getByRole('img', { name: '9.6 h visible · 7.2 h behind terrain · 7.2 h unknown' })).toBeInTheDocument()
  })

  it('never shows an electrical unit', () => {
    const { container } = render(<SolarPotentialView data={terrainPayload()} />)
    // Open the notes so their text is part of the check as well.
    container.querySelector('details')?.setAttribute('open', '')
    expect(container.textContent ?? '').not.toMatch(/\b(k?Wh?|kW|watts?)\b/i)
  })

  it('renders in Turkish', async () => {
    await i18n.changeLanguage('tr')
    render(<SolarPotentialView data={terrainPayload()} />)
    expect(screen.getByTestId('solar-horizon')).toHaveTextContent('Arazi dikkate alınır')
    const partial = within(screen.getByTestId('solar-row-DUAL_AXIS-0'))
    expect(partial.getByTestId('solar-value')).toHaveTextContent('Aralık40.0% – 70.0%')
    expect(partial.getByTestId('solar-unknown')).toHaveTextContent('Pencerenin 30% kadarı bilinmiyor')
    expect(within(screen.getByTestId('solar-row-DUAL_AXIS-1')).getByTestId('solar-value')).toHaveTextContent('Mevcut değil')
    expect(screen.getByTestId('solar-compare-DUAL_AXIS')).toHaveTextContent('Sıralama yok')
  })
})

const hooks = vi.hoisted(() => ({
  calls: [] as { id: string | undefined; params: SolarParams; enabled: boolean }[],
  data: undefined as SolarPotentialResponse | undefined,
  available: true as boolean | undefined,
}))

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  useSolarCapability: () => ({ available: hooks.available, failed: false }),
  useSolarPotential: (id: string | undefined, params: SolarParams, enabled: boolean) => {
    hooks.calls.push({ id, params, enabled })
    return { data: enabled ? hooks.data : undefined, error: null, isPlaceholderData: false, isFetching: false, refetch: () => Promise.resolve() }
  },
}))

describe('solar potential · panel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hooks.calls.length = 0
    hooks.data = geometricPayload()
    hooks.available = true
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const lastParams = () => hooks.calls[hooks.calls.length - 1]?.params

  it('debounces panel settings and never requests an invalid configuration', () => {
    render(<SolarPotentialPanel analysisId="a1" />)
    expect(screen.getByTestId('solar-not-power')).toHaveTextContent('not electrical power')
    expect(lastParams()).toEqual({})
    const azimuth = screen.getByLabelText('Fixed panel direction (°)')

    for (const value of ['1', '19', '195']) fireEvent.change(azimuth, { target: { value } })
    act(() => void vi.advanceTimersByTime(300))
    expect(lastParams()).toEqual({}) // still settling
    act(() => void vi.advanceTimersByTime(300))
    expect(lastParams()).toEqual({ azimuthDeg: 195 })
    const requested = new Set(hooks.calls.map((c) => JSON.stringify(c.params)))
    expect(requested).toEqual(new Set(['{}', '{"azimuthDeg":195}'])) // 1 and 19 were never requested

    fireEvent.change(azimuth, { target: { value: '400' } })
    act(() => void vi.advanceTimersByTime(2000))
    expect(lastParams()).toEqual({ azimuthDeg: 195 }) // invalid input is not sent
    expect(azimuth).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a direction from 0 up to, but not including, 360.')

    fireEvent.change(azimuth, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Fixed panel tilt (°)'), { target: { value: '45' } })
    act(() => void vi.advanceTimersByTime(600))
    expect(lastParams()).toEqual({ tiltDeg: 45 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows nothing calculated for a synthetic demo and requests nothing', () => {
    render(<SolarPotentialPanel analysisId="demo-123" synthetic />)
    expect(screen.getByTestId('solar-synthetic')).toHaveTextContent('Not calculated for the synthetic demo')
    expect(hooks.calls.every((c) => c.enabled === false)).toBe(true)
    expect(screen.queryByTestId('solar-panel-DUAL_AXIS')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Fixed panel direction (°)')).not.toBeInTheDocument()
  })

  it('does not render a payload that belongs to another analysis', () => {
    render(<SolarPotentialPanel analysisId="other" />)
    expect(screen.queryByTestId('solar-panel-DUAL_AXIS')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading solar potential…' })).toBeInTheDocument()
  })

  it('says so when the backend does not offer the route', () => {
    hooks.available = false
    render(<SolarPotentialPanel analysisId="a1" />)
    expect(screen.getByText('This backend does not provide solar potential yet.')).toBeInTheDocument()
    expect(hooks.calls.every((c) => c.enabled === false)).toBe(true)
  })
})
