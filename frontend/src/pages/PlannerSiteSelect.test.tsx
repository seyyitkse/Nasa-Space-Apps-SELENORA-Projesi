import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders, makeQueryClient } from '@/app/providers'
import { routes } from '@/app/router'
import { api } from '@/services/apiClient'
import { useMissionStore } from '@/stores/missionStore'

const sites = {
  items: [
    {
      id: 'shackleton-rim-a',
      name: 'Shackleton Rim — Point A',
      latitude_deg: -89.68,
      longitude_deg: -166,
      region: 'South Polar Region',
      description: '',
      coordinate_source: 'Approximate; after Bussey et al. (2010)',
      coordinate_status: 'APPROXIMATE_REFERENCE',
    },
    {
      id: 'malapert-massif',
      name: 'Malapert Massif (approx.)',
      latitude_deg: -86,
      longitude_deg: 2.9,
      region: 'South Polar Region',
      description: '',
      coordinate_source: 'Approximate location (rounded)',
      coordinate_status: 'APPROXIMATE_REFERENCE',
    },
    {
      id: 'bussey-2010-point-d',
      name: 'Bussey 2010 Point D — Shackleton ridge (most lit in 2020 map)',
      latitude_deg: -88.74,
      longitude_deg: 124.5,
      region: 'South Polar Region',
      description: '',
      coordinate_source: 'Approximate',
      coordinate_status: 'APPROXIMATE_REFERENCE',
    },
  ],
  total: 3,
  coordinate_frame: 'MOON_ME',
  longitude_convention: 'east-positive',
  disclaimer: 'Reference coordinates are approximate.',
}

function mockApi() {
  vi.spyOn(api, 'get').mockImplementation((url: string): Promise<unknown> => {
    if (url === '/health') return Promise.resolve({ data: { status: 'ok', components: [] } })
    if (url === '/api/v1/sites') return Promise.resolve({ data: sites })
    if (url === '/api/v1/data-sources') return Promise.resolve({ data: { items: [] } })
    if (url === '/api/v1/analyses') return Promise.resolve({ data: [] })
    if (url === '/openapi.json') return Promise.resolve({ data: { paths: {} } })
    return Promise.reject(new Error(`unexpected ${url}`))
  })
}

function renderPlanner() {
  const router = createMemoryRouter(routes, { initialEntries: ['/planner'] })
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
  useMissionStore.setState({
    customSites: [{ id: 'custom-ridge-1', name: 'Ridge candidate 1', latitude_deg: -89.1, longitude_deg: -150 }],
  })
  void i18n.changeLanguage('en')
})
afterEach(() => vi.restoreAllMocks())

describe('Planner A/B site selects (dark-theme Radix)', () => {
  it('opens Site A menu with readable reference and custom options', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPlanner()

    const trigger = await screen.findByTestId('planner-siteA-trigger')
    expect(trigger).toHaveAttribute('data-state', 'closed')
    await user.click(trigger)

    const list = await screen.findByRole('listbox')
    expect(list.className).toMatch(/bg-bg-2/)
    expect(within(list).getByText('Shackleton Rim — Point A')).toBeInTheDocument()
    expect(within(list).getByText('Bussey 2010 Point D — Shackleton ridge (most lit in 2020 map)')).toBeInTheDocument()
    expect(within(list).getByText('Ridge candidate 1')).toBeInTheDocument()
    expect(within(list).getByText('Reference sites')).toBeInTheDocument()
    expect(within(list).getByText('Your sites')).toBeInTheDocument()
  })

  it('selects a different Site B option via pointer and keeps Site A', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPlanner()

    expect(useMissionStore.getState().draft.siteA).toEqual({ kind: 'reference', id: 'shackleton-rim-a' })
    await user.click(await screen.findByTestId('planner-siteB-trigger'))
    await user.click(await screen.findByRole('option', { name: /Bussey 2010 Point D/ }))

    expect(useMissionStore.getState().draft.siteB).toEqual({ kind: 'reference', id: 'bussey-2010-point-d' })
    expect(useMissionStore.getState().draft.siteA).toEqual({ kind: 'reference', id: 'shackleton-rim-a' })
    expect(await screen.findByTestId('planner-siteB-trigger')).toHaveTextContent(/Bussey 2010 Point D/)
  })

  it('selects a custom coordinate site for Site A', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPlanner()

    await user.click(await screen.findByTestId('planner-siteA-trigger'))
    await user.click(await screen.findByRole('option', { name: 'Ridge candidate 1' }))

    expect(useMissionStore.getState().draft.siteA).toEqual({ kind: 'custom', id: 'custom-ridge-1' })
  })

  it('renders Turkish labels for the site selects', async () => {
    mockApi()
    await i18n.changeLanguage('tr')
    renderPlanner()

    expect(await screen.findByRole('heading', { name: 'Görev Planlayıcı' })).toBeInTheDocument()
    expect(screen.getByText('İniş Noktası A')).toBeInTheDocument()
    expect(screen.getByText('İniş Noktası B')).toBeInTheDocument()
  })
})
