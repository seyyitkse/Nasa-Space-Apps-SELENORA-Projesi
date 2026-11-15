import type { MoonQuality } from './loadMoon'
import { fetchWithProgress, HIGH_MODEL_ID, MOON_MODELS, type MoonModel, type MoonModelId } from './asset'

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

export function maxAnisotropy(): number {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    const ext = gl?.getExtension('EXT_texture_filter_anisotropic')
    return gl && ext ? (gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) : 1
  } catch {
    return 1
  }
}

/** Model for the High tier. Measurement-only override: `?bench&highModel=hd` (not exposed in the UI). */
export function highModelId(): MoonModelId {
  if (typeof window === 'undefined') return HIGH_MODEL_ID
  const q = new URLSearchParams(window.location.search)
  const m = q.get('highModel')
  return q.has('bench') && m && m in MOON_MODELS ? (m as MoonModelId) : HIGH_MODEL_ID
}

/** "High" needs a desktop-class GPU: texture limit ≥ the high model's texture and not a phone. */
export function highSupported(): boolean {
  if (typeof window === 'undefined') return false
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const phone = window.innerWidth < 768 || (mem !== undefined && mem <= 4)
  return !phone && maxTextureSize() >= MOON_MODELS[HIGH_MODEL_ID].texturePx[0]
}

/** Phones / low-memory devices start with the reduced (2048 px) texture and DPR 1. */
export function defaultQuality(): MoonQuality {
  if (typeof window === 'undefined') return 'reduced'
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (window.innerWidth < 768 || (mem !== undefined && mem <= 4)) return 'reduced'
  return 'standard'
}

// Raw GLB bytes are cached per model for the session, so re-opening the globe or switching
// quality does not re-download (GPU resources are still disposed on every unmount).
const bufferCache = new Map<string, Promise<ArrayBuffer>>()
const listeners = new Map<string, ((loaded: number, total: number) => void)[]>()

/** Fetch (once per session) a NASA GLB, reporting byte progress to every caller. */
export function loadMoonBuffer(onProgress: (loaded: number, total: number) => void, model: MoonModel = MOON_MODELS.small): Promise<ArrayBuffer> {
  const key = model.url
  const ls = listeners.get(key) ?? []
  ls.push(onProgress)
  listeners.set(key, ls)
  let p = bufferCache.get(key)
  if (!p) {
    p = fetchWithProgress(key, (l, t) => (listeners.get(key) ?? []).forEach((f) => f(l, t)), undefined, model.bytes).catch((e: unknown) => {
      bufferCache.delete(key)
      throw e
    })
    bufferCache.set(key, p)
  }
  return p.finally(() => listeners.set(key, (listeners.get(key) ?? []).filter((f) => f !== onProgress)))
}

export function __resetMoonCache() {
  bufferCache.clear()
  listeners.clear()
}

export const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'}`
export const fmtLon = (lon: number) => `${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`
