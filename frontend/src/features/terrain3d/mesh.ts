/**
 * Pure geometry for the LOLA 3D viewer (no Three.js here, fully unit-tested).
 *
 * Input: GET /api/v1/maps/mesh — verified 2026-11-14:
 *   x_m[cols], y_m[rows] are absolute south-polar stereographic metres
 *   (R = 1737.4 km, lon_0 = 0); z_m[row][col] is LOLA surface height (m) point-
 *   sampled from the 5 m DEM every step_m; rows follow ascending y; cells outside
 *   the DEM tile are null. Centre / corner cells equal GET /maps/elevation exactly.
 *
 * Scene frame: X = Δx (grid east), Y = up, Z = −Δy (so grid +Y is "into" −Z).
 * Heights are relative to the observer's eye (surface + observer height) minus the
 * spherical drop R(1−cos(d/R)), i.e. the same reference the backend horizon code
 * uses. Vertical exaggeration k scales that eye-relative height, which preserves
 * every above/below relation between terrain and a sight line from the eye.
 */
import { MOON_RADIUS_M } from '../lunar-explorer/projection'

export type { MeshResponse } from '@/services/contracts'
import type { MeshResponse } from '@/services/contracts'

export const OBSERVER_HEIGHT_M = 2

export function sphereDropM(d: number, R = MOON_RADIUS_M): number {
  return R * (1 - Math.cos(d / R))
}

/** DEM tile id from /terrain/coverage → mesh layer id (local Product 78 only). */
export function meshLayerForTile(demSiteId: string | null | undefined): string | null {
  if (!demSiteId) return null
  const m = /^site(\d+)$/i.exec(demSiteId)
  return m ? `lola-site${m[1]!.padStart(2, '0')}-5mpp-surf` : null
}

/**
 * Phase 7D: prefer an explicit local 5 m layer when coverage is known; otherwise
 * let the backend auto-select the finest usable real NASA elevation DEM
 * (local Product 78 → remote Product 90 COG). Never invent a layer id.
 */
export function meshLayerForRequest(demSiteId: string | null | undefined): string {
  return meshLayerForTile(demSiteId) ?? 'auto'
}

/** Human-readable provenance line for the 3D panel. */
export function meshSourceLabel(mesh: Pick<MeshResponse, 'coverage_tier' | 'native_resolution_m' | 'dem_site_id' | 'layer_id'>): string {
  const res = mesh.native_resolution_m != null ? `${mesh.native_resolution_m} m` : null
  if (mesh.coverage_tier === 'LOCAL_5MPP') {
    return res ? `LOLA ${res} · ${mesh.dem_site_id ?? mesh.layer_id}` : `LOLA 5 m · ${mesh.dem_site_id ?? mesh.layer_id}`
  }
  if (mesh.coverage_tier === 'REMOTE_PGDA90') {
    return res ? `LOLA ${res} · PGDA 90` : `LOLA · PGDA 90 · ${mesh.layer_id}`
  }
  return mesh.layer_id
}

/** Grid bearing (clockwise from stereo +Y) of a true azimuth — backend `grid_bearing_for_true_azimuth`. */
export function gridBearingDeg(trueAzimuthDeg: number, trueNorthGridAzimuthDeg: number): number {
  return (((trueAzimuthDeg + trueNorthGridAzimuthDeg) % 360) + 360) % 360
}

/** For lon_0 = 0 south-polar stereographic, grid azimuth of true north = lon mod 360 (backend docs). */
export function trueNorthGridAzimuthDeg(longitudeDeg: number): number {
  return ((longitudeDeg % 360) + 360) % 360
}

/** Unit horizontal direction (scene X, Z) of a grid bearing. */
export function bearingToScene(bearingDeg: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180
  return [Math.sin(b), -Math.cos(b)]
}

/** Sight-line direction in exaggerated scene space (not normalised): (sin b, k·tan e, −cos b). */
export function sightDirection(bearingDeg: number, elevationDeg: number, k: number): [number, number, number] {
  const [x, z] = bearingToScene(bearingDeg)
  return [x, k * Math.tan((elevationDeg * Math.PI) / 180), z]
}

/** Bilinear sample of z at absolute stereo (x, y); null if any neighbour is null or outside. */
export function sampleZ(mesh: Pick<MeshResponse, 'x_m' | 'y_m' | 'z_m'>, x: number, y: number): number | null {
  const { x_m: xs, y_m: ys, z_m: z } = mesh
  if (xs.length < 2 || ys.length < 2) return null
  const dx = xs[1]! - xs[0]!
  const dy = ys[1]! - ys[0]!
  const fx = (x - xs[0]!) / dx
  const fy = (y - ys[0]!) / dy
  const eps = 1e-9
  if (fx < -eps || fy < -eps || fx > xs.length - 1 + eps || fy > ys.length - 1 + eps) return null
  // Points exactly on the last row/column belong to the final cell (tx/ty = 1).
  const i = Math.min(Math.max(0, Math.floor(fy)), ys.length - 2)
  const j = Math.min(Math.max(0, Math.floor(fx)), xs.length - 2)
  const z00 = z[i]?.[j], z01 = z[i]?.[j + 1], z10 = z[i + 1]?.[j], z11 = z[i + 1]?.[j + 1]
  if (z00 == null || z01 == null || z10 == null || z11 == null) return null
  const tx = fx - j
  const ty = fy - i
  return z00 * (1 - tx) * (1 - ty) + z01 * tx * (1 - ty) + z10 * (1 - tx) * ty + z11 * tx * ty
}

export interface RayProfile {
  /** Max terrain elevation angle seen from the eye (deg), within the mesh only. */
  maxDeg: number | null
  atM: number | null
  /** Distance travelled before leaving the mesh or hitting a null cell. */
  rangeM: number
  points: { d: number; deg: number }[]
}

/**
 * Terrain elevation angles along a grid bearing, from the observer eye, inside the
 * mesh extent only. A visual cross-check — the authoritative horizon is the
 * backend's 5 m, 12 km ray (horizon-profile / observer-series).
 */
export function rayProfile(mesh: MeshResponse, bearingDeg: number, eyeZ: number, stepM?: number): RayProfile {
  const [ox, oy] = mesh.origin_stereo_m
  const b = (bearingDeg * Math.PI) / 180
  const s = stepM ?? mesh.step_m / 2
  const points: { d: number; deg: number }[] = []
  let maxDeg: number | null = null
  let atM: number | null = null
  let rangeM = 0
  for (let d = s; d <= mesh.half_extent_m * Math.SQRT2; d += s) {
    const z = sampleZ(mesh, ox + d * Math.sin(b), oy + d * Math.cos(b))
    if (z === null) break
    const deg = (Math.atan2(z - eyeZ - sphereDropM(d), d) * 180) / Math.PI
    points.push({ d, deg })
    rangeM = d
    if (maxDeg === null || deg > maxDeg) {
      maxDeg = deg
      atM = d
    }
  }
  return { maxDeg, atM, rangeM, points }
}

export interface TerrainGeometry {
  positions: Float32Array
  /** Normalised 0..1 height for colouring. */
  heights: Float32Array
  indices: Uint32Array
  minZ: number
  maxZ: number
  nullCount: number
  /** Scene-space half-size (m) of the mesh footprint. */
  halfSize: number
}

export function buildTerrainGeometry(mesh: MeshResponse, eyeZ: number, k: number): TerrainGeometry {
  const { x_m: xs, y_m: ys, z_m: z } = mesh
  const [ox, oy] = mesh.origin_stereo_m
  const rows = ys.length
  const cols = xs.length
  const positions = new Float32Array(rows * cols * 3)
  const heights = new Float32Array(rows * cols)
  let minZ = Infinity
  let maxZ = -Infinity
  let nullCount = 0
  for (const row of z)
    for (const v of row) {
      if (v == null) nullCount++
      else {
        if (v < minZ) minZ = v
        if (v > maxZ) maxZ = v
      }
    }
  const span = Math.max(1, maxZ - minZ)
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const p = i * cols + j
      const dx = xs[j]! - ox
      const dy = ys[i]! - oy
      const v = z[i]?.[j]
      const d = Math.hypot(dx, dy)
      positions[p * 3] = dx
      positions[p * 3 + 1] = v == null ? 0 : (v - eyeZ - sphereDropM(d)) * k
      positions[p * 3 + 2] = -dy
      heights[p] = v == null ? 0 : (v - minZ) / span
    }
  const idx: number[] = []
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j
      const b = a + 1
      const c = a + cols
      const d2 = c + 1
      if ([a, b, c, d2].some((q) => z[Math.floor(q / cols)]?.[q % cols] == null)) continue
      // Winding chosen so faces point up after the y→−z flip.
      idx.push(a, b, c, b, d2, c)
    }
  return {
    positions,
    heights,
    indices: Uint32Array.from(idx),
    minZ: Number.isFinite(minZ) ? minZ : 0,
    maxZ: Number.isFinite(maxZ) ? maxZ : 0,
    nullCount,
    halfSize: mesh.half_extent_m,
  }
}

/** Mesh request (half-extent, spacing) presets that stay within the backend's 20 000-vertex guard. */
export const MESH_PRESETS = [
  { halfExtentM: 1000, stepM: 25 },
  { halfExtentM: 2000, stepM: 50 },
  { halfExtentM: 5000, stepM: 100 },
] as const

export function vertexCount(halfExtentM: number, stepM: number): number {
  const n = Math.floor((2 * halfExtentM) / stepM + 0.5) + 1
  return n * n
}
