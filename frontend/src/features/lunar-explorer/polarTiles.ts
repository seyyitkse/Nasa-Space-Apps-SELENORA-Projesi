import TileGrid from 'ol/tilegrid/TileGrid'

export type Bounds = [number, number, number, number]
export const WORLD_HALF = 768_000
export const WAC = 'lroc-wac-south-summer'
export const HILL = 'ldem-80s-80mpp-hill'
export const NAC = 'lroc-nac-2m-south-pole'
export const TILE_VERSION = 'phase5f2-tiles-v1'

export function tileBounds(z: number, x: number, y: number): Bounds {
  const span = WORLD_HALF / 2 ** z
  const left = -WORLD_HALF + x * span
  const top = WORLD_HALF - y * span
  return [left, top - span, left + span, top]
}

export function polarGrid(nac = false) {
  const edge = nac ? 375 : 240
  return new TileGrid({ extent: [-WORLD_HALF, -WORLD_HALF, WORLD_HALF, WORLD_HALF],
    origin: [-WORLD_HALF, WORLD_HALF], tileSize: edge,
    resolutions: Array.from({ length: nac ? 11 : 6 }, (_, z) => WORLD_HALF / edge / 2 ** z) })
}

export function intersects(a: number[], b: number[]) {
  return a[0]! < b[2]! && a[2]! > b[0]! && a[1]! < b[3]! && a[3]! > b[1]!
}

/** Coverage checks inspect real alpha pixels in the visible geographic subwindow. */
export function hasValidPixels(bounds: Bounds, view: Bounds, nodata: number, mask?: Uint8Array, edge = 240) {
  if (!intersects(bounds, view) || nodata === 1) return false
  if (nodata === 0) return true
  if (!mask) return false
  const scaleX = edge / (bounds[2] - bounds[0]), scaleY = edge / (bounds[3] - bounds[1])
  const left = Math.max(0, Math.floor((view[0] - bounds[0]) * scaleX))
  const right = Math.min(edge, Math.ceil((view[2] - bounds[0]) * scaleX))
  const top = Math.max(0, Math.floor((bounds[3] - view[3]) * scaleY))
  const bottom = Math.min(edge, Math.ceil((bounds[3] - view[1]) * scaleY))
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (mask[y * edge + x]) return true
  return false
}

/** Union of rectangles, rather than the bounding box of disjoint imagery. */
export function covers(view: Bounds, rectangles: Bounds[]): boolean {
  const xs = [...new Set([view[0], view[2], ...rectangles.flatMap((r) => [Math.max(view[0], r[0]), Math.min(view[2], r[2])])])]
    .filter((x) => x >= view[0] && x <= view[2]).sort((a, b) => a - b)
  for (let i = 1; i < xs.length; i++) {
    const mid = (xs[i - 1]! + xs[i]!) / 2
    const spans = rectangles.filter((r) => r[0] <= mid && r[2] >= mid)
      .map((r) => [Math.max(view[1], r[1]), Math.min(view[3], r[3])]).sort((a, b) => a[0]! - b[0]!)
    let end = view[1]
    for (const [bottom, top] of spans) {
      if (bottom! > end) break
      end = Math.max(end, top!)
    }
    if (end < view[3]) return false
  }
  return xs.length > 1
}

export function preparedTile(layer: string, z: number, x: number, y: number) {
  return (layer === WAC && z === 0) || ([WAC, HILL].includes(layer) && z === 1 && [1, 2].includes(x) && [1, 2].includes(y))
    || (layer === WAC && z === 5 && x >= 30 && x <= 33 && y >= 30 && y <= 34)
    || (layer === WAC && z === 4 && x >= 15 && x <= 16 && y >= 15 && y <= 17)
}

export interface BasemapStatus {
  overviewReady: boolean
  detail: 'idle' | 'loading' | 'ready' | 'failed'
  outsideLoaded: boolean
  unavailable: boolean
  fallback: boolean
  photoCoverage: 'none' | 'partial' | 'full'
  nac: 'off' | 'zoom-in' | 'loading' | 'ready' | 'no-coverage' | 'failed'
  requested: number
  loaded: number
  failed: number
  resolutionM: number
  nacResolutionM?: number
}

export const EMPTY_BASEMAP: BasemapStatus = { overviewReady: false, detail: 'idle', outsideLoaded: false,
  unavailable: false, fallback: false, photoCoverage: 'none', nac: 'off', requested: 0, loaded: 0, failed: 0, resolutionM: 3200 }
