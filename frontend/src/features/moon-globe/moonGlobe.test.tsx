import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders, makeQueryClient } from '@/app/providers'
import { routes } from '@/app/router'
import { api } from '@/services/apiClient'
import { useMissionStore } from '@/stores/missionStore'
import { useModeStore } from '@/stores/modeStore'

import { MOON_ASSET } from './asset'
import { __resetMoonCache } from './globeUtils'
import { MoonExplorer } from './MoonExplorer'

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
  ],
  total: 2,
  coordinate_frame: '',
  longitude_convention: '',
  disclaimer: 'Reference coordinates are approximate.',
}

function mockApi() {
  vi.spyOn(api, 'get').mockImplementation((url: string, cfg?: { params?: unknown }): Promise<unknown> => {
    if (url === '/health') return Promise.resolve({ data: { status: 'ok', components: [] } })
    if (url === '/api/v1/sites') return Promise.resolve({ data: sites })
    if (url === '/api/v1/data-sources') return Promise.resolve({ data: { items: [] } })
    if (url === '/api/v1/analyses') return Promise.resolve({ data: [] })
    if (url === '/openapi.json') return Promise.resolve({ data: { paths: {} } })
    if (url === '/api/v1/terrain/coverage')
      return Promise.resolve({ data: { covered: (cfg?.params as { latitude_deg?: number } | undefined)?.latitude_deg === -89.68, latitude_deg: 0, longitude_deg: 0 } })
    return Promise.reject(new Error(`unexpected ${url}`))
  })
}

/** Pretend WebGL exists (jsdom has none) without rendering a real scene. */
function fakeWebgl() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ getParameter: () => 4096, MAX_TEXTURE_SIZE: 0x0d33 }) as unknown as RenderingContext,
  )
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
  __resetMoonCache()
  useModeStore.setState({ mode: 'explorer' })
  useMissionStore.getState().resetDraft()
  useMissionStore.getState().updateDraft({ siteA: null, siteB: null })
  void i18n.changeLanguage('en')
})
afterEach(() => vi.restoreAllMocks())

describe('3D Moon page without WebGL', () => {
  it('shows the attributed NASA static fallback and still lets users pick sites', async () => {
    mockApi()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderAt('/moon')
    const fallback = await screen.findByTestId('moon-static-fallback')
    expect(within(fallback).getByText(/cannot show 3D graphics/i)).toBeInTheDocument()
    expect(within(fallback).getByRole('img', { name: /NASA LRO colour map/i })).toHaveAttribute('src', '/nasa/svs-4720/lroc_color_poles_1k.jpg')
    expect(within(fallback).getByRole('link', { name: /Scientific Visualization Studio/i })).toHaveAttribute('href', 'https://svs.gsfc.nasa.gov/4720/')
    // Pins on the flat map use plain equirectangular placement (x ∝ lon, y ∝ −lat).
    const pin = await within(fallback).findByRole('button', { name: /Malapert/ })
    expect(parseFloat(pin.style.left)).toBeCloseTo(((2.9 + 180) / 360) * 100, 3)
    expect(parseFloat(pin.style.top)).toBeCloseTo(((90 + 86) / 180) * 100, 3)
    // The 13.8 MB model is never requested without WebGL.
    expect(fetchSpy).not.toHaveBeenCalledWith(MOON_ASSET.url, expect.anything())
  })

  it('selects a site, assigns Site A/B and links to Explorer and Planner', async () => {
    mockApi()
    const user = userEvent.setup()
    const router = renderAt('/moon')
    const list = await screen.findByRole('list', { name: 'Research sites' })
    await user.click(within(list).getByRole('button', { name: /Malapert/ }))
    expect(router.state.location.search).toBe('?site=malapert-massif')
    const card = await screen.findByTestId('moon-site-card')
    expect(within(card).getByRole('heading', { name: 'Malapert Massif (approx.)' })).toBeInTheDocument()
    expect(within(card).getByText('Approximate research coordinate')).toBeInTheDocument()
    expect(within(card).getByText('Not an official NASA landing region')).toBeInTheDocument()
    expect(within(card).getByText(/86\.0°S, 2\.9°E/)).toBeInTheDocument()
    await waitFor(() => expect(within(card).getByText(/not covered by the installed 5 m tiles/)).toBeInTheDocument())

    await user.click(within(card).getByRole('button', { name: 'Set as Site B' }))
    expect(useMissionStore.getState().draft.siteB).toEqual({ kind: 'reference', id: 'malapert-massif' })
    expect(within(card).getByRole('button', { name: 'Site B ✓' })).toHaveAttribute('aria-pressed', 'true')

    expect(within(card).getByRole('link', { name: /Open in Lunar Explorer/ })).toHaveAttribute('href', '/explorer?site=malapert-massif')
    await user.click(within(card).getByRole('link', { name: /Open Mission Planner/ }))
    expect(router.state.location.pathname).toBe('/planner')
  })

  it('reports LOLA 5 m coverage from the backend for covered sites', async () => {
    mockApi()
    renderAt('/moon?site=shackleton-rim-a')
    const card = await screen.findByTestId('moon-site-card')
    await waitFor(() => expect(within(card).getByText(/covered: terrain horizon and local 3D view available/)).toBeInTheDocument())
    expect(within(card).getByRole('button', { name: /Open local LOLA 3D terrain/ })).toBeEnabled()
  })

  it('renders the page in Turkish', async () => {
    mockApi()
    await i18n.changeLanguage('tr')
    renderAt('/moon')
    expect(await screen.findByRole('heading', { name: 'Ay’ı 3B keşfedin' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Keşif yolculuğu' })).toBeInTheDocument()
    expect(await screen.findByText(/WebGL yok/)).toBeInTheDocument()
  })
})

describe('Mission Control hero', () => {
  it('shows an attributed poster and does not download the model until opened', async () => {
    mockApi()
    fakeWebgl()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    renderAt('/')
    const poster = await screen.findByTestId('moon-hero-poster')
    expect(within(poster).getByRole('link', { name: /NASA SVS 14959/ })).toHaveAttribute('href', 'https://svs.gsfc.nasa.gov/14959/')
    expect(within(poster).getByText(/Loads a 13\.8 MB NASA model on demand/)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    await userEvent.click(within(poster).getByRole('button', { name: /Explore the 3D Moon/ }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(MOON_ASSET.url, expect.anything()))
    expect(await screen.findByRole('link', { name: /Open the full 3D Moon explorer/ })).toHaveAttribute('href', '/moon')
  })
})

function stream(total: number, chunks: number[]) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const n of chunks) c.enqueue(new Uint8Array(n))
      // never closes: the download stays "in progress"
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'model/gltf-binary', 'content-length': String(total) } })
}

describe('MoonExplorer loading states', () => {
  const props = { sites: [], selectedId: null, onSelect: () => {}, command: null, onCommand: () => {} }

  it('shows real byte progress while the NASA GLB downloads', async () => {
    fakeWebgl()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(stream(1000, [250]))
    render(<MoonExplorer {...props} />)
    const bar = await screen.findByRole('progressbar')
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '25'))
    expect(screen.getByText(/NASA SVS 14959/, { selector: 'p' })).toBeInTheDocument()
  })

  it('falls back to the static NASA map when the model is not installed (404 / SPA html)', async () => {
    fakeWebgl()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    render(<MoonExplorer {...props} />)
    const fb = await screen.findByTestId('moon-static-fallback')
    expect(within(fb).getByText(/not installed on this server/)).toBeInTheDocument()
    expect(within(fb).getByText('npm run fetch:moon')).toBeInTheDocument()
  })

  it('shows a retryable error on network failure', async () => {
    fakeWebgl()
    const f = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(() => new Promise(() => {}))
    render(<MoonExplorer {...props} />)
    expect(await screen.findByText('The NASA Moon model could not be loaded.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2))
  })

  it('supports keyboard navigation and accessible view controls', async () => {
    fakeWebgl()
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const onCommand = vi.fn()
    render(<MoonExplorer {...props} onCommand={onCommand} />)
    const host = screen.getByRole('application', { name: /Interactive 3D Moon/ })
    expect(host).toHaveAttribute('tabindex', '0')
    act(() => host.focus())
    fireEvent.keyDown(host, { key: 's' })
    fireEvent.keyDown(host, { key: 'ArrowLeft' })
    fireEvent.keyDown(host, { key: '+' })
    expect(onCommand).toHaveBeenNthCalledWith(1, { kind: 'preset', preset: 'south' })
    expect(onCommand.mock.calls[1]![0]).toMatchObject({ kind: 'orbit', dPolar: 0 })
    expect(onCommand).toHaveBeenNthCalledWith(3, { kind: 'zoom', factor: 0.85 })
    await userEvent.click(screen.getByRole('button', { name: 'South pole' }))
    expect(onCommand).toHaveBeenLastCalledWith({ kind: 'preset', preset: 'south' })
    expect(screen.getByRole('button', { name: /Latitude\/longitude grid/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('link', { name: /NASA GSFC SVS 14959/ })).toHaveAttribute('href', 'https://svs.gsfc.nasa.gov/14959/')
  })
})
