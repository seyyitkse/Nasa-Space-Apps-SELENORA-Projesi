import { MOON_RADIUS_M } from './projection'

const RAD = Math.PI / 180

/** Great-circle distance on the 1737.4 km reference sphere (metres). */
export function greatCircleM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD
  const dLon = (lon2 - lon1) * RAD
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * MOON_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 100_000 ? 0 : 2)} km` : `${m.toFixed(0)} m`
}
