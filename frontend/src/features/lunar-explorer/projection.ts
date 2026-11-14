/**
 * Lunar south-polar stereographic projection (spherical Moon).
 *
 * - Sphere radius R = 1 737 400 m (IAU mean lunar radius; also the radius JPL
 *   Horizons uses for `coord@301` sites).
 * - True scale at the pole (k0 = 1), central meridian 0° E pointing "up"
 *   (Earth-facing side at the top of the map).
 * - Longitudes are east-positive, -180..180.
 *
 * Forward:  ρ = 2R·tan(π/4 + φ/2),  x = ρ·sin λ,  y = ρ·cos λ
 * Inverse:  φ = 2·atan(ρ / 2R) − π/2,  λ = atan2(x, y)
 *
 * This mirrors IAU2000:30120-style polar stereographic maps. We deliberately do
 * NOT use EPSG:3857 (Earth Web Mercator), which is undefined at the poles.
 */

export const MOON_RADIUS_M = 1_737_400
export const PROJECTION_CODE = 'SELENORA:MOON_SPS'
/** Map coverage: latitudes south of this bound. */
export const MAP_LAT_BOUND = -80

const DEG = Math.PI / 180

export function lonLatToXY(lonDeg: number, latDeg: number): [number, number] {
  if (latDeg > 0) throw new RangeError('South-polar projection is defined for southern latitudes only')
  const rho = 2 * MOON_RADIUS_M * Math.tan(Math.PI / 4 + (latDeg * DEG) / 2)
  return [rho * Math.sin(lonDeg * DEG), rho * Math.cos(lonDeg * DEG)]
}

export function xyToLonLat(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y)
  const lat = (2 * Math.atan(rho / (2 * MOON_RADIUS_M)) - Math.PI / 2) / DEG
  let lon = Math.atan2(x, y) / DEG
  if (lon <= -180) lon += 360
  return [rho === 0 ? 0 : lon, lat]
}

/** Half-width of the square map extent covering latitudes ≤ MAP_LAT_BOUND (+5 % margin). */
export function mapHalfExtent(boundLatDeg = MAP_LAT_BOUND): number {
  return 2 * MOON_RADIUS_M * Math.tan(Math.PI / 4 + (boundLatDeg * DEG) / 2) * 1.05
}

export function isInMapRegion(latDeg: number): boolean {
  return latDeg <= MAP_LAT_BOUND
}
