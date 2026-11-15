import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Observable from 'ol/Observable'
import type OlMap from 'ol/Map'
import Projection from 'ol/proj/Projection'
import View from 'ol/View'
import TileState from 'ol/TileState'
import type TileLayer from 'ol/layer/Tile'
import type TileImage from 'ol/source/TileImage'
import { PolarBasemap } from './PolarBasemap'

let decoding: Array<() => void>
let manualDecode: boolean
let cleanup: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  decoding = []; manualDecode = false
  vi.stubGlobal('Image', class extends EventTarget {
    src = ''; naturalWidth = 240; naturalHeight = 240
    decode() { return manualDecode ? new Promise<void>((resolve) => decoding.push(resolve)) : Promise.resolve() }
  })
  let serial = 0
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${++serial}`), revokeObjectURL: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, headers: { get: (key: string) => key === 'content-type' ? 'image/png' : null },
    blob: async () => new Blob(['PNG'], { type: 'image/png' }) })))
  const data = new Uint8ClampedArray(240 * 240 * 4).fill(255)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), getImageData: () => ({ data }) } as unknown as CanvasRenderingContext2D)
})

afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function setup() {
  const projection = new Projection({ code: 'test-sps', units: 'm' })
  const view = new View({ projection, center: [0, 0], resolution: 100 })
  const added: TileLayer<TileImage>[] = []
  const map = Object.assign(new Observable(), { getSize: () => [240, 240], getView: () => view,
    addLayer: (layer: TileLayer<TileImage>) => added.push(layer), removeLayer: vi.fn(), render: vi.fn() })
  const status = vi.fn()
  const basemap = new PolarBasemap(map as unknown as OlMap, projection, status, vi.fn())
  cleanup = () => basemap.dispose()
  basemap.setMode('photo', 1, false)
  const source = added[1]!.getSource()!
  const tile = source.getTile(5, 32, 32, 1, projection)
  return { basemap, source, tile, view, map, status, projection, added }
}

describe('Stable polar tile sources and cancellation', () => {
  it('reuses decoded tiles/sources on UI renders and releases the temporary blob URL', async () => {
    const { tile, basemap, source, added } = setup()
    tile.load()
    await vi.advanceTimersByTimeAsync(0)
    expect(tile.getState()).toBe(TileState.LOADED)
    const image = tile.getImage()
    basemap.setMode('photo', 1, false)
    tile.load()
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(added[1]!.getSource()).toBe(source)
    expect(tile.getImage()).toBe(image)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:1')
  })

  it('an obsolete decode cannot overwrite a successful revisit of the same tile', async () => {
    const { tile, view, map } = setup()
    manualDecode = true
    tile.load()
    await vi.advanceTimersByTimeAsync(0)
    expect(decoding).toHaveLength(1)
    view.setCenter([200000, 200000]); map.dispatchEvent('moveend')
    await vi.advanceTimersByTimeAsync(300)
    expect(tile.getState()).toBe(TileState.ERROR)
    manualDecode = false
    view.setCenter([0, 0]); map.dispatchEvent('moveend')
    await vi.advanceTimersByTimeAsync(300)
    expect(tile.getState()).toBe(TileState.LOADED)
    const replacement = tile.getImage()
    decoding[0]!()
    await vi.advanceTimersByTimeAsync(0)
    expect(tile.getState()).toBe(TileState.LOADED)
    expect(tile.getImage()).toBe(replacement)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('ends detail loading after an upstream failure and retries only on request', async () => {
    const { source, projection, status, basemap } = setup()
    vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'))
    const tile = source.getTile(5, 31, 32, 1, projection)
    tile.load()
    await vi.advanceTimersByTimeAsync(600)
    expect(tile.getState()).toBe(TileState.ERROR)
    expect(status.mock.calls.at(-1)![0].detail).toBe('failed')
    const count = vi.mocked(fetch).mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(count)
    basemap.retry()
    await vi.advanceTimersByTimeAsync(300)
    expect(fetch).toHaveBeenCalledTimes(count + 1)
  })
})
