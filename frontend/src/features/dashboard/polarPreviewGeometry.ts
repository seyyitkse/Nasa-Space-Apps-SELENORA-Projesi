import { lonLatToXY, MAP_LAT_BOUND } from '@/features/lunar-explorer/projection'

export const PREVIEW_SIZE = 720
export const PREVIEW_CENTER = 360
export const PREVIEW_RADIUS = 300
export const PREVIEW_LAT_LIMIT = MAP_LAT_BOUND

/** True 80°S parallel, without the detailed map's extra fit margin. */
export const POLAR_RADIUS_M = Math.hypot(...lonLatToXY(0, PREVIEW_LAT_LIMIT))
const METRES_TO_PREVIEW = PREVIEW_RADIUS / POLAR_RADIUS_M

/** Same polar projection as Explorer; only SVG's downward y-axis is reversed. */
export function projectPreview(lonDeg: number, latDeg: number): [number, number] | null {
  if (!Number.isFinite(lonDeg) || !Number.isFinite(latDeg)
    || latDeg < -90 || latDeg > PREVIEW_LAT_LIMIT) return null
  const [x, y] = lonLatToXY(lonDeg, latDeg)
  return [PREVIEW_CENTER + x * METRES_TO_PREVIEW, PREVIEW_CENTER - y * METRES_TO_PREVIEW]
}

/** Place an existing georeferenced PNG at its exact south-polar metre bounds. */
export function imagePlacement(bounds: readonly number[]): { x: number; y: number; width: number; height: number } {
  if (bounds.length !== 4 || bounds.some((value) => !Number.isFinite(value))
    || bounds[0]! >= bounds[2]! || bounds[1]! >= bounds[3]!) {
    throw new RangeError('Preview imagery requires finite [left, bottom, right, top] metre bounds.')
  }
  const [left, bottom, right, top] = bounds as readonly [number, number, number, number]
  return {
    x: PREVIEW_CENTER + left * METRES_TO_PREVIEW,
    y: PREVIEW_CENTER - top * METRES_TO_PREVIEW,
    width: (right - left) * METRES_TO_PREVIEW,
    height: (top - bottom) * METRES_TO_PREVIEW,
  }
}

/** Geographic latitude rings within the preview's actual south-polar cap. */
export function circleRadiusForLatitude(latDeg: number): number {
  if (!Number.isFinite(latDeg) || latDeg < -90 || latDeg > PREVIEW_LAT_LIMIT) {
    throw new RangeError('Preview latitude rings must lie between the south pole and the cap boundary.')
  }
  return Math.hypot(...lonLatToXY(0, latDeg)) * METRES_TO_PREVIEW
}
