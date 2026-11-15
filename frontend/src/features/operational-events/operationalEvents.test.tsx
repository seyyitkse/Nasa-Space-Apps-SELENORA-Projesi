import { render, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, describe, expect, it } from 'vitest'

import en from '@/i18n/locales/phase7a.en'
import tr from '@/i18n/locales/phase7a.tr'

import { clockInsideSamples, countdownAt, countdownFromServer, formatSpan, spanParts, stateLabelKey, usableReference } from './logic'
import { OperationalEventsView } from './OperationalEventsPanel'
import type { BodyEvents, EventSample, EventsResponse, EventTrack, VisibilityEvent } from './types'

/* Synthetic contract payloads for UI tests only — not NASA measurements. */
const UNITS = { d: 'd', h: 'h', min: 'min' }

function sample(t: string, state: EventSample['state'], extra: Partial<EventSample> = {}): EventSample {
  return { t, state, elevation_deg: null, horizon_deg: 0, not_visible_reason: null, unknown_reason: null, ...extra }
}

function event(kind: VisibilityEvent['kind'], start: string, end: string, extra: Partial<VisibilityEvent> = {}): VisibilityEvent {
  const confirmed = kind === 'RISE' || kind === 'SET'
  return {
    kind,
    confirmed,
    from_state: 'VISIBLE',
    to_state: kind === 'BECOMES_UNKNOWN' ? 'UNKNOWN' : 'NOT_VISIBLE',
    bracket_start_utc: start,
    bracket_end_utc: end,
    bracket_minutes: (Date.parse(end) - Date.parse(start)) / 60_000,
    before: sample(start, 'VISIBLE'),
    after: sample(end, kind === 'BECOMES_UNKNOWN' ? 'UNKNOWN' : 'NOT_VISIBLE'),
    last_known_before_unknown: null,
    differs_from_last_known: null,
    unknown_samples_before: 0,
    elevation_rate_deg_per_hour: null,
    approx_disc_crossing_hours: null,
    countdown: null,
    earlier_events_excluded: confirmed ? true : null,
    ...extra,
  }
}

function track(horizon: EventTrack['horizon'], status: EventTrack['status'], extra: Partial<EventTrack> = {}): EventTrack {
  return {
    horizon,
    status,
    current: sample('2026-12-01T00:00:00Z', 'VISIBLE'),
    next_change: null,
    next_confirmed_event: null,
    next_known: null,
    no_change_through_utc: null,
    sample_count: 25,
    unknown_sample_count: 0,
    transitions: [],
    transitions_truncated: false,
    ...extra,
  }
}

function payload(sun: BodyEvents, earth: BodyEvents, extra: Partial<EventsResponse> = {}): EventsResponse {
  return {
    analysis_id: 'a1',
    mission_name: 'Test',
    horizon_model: sun.terrain ? 'TERRAIN' : 'GEOMETRIC',
    data_quality: 'EPHEMERIS_GEOMETRIC',
    algorithm_version: 'x',
    terrain_engine_version: null,
    start_utc: '2026-12-01T00:00:00Z',
    end_utc: '2026-12-02T00:00:00Z',
    first_sample_utc: '2026-12-01T00:00:00Z',
    last_sample_utc: '2026-12-02T00:00:00Z',
    time_step_minutes: 60,
    reference_utc: '2026-12-01T00:00:00Z',
    reference_mode: 'WINDOW_START',
    generated_at_utc: '2026-11-15T00:00:00Z',
    events_contract_version: '7a.1',
    event_time_semantics: '',
    sites: [{ site_index: 0, label: 'A', latitude_deg: -89.68, longitude_deg: -166, landing_site_id: null, dem_site_id: null, terrain_complete_coverage_fraction: null, sun, earth }],
    provenance: [],
    limitations: ['API note one.'],
    ...extra,
  }
}

const sunset = event('SET', '2026-12-01T05:00:00Z', '2026-12-01T06:00:00Z', {
  approx_disc_crossing_hours: 16,
  countdown: { earliest_minutes: 300, latest_minutes: 360, may_have_occurred: false },
  after: sample('2026-12-01T06:00:00Z', 'NOT_VISIBLE', { not_visible_reason: 'BELOW_GEOMETRIC_HORIZON' }),
})

const geometricPayload = () =>
  payload(
    { body: 'SUN', nominal_angular_radius_deg: 0.2666, terrain: null, geometric: track('GEOMETRIC', 'EVENT_CONFIRMED', { next_change: sunset, next_confirmed_event: sunset, transitions: [sunset] }) },
    {
      body: 'EARTH',
      nominal_angular_radius_deg: 0.95,
      terrain: null,
      geometric: track('GEOMETRIC', 'NO_EVENT_IN_WINDOW', {
        current: sample('2026-12-01T00:00:00Z', 'NOT_VISIBLE', { not_visible_reason: 'BELOW_GEOMETRIC_HORIZON' }),
        no_change_through_utc: '2026-12-02T00:00:00Z',
      }),
    },
  )

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('operational events · presentation logic', () => {
  it('formats spans in whole minutes and drops minutes beyond two days', () => {
    expect(spanParts(1505.4)).toEqual({ days: 1, hours: 1, minutes: 5 })
    expect(formatSpan(40, UNITS)).toBe('40 min')
    expect(formatSpan(60, UNITS)).toBe('1 h')
    expect(formatSpan(320, UNITS)).toBe('5 h 20 min')
    expect(formatSpan(1505, UNITS)).toBe('25 h 5 min')
    expect(formatSpan(3 * 1440 + 125, UNITS)).toBe('3 d 2 h')
    expect(formatSpan(2 * 1440 + 10, UNITS)).toBe('2 d')
    expect(formatSpan(-5, UNITS)).toBe('0 min')
  })

  it('computes a live countdown as a range and flags a possibly past event', () => {
    const e = { bracket_start_utc: '2026-12-01T05:00:00Z', bracket_end_utc: '2026-12-01T06:00:00Z' }
    expect(countdownAt(e, Date.parse('2026-12-01T03:00:00Z'))).toEqual({ earliestMinutes: 120, latestMinutes: 180, mayHaveOccurred: false, passed: false })
    // On the bracket start the event is still strictly ahead: (start, end].
    expect(countdownAt(e, Date.parse('2026-12-01T05:00:00Z')).mayHaveOccurred).toBe(false)
    expect(countdownAt(e, Date.parse('2026-12-01T05:20:00Z'))).toEqual({ earliestMinutes: 0, latestMinutes: 40, mayHaveOccurred: true, passed: false })
    expect(countdownAt(e, Date.parse('2026-12-01T06:00:01Z')).passed).toBe(true)
    expect(countdownFromServer(sunset)).toEqual({ earliestMinutes: 300, latestMinutes: 360, mayHaveOccurred: false, passed: false })
    expect(countdownFromServer(event('SET', e.bracket_start_utc, e.bracket_end_utc))).toBeNull()
  })

  it('never labels a geometric below-horizon state as terrain', () => {
    expect(stateLabelKey({ state: 'NOT_VISIBLE', not_visible_reason: 'BELOW_GEOMETRIC_HORIZON' })).toBe('BELOW_GEOMETRIC_HORIZON')
    expect(stateLabelKey({ state: 'NOT_VISIBLE', not_visible_reason: 'TERRAIN_OCCULTED' })).toBe('TERRAIN_OCCULTED')
    expect(stateLabelKey({ state: 'UNKNOWN', not_visible_reason: null })).toBe('UNKNOWN')
    expect(stateLabelKey({ state: 'NOT_VISIBLE', not_visible_reason: null })).toBe('NOT_VISIBLE')
  })

  it('only accepts references and live clocks inside the stored samples', () => {
    const [start, end] = ['2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z']
    expect(usableReference(Date.parse('2026-12-01T12:00:00Z'), start, end)).toBe('2026-12-01T12:00:00.000Z')
    expect(usableReference(Date.parse('2026-12-03T00:00:00Z'), start, end)).toBeUndefined()
    expect(usableReference(null, start, end)).toBeUndefined()
    expect(usableReference(5, undefined, end)).toBeUndefined()
    expect(clockInsideSamples(Date.parse('2026-12-01T12:00:00Z'), start, end)).toBe(true)
    expect(clockInsideSamples(Date.parse('2026-11-15T12:00:00Z'), start, end)).toBe(false)
  })
})

describe('operational events · localization', () => {
  const keys = (o: object, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v !== null ? keys(v as object, `${p}${k}.`) : [`${p}${k}`]))

  it('has identical EN and TR key sets', () => {
    expect(keys(tr).sort()).toEqual(keys(en).sort())
  })
})

describe('operational events · view', () => {
  it('shows Sun and Earth separately with a bracketed sunset and a range countdown', () => {
    render(<OperationalEventsView data={geometricPayload()} siteIndex={0} live={false} clockMs={0} />)
    const sun = within(screen.getByTestId('track-SUN-GEOMETRIC'))
    expect(sun.getAllByText('Sunset (disc centre crosses 0°)').length).toBeGreaterThan(0)
    expect(sun.getAllByText('between 01 Dec, 05:00 UTC and 01 Dec, 06:00 UTC').length).toBeGreaterThan(0)
    expect(sun.getByTestId('countdown')).toHaveTextContent('in 5 h to 6 h')
    expect(sun.getByText('Timing uncertainty: 1 h (the sampling interval).')).toBeInTheDocument()
    expect(sun.getByText(/roughly 16 h to cross the horizon/)).toBeInTheDocument()
    // No single clock time is presented as "the" event.
    expect(sun.queryByText(/^at 01 Dec/)).not.toBeInTheDocument()

    const earth = within(screen.getByTestId('track-EARTH-GEOMETRIC'))
    expect(earth.getByText('Below horizon')).toBeInTheDocument()
    expect(earth.getByText('No change at the sampled times through 02 Dec, 00:00 UTC.')).toBeInTheDocument()
    expect(earth.queryByTestId('countdown')).not.toBeInTheDocument()

    expect(screen.queryByTestId('track-SUN-TERRAIN')).not.toBeInTheDocument()
    expect(screen.queryByText('Behind terrain')).not.toBeInTheDocument()
    expect(screen.getByTestId('reference-mode')).toHaveTextContent('start of the analysis window (not the current time)')
    expect(screen.getByText('Durations are measured from the reference time, not from now.')).toBeInTheDocument()
  })

  it('keeps geometric and terrain tracks apart and presents UNKNOWN explicitly', () => {
    const becomesUnknown = event('BECOMES_UNKNOWN', '2026-12-01T02:00:00Z', '2026-12-01T03:00:00Z', {
      from_state: 'NOT_VISIBLE',
      before: sample('2026-12-01T02:00:00Z', 'NOT_VISIBLE', { not_visible_reason: 'TERRAIN_OCCULTED' }),
      after: sample('2026-12-01T03:00:00Z', 'UNKNOWN', { unknown_reason: 'TERRAIN_COVERAGE_INCOMPLETE' }),
      countdown: { earliest_minutes: 120, latest_minutes: 180, may_have_occurred: false },
    })
    const laterSet = event('SET', '2026-12-01T09:00:00Z', '2026-12-01T10:00:00Z', {
      earlier_events_excluded: false,
      countdown: { earliest_minutes: 540, latest_minutes: 600, may_have_occurred: false },
      after: sample('2026-12-01T10:00:00Z', 'NOT_VISIBLE', { not_visible_reason: 'TERRAIN_OCCULTED' }),
    })
    const resolves = event('RESOLVES_TO_VISIBLE', '2026-12-01T05:00:00Z', '2026-12-01T06:00:00Z', {
      differs_from_last_known: true,
      last_known_before_unknown: sample('2026-12-01T02:00:00Z', 'NOT_VISIBLE'),
    })
    const data = payload(
      {
        body: 'SUN',
        nominal_angular_radius_deg: 0.2666,
        geometric: track('GEOMETRIC', 'NO_EVENT_IN_WINDOW', { no_change_through_utc: '2026-12-02T00:00:00Z' }),
        terrain: track('TERRAIN', 'UNKNOWN_AHEAD', {
          current: sample('2026-12-01T00:00:00Z', 'NOT_VISIBLE', { not_visible_reason: 'TERRAIN_OCCULTED' }),
          next_change: becomesUnknown,
          next_confirmed_event: laterSet,
          transitions: [becomesUnknown, resolves, laterSet],
        }),
      },
      {
        body: 'EARTH',
        nominal_angular_radius_deg: 0.95,
        geometric: track('GEOMETRIC', 'INSUFFICIENT_DATA', { current: null }),
        terrain: track('TERRAIN', 'UNKNOWN_AT_REFERENCE', {
          current: sample('2026-12-01T00:00:00Z', 'UNKNOWN', { unknown_reason: 'TERRAIN_DATA_UNAVAILABLE' }),
          next_known: sample('2026-12-01T04:00:00Z', 'VISIBLE'),
        }),
      },
    )
    render(<OperationalEventsView data={data} siteIndex={0} live={false} clockMs={0} />)

    const sunTerrain = within(screen.getByTestId('track-SUN-TERRAIN'))
    expect(sunTerrain.getByText('Behind terrain')).toBeInTheDocument()
    expect(sunTerrain.getAllByText('State becomes unknown').length).toBeGreaterThan(0)
    expect(sunTerrain.getByText(/This is not a rise or a set\./)).toHaveTextContent('the terrain data ends before the horizon is decided')
    expect(sunTerrain.getByText('Later confirmed event')).toBeInTheDocument()
    expect(sunTerrain.getAllByText('Sun goes behind terrain').length).toBeGreaterThan(0)
    expect(sunTerrain.getByText(/an earlier unobserved event cannot be ruled out/)).toBeInTheDocument()
    expect(sunTerrain.getByText(/The state differs from the last known sample \(01 Dec, 02:00 UTC\)/)).toBeInTheDocument()
    expect(sunTerrain.getAllByText('not an event').length).toBe(2)
    expect(sunTerrain.getAllByText('confirmed').length).toBe(1)

    const sunGeometric = within(screen.getByTestId('track-SUN-GEOMETRIC'))
    expect(sunGeometric.queryByText('Behind terrain')).not.toBeInTheDocument()

    const earthTerrain = within(screen.getByTestId('track-EARTH-TERRAIN'))
    expect(earthTerrain.getByText('The state is unknown at the reference time, so there is no countdown.')).toBeInTheDocument()
    expect(earthTerrain.getByText(/Unknown because there is no terrain data in this direction\./)).toBeInTheDocument()
    expect(earthTerrain.getByText(/Next known state: Visible at the sample at 01 Dec, 04:00 UTC\. This is not an event time\./)).toBeInTheDocument()
    expect(earthTerrain.queryByTestId('countdown')).not.toBeInTheDocument()

    expect(within(screen.getByTestId('track-EARTH-GEOMETRIC')).getByText('Not enough known samples to report events.')).toBeInTheDocument()
  })

  it('ticks from the wall clock only when the backend reference is NOW', () => {
    const data = { ...geometricPayload(), reference_mode: 'NOW' as const }
    const clock = Date.parse('2026-12-01T05:30:00Z')
    const { rerender } = render(<OperationalEventsView data={data} siteIndex={0} live clockMs={clock} />)
    expect(screen.getByTestId('countdown')).toHaveTextContent('within 30 min, and it may already have happened')
    expect(screen.getByText('Counting down from now. Refreshed every minute.')).toBeInTheDocument()
    // The polite live region carries the bracket, not the ticking number.
    const status = within(screen.getByTestId('track-SUN-GEOMETRIC')).getByRole('status')
    const before = status.textContent
    rerender(<OperationalEventsView data={data} siteIndex={0} live clockMs={clock + 10 * 60_000} />)
    expect(screen.getByTestId('countdown')).toHaveTextContent('within 20 min')
    expect(status.textContent).toBe(before)
    expect(status).toHaveAttribute('aria-live', 'polite')

    // Window-start reference must not tick even if "live" is requested.
    rerender(<OperationalEventsView data={geometricPayload()} siteIndex={0} live clockMs={clock} />)
    expect(screen.getByTestId('countdown')).toHaveTextContent('in 5 h to 6 h')
  })

  it('renders in Turkish', async () => {
    await i18n.changeLanguage('tr')
    render(<OperationalEventsView data={geometricPayload()} siteIndex={0} live={false} clockMs={0} />)
    const sun = within(screen.getByTestId('track-SUN-GEOMETRIC'))
    expect(sun.getAllByText('Gün batımı (disk merkezi 0°’yi geçer)').length).toBeGreaterThan(0)
    expect(sun.getByTestId('countdown')).toHaveTextContent('5 sa ile 6 sa sonra')
    expect(within(screen.getByTestId('track-EARTH-GEOMETRIC')).getByText('Ufkun altında')).toBeInTheDocument()
    expect(screen.getAllByText('Geometrik ufuk').length).toBe(2)
  })
})
