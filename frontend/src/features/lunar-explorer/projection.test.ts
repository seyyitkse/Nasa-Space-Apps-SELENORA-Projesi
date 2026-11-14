import { describe, expect, it } from 'vitest'

import { isInMapRegion, lonLatToXY, MOON_RADIUS_M, xyToLonLat } from './projection'

describe('lunar south-polar stereographic projection', () => {
  it('maps the pole to the origin', () => {
    const [x, y] = lonLatToXY(123, -90)
    expect(Math.abs(x)).toBeLessThan(1e-6)
    expect(Math.abs(y)).toBeLessThan(1e-6)
  })

  it('places 0°E straight up and 90°E to the right', () => {
    const [x0, y0] = lonLatToXY(0, -85)
    expect(Math.abs(x0)).toBeLessThan(1e-6)
    expect(y0).toBeGreaterThan(0)
    const [x90, y90] = lonLatToXY(90, -85)
    expect(x90).toBeGreaterThan(0)
    expect(Math.abs(y90)).toBeLessThan(1e-6)
  })

  it('is true-scale near the pole (1° of latitude ≈ 30.3 km)', () => {
    const [, y1] = lonLatToXY(0, -89)
    const arc = (Math.PI / 180) * MOON_RADIUS_M
    expect(Math.abs(y1 - arc) / arc).toBeLessThan(1e-4)
  })

  it.each([
    [-166, -89.68],
    [129.78, -89.67],
    [-87.1, -88.5],
    [2.9, -86],
    [179.9, -80.5],
  ])('round-trips lon=%s lat=%s', (lon, lat) => {
    const [x, y] = lonLatToXY(lon, lat)
    const [lon2, lat2] = xyToLonLat(x, y)
    expect(lat2).toBeCloseTo(lat, 9)
    expect(lon2).toBeCloseTo(lon, 9)
  })

  it('rejects northern latitudes and reports map coverage', () => {
    expect(() => lonLatToXY(0, 10)).toThrow(RangeError)
    expect(isInMapRegion(-85)).toBe(true)
    expect(isInMapRegion(-70)).toBe(false)
  })
})

describe('agreement with backend PyProj (+proj=stere +lat_0=-90 +lon_0=0, R=1737.4 km)', () => {
  // Reference values printed by backend/app/science/lunar_projection.lonlat_to_stereo (PyProj) on 2026-11-14.
  it.each([
    [-166.0, -89.68, -2347.488, -9415.262],
    [129.78, -89.67, 7690.244, -6402.723],
    [2.9, -86.0, 6139.083, 121187.293],
    [-87.1, -88.5, -45429.37, 2301.353],
    [45, -80, 214964.427, 214964.427],
  ])('lon=%s lat=%s → x=%s y=%s (±1 mm)', (lon, lat, x, y) => {
    const [px, py] = lonLatToXY(lon, lat)
    expect(Math.abs(px - x)).toBeLessThan(0.001)
    expect(Math.abs(py - y)).toBeLessThan(0.001)
  })
})
