import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSites } from '@/hooks/useApi'
import type { LandingSiteList } from '@/types/api'

import { PREVIEW_CENTER, PREVIEW_RADIUS, projectPreview } from './polarPreviewGeometry'
import SouthPolePreview from './SouthPolePreview'

vi.mock('@/hooks/useApi', () => ({ useSites: vi.fn() }))

const liveSite = {
  id: 'live-site', name: 'Live research site', latitude_deg: -86, longitude_deg: 53.5,
  region: 'South Polar Region', description: 'Reference fixture',
  coordinate_source: 'Verified API test fixture', coordinate_status: 'APPROXIMATE_REFERENCE',
}
const liveCatalog: LandingSiteList = {
  items: [liveSite], total: 1, coordinate_frame: 'MOON_ME', longitude_convention: 'east-positive',
  disclaimer: 'Reference coordinates are approximate.',
}

function setQuery(data?: LandingSiteList, isError = false) {
  vi.mocked(useSites).mockReturnValue({ data, isError, error: isError ? new Error('API offline') : null,
    isPending: !data && !isError, isFetching: false } as ReturnType<typeof useSites>)
}

function LocationReadout() {
  const location = useLocation()
  return <output data-testid="current-route">{location.pathname}{location.search}</output>
}

function ui() {
  return <MemoryRouter><SouthPolePreview /><LocationReadout /></MemoryRouter>
}

function images() {
  return [...screen.getByTestId('south-polar-preview').querySelectorAll('foreignObject img')]
}

function wacImages() {
  return images().filter((image) => image.getAttribute('src')?.includes('lroc-wac-south-summer-1-'))
}

function rasterFrame(image: Element) {
  return image.closest('foreignObject')!
}

async function openSiteList() {
  const details = screen.getByTestId('south-pole-card').querySelector('details')!
  if (!details.open) await userEvent.click(details.querySelector('summary')!)
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  setQuery(liveCatalog)
})

describe('Mission Control polar overview', () => {
  it('places four existing local WAC quadrants under the geographic 80S clip', () => {
    render(ui())
    const svg = screen.getByTestId('south-polar-preview')
    const clipCircle = svg.querySelector('clipPath circle')!
    expect(clipCircle).toHaveAttribute('cx', String(PREVIEW_CENTER))
    expect(clipCircle).toHaveAttribute('cy', String(PREVIEW_CENTER))
    expect(clipCircle).toHaveAttribute('r', String(PREVIEW_RADIUS))
    expect(wacImages()).toHaveLength(4)
    const paths = wacImages().map((image) => image.getAttribute('src')!)
    expect(new Set(paths).size).toBe(4)
    expect(paths.every((path) => path.startsWith('/lunar-overview/'))).toBe(true)
    for (const image of wacImages()) expect(image.closest('[clip-path]')).not.toBeNull()
    expect(screen.getByTestId('south-pole-card')).toHaveTextContent(/NASA/)
  })

  it('uses the matching LOLA quadrant at unchanged geographic placement after WAC fails', () => {
    render(ui())
    const photo = wacImages().find((image) => image.getAttribute('src')!.includes('-1-1-1.png'))!
    const placement = Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, rasterFrame(photo).getAttribute(key)]))
    fireEvent.error(photo)
    const fallback = images().find((image) => image.getAttribute('src')?.includes('ldem-80s-80mpp-hill-1-1-1.png'))!
    expect(fallback).toBeDefined()
    for (const [key, value] of Object.entries(placement)) expect(rasterFrame(fallback)).toHaveAttribute(key, value)
    expect(wacImages()).toHaveLength(3)
    expect(screen.getByTestId('south-pole-card')).toHaveTextContent(/LOLA/)
  })

  it('reports unavailable imagery instead of inventing a texture when both sources fail', () => {
    render(ui())
    for (const photo of wacImages()) fireEvent.error(photo)
    const hillshade = images().filter((image) => image.getAttribute('src')?.includes('ldem-80s-80mpp-hill'))
    expect(hillshade).toHaveLength(4)
    for (const image of hillshade) fireEvent.error(image)
    expect(screen.getByTestId('south-pole-card')).toHaveTextContent(/unavailable|not available|could not|missing/i)
    expect(images().every((image) => !image.getAttribute('src')?.includes('lroc-wac'))).toBe(true)
  })

  it('preserves the image elements and URLs across unrelated rerenders', () => {
    const view = render(ui())
    const initial = wacImages()
    const paths = initial.map((image) => image.getAttribute('src'))
    view.rerender(ui())
    wacImages().forEach((image, index) => expect(image).toBe(initial[index]))
    expect(wacImages().map((image) => image.getAttribute('src'))).toEqual(paths)
  })

  it('places API site markers in projected coordinates and omits sites outside the geographic cap', async () => {
    setQuery({ ...liveCatalog, items: [liveSite,
      { ...liveSite, id: 'cap-edge', name: '80S boundary site', latitude_deg: -80, longitude_deg: 90 },
      { ...liveSite, id: 'outside-cap', name: 'Outside preview cap', latitude_deg: -79 },
    ], total: 3 })
    render(ui())
    const svg = screen.getByTestId('south-polar-preview')
    const marker = within(svg).getByRole('link', { name: liveSite.name })
    const [x, y] = projectPreview(liveSite.longitude_deg, liveSite.latitude_deg)!
    for (const circle of marker.querySelectorAll('circle')) {
      expect(Number(circle.getAttribute('cx'))).toBeCloseTo(x, 8)
      expect(Number(circle.getAttribute('cy'))).toBeCloseTo(y, 8)
    }
    const boundary = within(svg).getByRole('link', { name: '80S boundary site' }).querySelector('circle')!
    expect(Number(boundary.getAttribute('cx'))).toBeCloseTo(PREVIEW_CENTER + PREVIEW_RADIUS, 8)
    expect(Number(boundary.getAttribute('cy'))).toBeCloseTo(PREVIEW_CENTER, 8)
    await openSiteList()
    expect(screen.queryByRole('link', { name: 'Outside preview cap' })).not.toBeInTheDocument()
  })

  it('announces a ready photo after a quadrant loads and records only the first paint time', () => {
    render(ui())
    const card = screen.getByTestId('south-pole-card')
    const status = within(card).getByRole('status')
    expect(status).toHaveTextContent(/Preparing/)
    fireEvent(wacImages()[0]!, new Event('load', { bubbles: false }))
    expect(status).toHaveTextContent(/LROC WAC/)
    expect(status).not.toHaveTextContent(/Preparing/)
    const firstPaint = card.getAttribute('data-first-surface-ms')
    expect(firstPaint).not.toBeNull()
    expect(Number(firstPaint)).toBeGreaterThanOrEqual(0)
    fireEvent.load(wacImages()[1]!)
    expect(card).toHaveAttribute('data-first-surface-ms', firstPaint)
  })

  it('keeps the successful LOLA source after late events from its retired WAC element', () => {
    render(ui())
    const photo = wacImages()[0]!
    const quadrant = rasterFrame(photo).getAttribute('data-quadrant')!
    fireEvent.error(photo)
    const fallback = images().find((image) => rasterFrame(image).getAttribute('data-quadrant') === quadrant)!
    fireEvent.load(fallback)
    fireEvent.load(photo)
    fireEvent.error(photo)
    expect(images().find((image) => rasterFrame(image).getAttribute('data-quadrant') === quadrant)).toBe(fallback)
    expect(fallback.getAttribute('src')).toContain('ldem-80s-80mpp-hill')
    expect(within(screen.getByTestId('south-pole-card')).getByRole('status')).toHaveTextContent(/LOLA/)
  })

  it('keeps the prepared map and clearly labelled reference snapshot when the API is offline', async () => {
    setQuery(undefined, true)
    render(ui())
    expect(wacImages()).toHaveLength(4)
    const card = screen.getByTestId('south-pole-card')
    expect(card).toHaveTextContent(/offline|snapshot|cached/i)
    await openSiteList()
    expect(within(card).getAllByRole('link', { name: /Shackleton Rim — Point A/ }).length).toBeGreaterThan(0)
    expect(card).toHaveTextContent(/approximate/i)
  })

  it('uses authoritative live sites, including an intentionally empty catalog', () => {
    const view = render(ui())
    expect(screen.getAllByRole('link', { name: /Live research site/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /Shackleton Rim — Point A/ })).not.toBeInTheDocument()
    setQuery({ ...liveCatalog, items: [], total: 0 })
    view.rerender(ui())
    expect(screen.queryByRole('link', { name: /Live research site/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Shackleton Rim — Point A/ })).not.toBeInTheDocument()
  })

  it('preserves site navigation and exposes Explorer and 3D Moon actions', async () => {
    render(ui())
    const card = screen.getByTestId('south-pole-card')
    expect(within(card).getByRole('link', { name: /Lunar Explorer/ })).toHaveAttribute('href', '/explorer')
    expect(within(card).getByRole('link', { name: /3D Moon/ })).toHaveAttribute('href', '/moon')
    const marker = within(screen.getByTestId('south-polar-preview')).getByRole('link', { name: /Live research site/ })
    expect(marker).toHaveAttribute('href', '/explorer?site=live-site')
    await userEvent.click(marker)
    expect(screen.getByTestId('current-route')).toHaveTextContent('/explorer?site=live-site')
  })

  it('offers a keyboard-focusable HTML site link as an alternative to clustered SVG markers', async () => {
    render(ui())
    await openSiteList()
    const card = screen.getByTestId('south-pole-card')
    const siteLink = within(card).getAllByRole('link', { name: /Live research site/ }).find((link) => link.namespaceURI === 'http://www.w3.org/1999/xhtml')!
    expect(siteLink).toBeDefined()
    expect(siteLink.tabIndex).toBeGreaterThanOrEqual(0)
    siteLink.focus()
    expect(siteLink).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('current-route')).toHaveTextContent('/explorer?site=live-site')
  })
})
