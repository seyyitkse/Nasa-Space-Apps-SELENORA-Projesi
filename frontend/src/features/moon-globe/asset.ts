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

export type MoonModelId = 'small' | 'hd' | 'topo'

/** Per-asset facts, all MEASURED with scripts/moon-validation (see docs/PHASE6A1_MOON_QUALITY_REPORT.md). */
export interface MoonModel {
  id: MoonModelId
  file: string
  url: string
  sourceFile: string
  bytes: number
  sha256: string
  triangles: number
  vertices: number
  texturePx: [number, number]
  textureFormat: 'png' | 'jpeg'
  /** Ground resolution of the texture (km per texel, median). */
  kmPerTexel: { global: number; southPole: number }
  /** Rotation (rows) taking model axes to SELENORA's canonical frame (north +Y, 0°E −Z, 90°E −X). */
  canonicalFromModel: [[number, number, number], [number, number, number], [number, number, number]]
  /** Uniform scale so the model's mean lunar radius equals MOON_MODELS.small.modelRadius. */
  scale: number
  /** Mean radius in model units. */
  modelRadius: number
  /**
   * 'mesh': vertex positions are correct as published.
   * 'uv-equirect': polar vertices are pinched (up to 46 km off their texture/relief content);
   * positions are rebuilt from the UV-implied lat/lon, keeping each vertex radius.
   */
  registration: 'mesh' | 'uv-equirect'
  /** Relief derived from LOLA (null = smooth sphere). r = r0 + perKm · h_km in model units. */
  relief: null | { r0: number; perKm: number; exaggeration: number; corrWithLola: number }
}

const SVS = 'https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/'
const I3: MoonModel['canonicalFromModel'] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

export const MOON_MODELS: Record<MoonModelId, MoonModel> = {
  small: {
    id: 'small',
    file: 'moon_small.glb',
    url: '/nasa/svs-14959/moon_small.glb',
    sourceFile: `${SVS}moon_small.glb`,
    bytes: 13_799_876,
    sha256: '12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4',
    triangles: 23_232,
    vertices: 46_464,
    texturePx: [4096, 4096],
    textureFormat: 'png',
    kmPerTexel: { global: 2.4, southPole: 3.3 },
    canonicalFromModel: I3,
    scale: 1,
    modelRadius: 1.2718640565872192,
    registration: 'mesh',
    relief: null,
  },
  // Evaluated, NOT offered: its texture is byte-identical to moon_small's (same SHA-256), so 4× the
  // download only buys a smoother silhouette (1.49 M triangles), not sharper imagery.
  hd: {
    id: 'hd',
    file: 'moon.glb',
    url: '/nasa/svs-14959/moon.glb',
    sourceFile: `${SVS}moon.glb`,
    bytes: 53_884_300,
    sha256: 'f026a938cf8eda574ab3e7aa0c645c9f506d2b0f2e06d2f25ab1fb1dc417bb7c',
    triangles: 1_486_848,
    vertices: 745_889,
    texturePx: [4096, 4096],
    textureFormat: 'png',
    kmPerTexel: { global: 2.4, southPole: 3.3 },
    canonicalFromModel: I3,
    scale: 1,
    modelRadius: 1.2718640565872192,
    registration: 'mesh',
    relief: null,
  },
  topo: {
    id: 'topo',
    file: 'Moon_NASA_LRO_8k_Topo_Small.glb',
    url: '/nasa/svs-14959/Moon_NASA_LRO_8k_Topo_Small.glb',
    sourceFile: `${SVS}Moon_NASA_LRO_8k_Topo_Small.glb`,
    bytes: 81_505_784,
    sha256: 'c4b65fb4df622a37fd75366c2ed9bf9e163e41c0fde178b3b27e31b0173e6953',
    triangles: 1_015_808,
    vertices: 2_021_340,
    texturePx: [8192, 4096],
    textureFormat: 'jpeg',
    // Equirectangular: 180°/4096 rows = 1.33 km north–south everywhere; finer east–west toward the poles.
    kmPerTexel: { global: 1.3, southPole: 1.3 },
    // Exact from the UVs (u·360° = atan2(z, −x), residual 0.002°): +90° about +Y.
    canonicalFromModel: [
      [0, 0, 1],
      [0, 1, 0],
      [-1, 0, 0],
    ],
    scale: 1.2718640565872192 / 0.983594,
    modelRadius: 0.983594,
    registration: 'uv-equirect',
    relief: { r0: 0.983594, perKm: 0.001637, exaggeration: 2.89, corrWithLola: 0.836 },
  },
}

/** Model used by the "High" quality tier (desktop only, progressive). */
export const HIGH_MODEL_ID: MoonModelId = 'topo'

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
