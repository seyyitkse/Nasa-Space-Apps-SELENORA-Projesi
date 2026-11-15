import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders, makeQueryClient } from '@/app/providers'
import { routes } from '@/app/router'
import { api } from '@/services/apiClient'
import { useMissionStore } from '@/stores/missionStore'

const globeCatalog = {
  title: 'test',
  coordinate_frame: 'MOON_ME',
  longitude_convention: 'east-positive',
  sphere_radius_m: 1737400,
  south_polar_threshold_deg: -80,
  cartesian_convention: 'x',
  svs_glb_orientation_status: 'ok',
  svs_glb_note: '',
  disclaimer: '',
  sites_disclaimer: 'Reference only',
  related_endpoints: {},
  total: 1,
  items: [
    {
      id: 'shackleton-rim-a',
      name: 'Shackleton Rim — Point A',
      latitude_deg: -89.68,
      longitude_deg: -166,
      region: 'South Polar Region',
      description: '',
      coordinate_source: 'Approximate',
      coordinate_status: 'APPROXIMATE_REFERENCE',
      longitude_normalized_deg: -166,
      south_polar: true,
      local_lola_coverage: true,
      local_lola_tile: 'a.tif',
      geometric_analysis_supported: true,
      cartesian_me: { x_m: 0, y_m: 0, z_m: -1737400, radius_m: 1737400, frame: 'MOON_ME' },
      not_nasa_landing_recommendation: true,
    },
  ],
}

function mockApi() {
  vi.spyOn(api, 'get').mockImplementation((url: string): Promise<unknown> => {
    if (url === '/health') return Promise.resolve({ data: { status: 'ok', components: [] } })
    if (url === '/api/v1/globe/sites') return Promise.resolve({ data: globeCatalog })
    if (url === '/api/v1/sites') return Promise.resolve({ data: { items: globeCatalog.items, total: 1 } })
    if (url === '/api/v1/data-sources') return Promise.resolve({ data: { items: [] } })
    if (url === '/api/v1/analyses') return Promise.resolve({ data: [] })
    if (url === '/openapi.json') return Promise.resolve({ data: { paths: {} } })
    if (url.startsWith('/api/v1/')) return Promise.resolve({ data: {} })
    return Promise.reject(new Error(`unexpected ${url}`))
  })
}

function renderMoon() {
  const router = createMemoryRouter(routes, { initialEntries: ['/moon'] })
  render(
    <AppProviders client={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

beforeEach(() => {
  localStorage.clear()
  useMissionStore.getState().resetDraft()
  useMissionStore.setState({ customSites: [] })
  void i18n.changeLanguage('en')
})
afterEach(() => vi.restoreAllMocks())

describe('Moon create custom point (store + UI)', () => {
  it('shows create mode controls and saves into missionStore / localStorage', async () => {
    mockApi()
    const user = userEvent.setup()
    renderMoon()

    const start = await screen.findByTestId('moon-create-start')
    expect(start).toHaveTextContent(/Create new point/i)
    await user.click(start)
    expect(await screen.findByTestId('moon-create-cancel-mode')).toBeInTheDocument()
    expect(screen.getByText(/Click the lunar surface to place a point/i)).toBeInTheDocument()

    // Persist path shared with Explorer/Planner (raycast → addCustomSite → localStorage).
    useMissionStore.getState().addCustomSite({
      name: 'Near Shackleton test',
      latitude_deg: -89.5,
      longitude_deg: -160,
    })
    expect(useMissionStore.getState().customSites).toHaveLength(1)
    expect(useMissionStore.getState().customSites[0]?.name).toBe('Near Shackleton test')

    const raw = localStorage.getItem('selenora-mission')
    expect(raw).toBeTruthy()
    expect(raw).toContain('Near Shackleton test')
    expect(raw).toContain('-89.5')
  })

  it('assigns a custom site as Planner Site B without changing Site A', async () => {
    mockApi()
    useMissionStore.setState({
      customSites: [{ id: 'custom-abc', name: 'Ridge pick', latitude_deg: -88.2, longitude_deg: 12.5 }],
      draft: {
        ...useMissionStore.getState().draft,
        siteA: { kind: 'reference', id: 'shackleton-rim-a' },
        siteB: { kind: 'reference', id: 'malapert-massif' },
      },
    })
    renderMoon()

    await waitFor(() => expect(screen.getByText('Ridge pick')).toBeInTheDocument())
    useMissionStore.getState().assignSite('siteB', { kind: 'custom', id: 'custom-abc' })
    expect(useMissionStore.getState().draft.siteA).toEqual({ kind: 'reference', id: 'shackleton-rim-a' })
    expect(useMissionStore.getState().draft.siteB).toEqual({ kind: 'custom', id: 'custom-abc' })
  })

  it('renders Turkish create CTA', async () => {
    mockApi()
    await i18n.changeLanguage('tr')
    renderMoon()
    expect(await screen.findByTestId('moon-create-start')).toHaveTextContent('Yeni nokta oluştur')
  })
})
