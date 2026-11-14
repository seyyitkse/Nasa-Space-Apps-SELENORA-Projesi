import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/services/apiClient'
import { selenoraApi } from '@/services/selenoraApi'

import { AppProviders, makeQueryClient } from './providers'
import { routes } from './router'

const health = {
  status: 'ok',
  service: 'SELENORA API',
  version: '0.1.0',
  api_version: 'v1',
  algorithm_version: '0.2.0-phase2',
  environment: 'test',
  server_time_utc: '2026-11-14T00:00:00Z',
  uptime_seconds: 12,
  components: [
    { name: 'database', status: 'OK', detail: '' },
    { name: 'ai_analyst', status: 'NOT_CONFIGURED', detail: '' },
  ],
}
const sites = {
  items: [
    {
      id: 'shackleton-rim-a',
      name: 'Shackleton Rim — Point A',
      latitude_deg: -89.68,
      longitude_deg: -166,
      region: 'South Polar Region',
      description: '',
      coordinate_source: 'test',
      coordinate_status: 'APPROXIMATE_REFERENCE',
    },
  ],
  total: 1,
  coordinate_frame: '',
  longitude_convention: '',
  disclaimer: '',
}

function mockApi(fail = false) {
  vi.spyOn(api, 'get').mockImplementation((url: string) => {
    if (fail) return Promise.reject(new Error('network down'))
    if (url === '/health') return Promise.resolve({ data: health })
    if (url === '/api/v1/sites') return Promise.resolve({ data: sites })
    if (url === '/api/v1/data-sources') return Promise.resolve({ data: { items: [] } })
    if (url === '/api/v1/analyses') return Promise.resolve({ data: [] })
    return Promise.reject(new Error(`unexpected ${url}`))
  })
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AppProviders client={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

beforeEach(() => {
  localStorage.clear()
  void i18n.changeLanguage('en')
})
afterEach(() => vi.restoreAllMocks())

describe('SELENORA app shell', () => {
  it('renders Mission Control with live API health', async () => {
    mockApi()
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'SELENORA', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('API online')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Start Mission Analysis/ })).toHaveAttribute('href', '/planner')
    expect(screen.getByRole('link', { name: /Explore Lunar Surface/ })).toHaveAttribute('href', '/explorer')
  })

  it('shows an honest offline state when the API is unreachable', async () => {
    mockApi(true)
    renderAt('/')
    expect(await screen.findByText('API offline', {}, { timeout: 4000 })).toBeInTheDocument()
  })

  it('navigates via the sidebar', async () => {
    mockApi()
    const router = renderAt('/')
    const nav = await screen.findAllByRole('navigation', { name: 'Primary' })
    await userEvent.click(within(nav[0]!).getByRole('link', { name: 'Mission Planner' }))
    expect(await screen.findByLabelText('Mission name')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/planner')
  })

  it('validates the planner form before submitting', async () => {
    mockApi()
    const post = vi.spyOn(api, 'post')
    renderAt('/planner')
    const name = await screen.findByLabelText('Mission name')
    await userEvent.clear(name)
    await userEvent.click(screen.getByRole('button', { name: /Run ephemeris analysis/ }))
    expect(await screen.findByText('Mission name must be 2–160 characters.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('shows an empty state on Site Comparison without results', async () => {
    mockApi()
    renderAt('/comparison')
    expect(await screen.findByText('No analysis results yet')).toBeInTheDocument()
  })

  it('loads a stored analysis route with real data quality badge', async () => {
    mockApi()
    const site = (label: string, score: number, rank: number) => ({
      label,
      latitude_deg: -89.68,
      longitude_deg: -166,
      landing_site_id: null,
      metrics: {
        sun_visibility_pct: 80,
        earth_visibility_pct: 50,
        joint_visibility_pct: 40,
        longest_sunlight_hours: 10,
        longest_darkness_hours: 2,
        longest_earth_visibility_hours: 8,
        longest_communication_gap_hours: 4,
        longest_joint_visibility_hours: 3,
      },
      score,
      rank,
      contributions: [
        { metric: 'sun_visibility' as const, weight_pct: 40, value_pct: 80, contribution: 32 },
        { metric: 'earth_visibility' as const, weight_pct: 40, value_pct: 50, contribution: 20 },
        { metric: 'joint_visibility' as const, weight_pct: 20, value_pct: 40, contribution: 8 },
      ],
      darkness_windows: [],
      communication_gaps: [],
      joint_windows: [],
    })
    vi.spyOn(selenoraApi, 'getAnalysis').mockResolvedValue({
      id: 'abc-123',
      mission_name: 'Test Mission',
      status: 'COMPLETED',
      data_quality: 'EPHEMERIS_GEOMETRIC',
      algorithm_version: '0.2.0-phase2',
      start_utc: '2027-01-10T00:00:00Z',
      end_utc: '2027-01-12T00:00:00Z',
      time_step_minutes: 360,
      horizon_model: 'GEOMETRIC',
      weights: { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 },
      sites: [site('A', 60, 1), site('B', 52, 2)],
      recommended_site_label: 'A',
      assumptions: ['Geometric horizon'],
      limitations: ['No LOLA'],
      provenance: [
        {
          source_id: 'jpl-horizons',
          description: 'NASA/JPL Horizons',
          retrieved_at: '2026-11-14T00:00:00Z',
          version: '1.2',
        },
      ],
      created_at: '2026-11-14T00:00:00Z',
    })
    vi.spyOn(selenoraApi, 'getTimeline').mockResolvedValue({
      analysis_id: 'abc-123',
      data_quality: 'EPHEMERIS_GEOMETRIC',
      downsampled: false,
      step_minutes: 360,
      sites: [
        {
          label: 'A',
          points: [
            { t: '2027-01-10T00:00:00Z', sun_elevation_deg: 2, earth_elevation_deg: -1 },
            { t: '2027-01-10T06:00:00Z', sun_elevation_deg: 3, earth_elevation_deg: 1 },
          ],
        },
        {
          label: 'B',
          points: [
            { t: '2027-01-10T00:00:00Z', sun_elevation_deg: 1, earth_elevation_deg: 0 },
            { t: '2027-01-10T06:00:00Z', sun_elevation_deg: 2, earth_elevation_deg: 2 },
          ],
        },
      ],
    })
    renderAt('/comparison/abc-123')
    expect(await screen.findByText('Test Mission', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText('Science Transparency')).toBeInTheDocument()
    expect(screen.getAllByText(/jpl-horizons/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/REAL EPHEMERIS/i)).toBeInTheDocument()
    expect(screen.queryByText(/Synthetic demonstration/)).not.toBeInTheDocument()
  })

  it('switches language to Turkish', async () => {
    mockApi()
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: 'tr' }))
    expect(await screen.findByRole('link', { name: /Görev Analizini Başlat/ })).toBeInTheDocument()
  })

  it('renders a not-found page', async () => {
    mockApi()
    renderAt('/nope')
    expect(await screen.findByText('Off the map')).toBeInTheDocument()
  })
})
