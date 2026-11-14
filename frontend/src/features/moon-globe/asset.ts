/**
 * NASA 3D Moon asset used by the Phase 6A globe.
 *
 * Source: NASA Scientific Visualization Studio, "Moon 3D Models for Web, AR, and
 * Animation" (SVS 14959, released 2026-01-29, updated 2026-04-01). Credit: NASA's
 * Goddard Space Flight Center. Built from Lunar Reconnaissance Orbiter imagery.
 *
 * The GLB (13.8 MB) is NOT committed. `npm run fetch:moon` downloads it into
 * `public/nasa/svs-14959/` and verifies the SHA-256 below. The browser only requests
 * it after the user opens the 3D globe (lazy).
 */
export const MOON_ASSET = {
  url: '/nasa/svs-14959/moon_small.glb',
  sourcePage: 'https://svs.gsfc.nasa.gov/14959/',
  sourceFile: 'https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb',
  bytes: 13_799_876,
  sha256: '12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4',
  credit: "NASA's Goddard Space Flight Center Scientific Visualization Studio",
  svsId: 14959,
  /** Embedded base-colour texture (cube-face atlas, PNG). */
  textureSizePx: 4096,
  /** Measured from the mesh UVs (see docs/PHASE6A_INTERACTIVE_MOON_REPORT.md §3). */
  kmPerTexelGlobal: 2.4,
  kmPerTexelSouthPole: 3.3,
  /** Model units: the mesh is a sphere-ised cube of radius ≈ 1.2719 (not metres). */
  modelRadius: 1.2718640565872192,
} as const

/** Static, committed fallback image (no WebGL / asset missing): NASA SVS CGI Moon Kit colour map. */
export const MOON_FALLBACK_MAP = {
  url: '/nasa/svs-4720/lroc_color_poles_1k.jpg',
  sourcePage: 'https://svs.gsfc.nasa.gov/4720/',
  credit: "NASA's Scientific Visualization Studio (CGI Moon Kit; LRO/LROC colour map, 2019)",
  width: 1024,
  height: 512,
} as const

/** Bundled-asset fetch with real byte progress. Throws `MoonAssetError`. */
export class MoonAssetError extends Error {
  readonly kind: 'missing' | 'network' | 'parse' | 'webgl'
  constructor(kind: 'missing' | 'network' | 'parse' | 'webgl', message: string) {
    super(message)
    this.kind = kind
    this.name = 'MoonAssetError'
  }
}

export async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
  expectedBytes = 0,
): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new MoonAssetError('network', (e as Error).message)
  }
  // Vite's SPA fallback answers unknown paths with index.html (200, text/html).
  const type = res.headers.get('content-type') ?? ''
  if (res.status === 404 || type.includes('text/html')) throw new MoonAssetError('missing', `${url} is not installed`)
  if (!res.ok) throw new MoonAssetError('network', `HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || expectedBytes
  if (!res.body) {
    const buf = await res.arrayBuffer()
    onProgress(buf.byteLength, buf.byteLength)
    return buf
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out.buffer
}
