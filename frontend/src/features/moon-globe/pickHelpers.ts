/**
 * Pure helpers for 3D Moon surface picks → MOON_ME planetocentric lat/lon.
 * Geographic coordinates are derived from the direction vector (model axes),
 * never from texture UVs, so Standard/High mesh swaps do not change saved coords.
 */

import { modelToLatLon, type Vec3 } from './orientation'

/** East-positive longitude into (−180, 180]. */
export function normalizeLonDeg(lonDeg: number): number {
  let lon = ((lonDeg + 180) % 360 + 360) % 360 - 180
  if (lon <= -180) lon += 360
  return lon
}

export function isValidLatLon(latDeg: number, lonDeg: number): boolean {
  return Number.isFinite(latDeg) && Number.isFinite(lonDeg) && latDeg >= -90 && latDeg <= 90 && lonDeg >= -180 && lonDeg <= 180
}

/**
 * World-space intersection (Moon centred at origin in the verified model frame)
 * → planetocentric latitude / east-positive longitude.
 */
export function worldPointToLatLon(x: number, y: number, z: number): { lat: number; lon: number } {
  const { lat, lon } = modelToLatLon([x, y, z] as Vec3)
  return { lat, lon: normalizeLonDeg(lon) }
}

export type CustomSiteNameError = 'empty' | 'duplicate'

/** Trimmed name uniqueness against reference + existing custom site names (case-insensitive). */
export function validateCustomSiteName(
  name: string,
  existingNames: string[],
): { ok: true; name: string } | { ok: false; error: CustomSiteNameError } {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'empty' }
  const key = trimmed.toLowerCase()
  if (existingNames.some((n) => n.trim().toLowerCase() === key)) return { ok: false, error: 'duplicate' }
  return { ok: true, name: trimmed }
}

/** Movement threshold (CSS px) below which a pointer-up is treated as a surface pick, not an orbit drag. */
export const PICK_DRAG_THRESHOLD_PX = 6
