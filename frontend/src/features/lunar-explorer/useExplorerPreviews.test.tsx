import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { contractApi, type MapLayer, type RasterPreview } from '@/services/contracts'

import { DEFAULT_LAYERS } from './LunarMap'
import { STARTUP_BOUNDS, useExplorerPreviews } from './useExplorerPreviews'

const photo = 'lroc-wac-south-summer'
const hill = 'ldem-80s-80mpp-hill'
const catalog = [
  { id: photo, kind: 'imagery', role: 'MAP_VISUALIZATION_ONLY', access_mode: 'wms_allowlisted' },
  { id: hill, kind: 'hillshade', role: 'MAP_VISUALIZATION_ONLY', access_mode: 'vsicurl_window' },
] as MapLayer[]
const layers = { ...DEFAULT_LAYERS, rasters: { [photo]: true } }
const firstBounds: [number, number, number, number] = [-30000, -26000, 18000, 6000]
const secondBounds: [number, number, number, number] = [-50000, -26000, -2000, 6000]

function image(id: string, extent: RasterPreview['extent']): RasterPreview {
  return { layerId: id, blob: new Blob([id + extent.join()]), extent, sizePx: '128x128',
    role: 'MAP_VISUALIZATION_ONLY', attribution: 'NASA' }
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => vi.restoreAllMocks())

describe('Explorer preview requests and display states', () => {
  it('starts with just the prepared overviews until the user explores', async () => {
    const request = vi.spyOn(contractApi, 'mapPreview').mockImplementation(async (id, bounds) => image(id, bounds))
    const { result } = renderHook(() => useExplorerPreviews(catalog, layers, firstBounds, true, photo, hill, false), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.previews).toHaveLength(2))
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls.every((call) => call[1] === STARTUP_BOUNDS)).toBe(true)
  })

  it('keeps stable descriptors on an unrelated render, and waits for actual display', async () => {
    vi.spyOn(contractApi, 'mapPreview').mockImplementation(async (id, bounds) => image(id, bounds))
    const { result, rerender } = renderHook(() => useExplorerPreviews(catalog, layers, firstBounds, true, photo, hill), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.previews).toHaveLength(4))
    expect(result.current.previewStatus[photo]).toBe('loading')
    const collection = result.current.previews
    rerender()
    expect(result.current.previews).toBe(collection)
    const detail = result.current.previews.find((item) => item.renderKey === `detail:${photo}`)!
    act(() => result.current.onRasterStatus({ key: detail.renderKey!, preview: detail, status: 'ready' }))
    expect(result.current.previewStatus[photo]).toBe('ready')
    expect(result.current.fallback).toBe(false)
  })

  it('cancels obsolete viewport work and ignores a late old response', async () => {
    let oldSignal: AbortSignal | undefined
    let resolveOld: ((value: RasterPreview) => void) | undefined
    vi.spyOn(contractApi, 'mapPreview').mockImplementation((id, bounds, _edge, signal) => {
      if (id === photo && bounds === firstBounds) {
        oldSignal = signal
        return new Promise((resolve) => { resolveOld = resolve })
      }
      return Promise.resolve(image(id, bounds))
    })
    const { result, rerender } = renderHook(({ bounds }) => useExplorerPreviews(catalog, layers, bounds, true, photo, hill),
      { wrapper: wrapper(), initialProps: { bounds: firstBounds } })
    await waitFor(() => expect(oldSignal).toBeDefined())
    rerender({ bounds: secondBounds })
    await waitFor(() => expect(result.current.previews.find((item) => item.renderKey === `detail:${photo}`)?.extent).toEqual(secondBounds))
    expect(oldSignal!.aborted).toBe(true)
    await act(async () => { resolveOld!(image(photo, firstBounds)) })
    expect(result.current.previews.find((item) => item.renderKey === `detail:${photo}`)?.extent).toEqual(secondBounds)
  })

  it('ends loading on LROC failure, leaves genuine hillshade enabled, and supports retry', async () => {
    const request = vi.spyOn(contractApi, 'mapPreview').mockImplementation(async (id, bounds) => {
      if (id === photo) throw new Error('LROC upstream unavailable')
      return image(id, bounds)
    })
    const { result } = renderHook(() => useExplorerPreviews(catalog, layers, firstBounds, true, photo, hill), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.photoFailed).toBe(true))
    expect(result.current.previewStatus[photo]).toBe('error')
    expect(result.current.effectiveLayers.rasters[hill]).toBe(true)
    expect(result.current.previews.some((item) => item.layerId === hill)).toBe(true)
    request.mockImplementation(async (id, bounds) => image(id, bounds))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.photoFailed).toBe(false))
  })

  it('reuses cached photo payloads when switching Hillshade → Photo', async () => {
    const request = vi.spyOn(contractApi, 'mapPreview').mockImplementation(async (id, bounds) => image(id, bounds))
    const { result, rerender } = renderHook(({ photoOn }) => useExplorerPreviews(catalog,
      { ...layers, rasters: { [photo]: photoOn, [hill]: !photoOn } }, STARTUP_BOUNDS, true, photo, hill),
    { wrapper: wrapper(), initialProps: { photoOn: true } })
    await waitFor(() => expect(result.current.previews).toHaveLength(2))
    const blob = result.current.previews.find((item) => item.layerId === photo)!.blob
    const count = request.mock.calls.length
    rerender({ photoOn: false })
    rerender({ photoOn: true })
    expect(result.current.previews.find((item) => item.layerId === photo)!.blob).toBe(blob)
    expect(request).toHaveBeenCalledTimes(count)
  })
})
