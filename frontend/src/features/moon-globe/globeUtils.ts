import type { MoonQuality } from './loadMoon'
import { fetchWithProgress, MOON_ASSET } from './asset'

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

export function maxTextureSize(): number {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    return gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 0
  } catch {
    return 0
  }
}

/** Phones / low-memory devices start with the reduced (2048 px) texture and DPR 1. */
export function defaultQuality(): MoonQuality {
  if (typeof window === 'undefined') return 'reduced'
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (window.innerWidth < 768 || (mem !== undefined && mem <= 4)) return 'reduced'
  return 'standard'
}

// Raw GLB bytes are cached for the session so re-opening the globe or switching quality
// does not re-download 13.8 MB (GPU resources are still disposed on every unmount).
let bufferCache: Promise<ArrayBuffer> | null = null
let listeners: ((loaded: number, total: number) => void)[] = []

/** Fetch (once per session) the NASA GLB, reporting byte progress to every caller. */
export function loadMoonBuffer(onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  listeners.push(onProgress)
  bufferCache ??= fetchWithProgress(MOON_ASSET.url, (l, t) => listeners.forEach((f) => f(l, t)), undefined, MOON_ASSET.bytes).catch((e: unknown) => {
    bufferCache = null
    throw e
  })
  return bufferCache.finally(() => {
    listeners = listeners.filter((f) => f !== onProgress)
  })
}

export function __resetMoonCache() {
  bufferCache = null
  listeners = []
}

export const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'}`
export const fmtLon = (lon: number) => `${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`
