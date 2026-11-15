import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RasterPreview } from '@/services/contracts'

import { RasterSourceSlot } from './RasterSourceSlot'

const fake = vi.hoisted(() => ({ sources: [] as Array<{
  listeners: Record<string, () => void>; dispose: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn>
}> }))

vi.mock('ol/source/ImageStatic', () => ({ default: class {
  listeners: Record<string, () => void> = {}
  dispose = vi.fn()
  load = vi.fn()
  constructor() { fake.sources.push(this) }
  on(type: string, listener: () => void) {
    this.listeners[type] = listener
    return { target: this, type, listener }
  }
  removeEventListener(type: string) { delete this.listeners[type] }
  getImage() { return { load: this.load } }
} }))

const preview = (name: string): RasterPreview => ({ layerId: 'lroc', renderKey: 'detail:lroc',
  blob: new Blob([name]), extent: [-10, -20, 30, 40], sizePx: '128x128', role: 'MAP_VISUALIZATION_ONLY', attribution: 'NASA' })

function setup() {
  const layer = { setSource: vi.fn() }
  let paint: (() => void) | undefined
  const map = { getView: () => ({ getResolution: () => 1 }), render: vi.fn(),
    once: (_: string, callback: () => void) => {
      paint = callback
      return { target: { removeEventListener: vi.fn() }, type: 'postrender', listener: callback }
    } }
  const status = vi.fn()
  const slot = new RasterSourceSlot(layer as unknown as ConstructorParameters<typeof RasterSourceSlot>[0],
    map as unknown as ConstructorParameters<typeof RasterSourceSlot>[1],
    {} as ConstructorParameters<typeof RasterSourceSlot>[2], status)
  return { slot, layer, status, paint: () => paint?.() }
}

beforeEach(() => {
  fake.sources.length = 0
  let serial = 0
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${++serial}`), revokeObjectURL: vi.fn() })
})

describe('OpenLayers photographic source lifetime', () => {
  it('reuses a source and object URL across unrelated React renders', () => {
    const { slot } = setup()
    const first = preview('first')
    slot.update(first)
    slot.update({ ...first, extent: [...first.extent] })
    expect(fake.sources).toHaveLength(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    slot.dispose()
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:1')
  })

  it('retains the old image until decode, reports ready only after paint, and releases retired URLs', () => {
    const { slot, layer, status, paint } = setup()
    slot.update(preview('old'))
    expect(layer.setSource).not.toHaveBeenCalled()
    fake.sources[0]!.listeners.imageloadend!()
    expect(layer.setSource).toHaveBeenCalledTimes(1)
    expect(status.mock.lastCall?.[0].status).toBe('loading')
    paint()
    expect(status.mock.lastCall?.[0].status).toBe('ready')
    slot.update(preview('new'))
    expect(layer.setSource).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    fake.sources[1]!.listeners.imageloadend!()
    paint()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    slot.dispose()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2')
  })

  it('ignores late decode completion and cleans up replaced pending images', () => {
    const { slot, layer } = setup()
    slot.update(preview('obsolete'))
    const lateCompletion = fake.sources[0]!.listeners.imageloadend!
    slot.update(preview('current'))
    lateCompletion()
    expect(layer.setSource).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    fake.sources[1]!.listeners.imageloadend!()
    expect(layer.setSource).toHaveBeenCalledExactlyOnceWith(fake.sources[1])
    slot.dispose()
  })

  it('ends loading on decode failure while preserving an already displayed image', () => {
    const { slot, layer, status, paint } = setup()
    slot.update(preview('good'))
    fake.sources[0]!.listeners.imageloadend!()
    paint()
    slot.update(preview('broken'))
    fake.sources[1]!.listeners.imageloaderror!()
    expect(status.mock.lastCall?.[0].status).toBe('error')
    expect(layer.setSource).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2')
    slot.dispose()
  })
})
