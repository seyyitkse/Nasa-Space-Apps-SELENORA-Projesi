import { describe, it, expect } from 'vitest'
import { covers, hasValidPixels, tileBounds, polarGrid, WAC, HILL, NAC, preparedTile } from './polarTiles'

describe('Native polar tile pyramid', () => {
  it('matches backend bounds, row axis, world dimensions and source resolution', () => {
    expect(tileBounds(0, 0, 0)).toEqual([-768000, 0, 0, 768000])
    expect(tileBounds(1, 1, 1)).toEqual([-384000, 0, 0, 384000])
    expect(polarGrid().getResolution(5)).toBe(100)
    expect(polarGrid(true).getResolution(10)).toBe(2)
    expect(polarGrid().getResolution(polarGrid().getZForResolution(900, 1))).toBe(1600)
  })
  it('uses exact adjacent parent/child corners without overlap or gaps', () => {
    const p = tileBounds(2, 3, 4)
    expect(tileBounds(3, 6, 8)[0]).toBe(p[0])
    expect(tileBounds(3, 7, 9)[2]).toBe(p[2])
    expect(tileBounds(3, 6, 8)[1]).toBe(tileBounds(3, 6, 9)[3])
  })
  it('does not report disjoint raster bounding envelopes as full coverage', () => {
    expect(covers([0, 0, 10, 10], [[0, 0, 4, 10], [6, 0, 10, 10]])).toBe(false)
    expect(covers([0, 0, 10, 10], [[0, 0, 5, 10], [5, 0, 10, 10]])).toBe(true)
    expect(covers([0, 0, 10, 10], [[0, 0, 10, 4], [0, 6, 10, 10]])).toBe(false)
  })
  it('ships broad real overviews, never a fake prepared NAC tile', () => {
    expect(preparedTile(WAC, 0, 0, 0)).toBe(true)
    expect(preparedTile(HILL, 1, 1, 1)).toBe(true)
    expect(preparedTile(NAC, 0, 0, 0)).toBe(false)
    expect(preparedTile(WAC, 5, 32, 32)).toBe(true)
    expect(preparedTile(WAC, 4, 15, 16)).toBe(true)
    expect(preparedTile(WAC, 5, 40, 40)).toBe(false)
  })
  it('does not count valid pixels elsewhere in a partial tile as viewport coverage', () => {
    const mask = new Uint8Array([255, 0, 255, 0])
    expect(hasValidPixels([0, 0, 2, 2], [1, 0, 2, 2], 0.5, mask, 2)).toBe(false)
    expect(hasValidPixels([0, 0, 2, 2], [0, 0, 1, 2], 0.5, mask, 2)).toBe(true)
    expect(hasValidPixels([0, 0, 2, 2], [0, 0, 1, 2], 1)).toBe(false)
  })
})
