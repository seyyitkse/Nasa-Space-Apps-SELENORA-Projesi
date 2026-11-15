import { describe, expect, it } from 'vitest'

import {
  circleRadiusForLatitude,
  imagePlacement,
  POLAR_RADIUS_M,
  PREVIEW_CENTER,
  PREVIEW_LAT_LIMIT,
  PREVIEW_RADIUS,
  PREVIEW_SIZE,
  projectPreview,
} from './polarPreviewGeometry'

describe('Mission Control geographic polar preview', () => {
  it('centres the south pole and uses the true 80°S boundary without fit padding', () => {
    expect(PREVIEW_SIZE).toBe(720)
    expect(PREVIEW_LAT_LIMIT).toBe(-80)
    expect(projectPreview(123, -90)).toEqual([360, 360])
    // Independent PyProj reference: x=y=214964.427 m at 45°E, 80°S.
    expect(POLAR_RADIUS_M).toBeCloseTo(304005.608, 2)
    expect(circleRadiusForLatitude(-80)).toBeCloseTo(PREVIEW_RADIUS, 10)
    expect(circleRadiusForLatitude(-90)).toBe(0)
  })

  it.each([
    [0, 360, 60],
    [90, 660, 360],
    [180, 360, 660],
    [-90, 60, 360],
  ])('places the %s°E boundary on its correct cardinal direction', (lon, expectedX, expectedY) => {
    const [x, y] = projectPreview(lon, -80)!
    expect(x).toBeCloseTo(expectedX, 9)
    expect(y).toBeCloseTo(expectedY, 9)
    expect(Math.hypot(x - PREVIEW_CENTER, y - PREVIEW_CENTER)).toBeCloseTo(PREVIEW_RADIUS, 9)
  })

  it('projects latitude rings stereographically rather than linearly in degrees', () => {
    expect(circleRadiusForLatitude(-85)).toBeCloseTo(149.71405830965094, 9)
    expect(circleRadiusForLatitude(-85)).not.toBeCloseTo(PREVIEW_RADIUS / 2, 3)
  })

  it('keeps the existing Shackleton Point A coordinate aligned to the image geometry', () => {
    // Existing backend PyProj reference: (-2347.488, -9415.262) m.
    const [x, y] = projectPreview(-166, -89.68)!
    expect(x).toBeCloseTo(357.68344273508, 5)
    expect(y).toBeCloseTo(369.29120557260575, 5)
    expect(projectPreview(360, -85)![0]).toBeCloseTo(projectPreview(0, -85)![0], 9)
  })

  it.each([
    [NaN, -85], [0, NaN], [Infinity, -85], [0, -Infinity],
    [0, -90.01], [0, -79.999], [0, 0], [0, 85],
  ])('rejects invalid or out-of-cap marker coordinates %s, %s', (lon, lat) => {
    expect(projectPreview(lon, lat)).toBeNull()
  })

  it('joins the four existing 384 km image quadrants at the pole with no gap or overlap', () => {
    const northWest = imagePlacement([-384000, 0, 0, 384000])
    const northEast = imagePlacement([0, 0, 384000, 384000])
    const southWest = imagePlacement([-384000, -384000, 0, 0])
    const southEast = imagePlacement([0, -384000, 384000, 0])
    expect(northWest.x + northWest.width).toBeCloseTo(northEast.x, 10)
    expect(northWest.y + northWest.height).toBeCloseTo(southWest.y, 10)
    expect(northEast.y + northEast.height).toBeCloseTo(southEast.y, 10)
    expect(southWest.x + southWest.width).toBeCloseTo(southEast.x, 10)
    expect(northEast.x).toBe(PREVIEW_CENTER)
    expect(southEast.y).toBe(PREVIEW_CENTER)
    expect(northWest.width).toBe(northWest.height)
  })

  it('fits the entire true geographic cap inside the existing prepared overview bounds', () => {
    const envelope = imagePlacement([-384000, -384000, 384000, 384000])
    expect(POLAR_RADIUS_M).toBeLessThan(384000)
    expect(envelope.x).toBeLessThan(PREVIEW_CENTER - PREVIEW_RADIUS)
    expect(envelope.y).toBeLessThan(PREVIEW_CENTER - PREVIEW_RADIUS)
    expect(envelope.x + envelope.width).toBeGreaterThan(PREVIEW_CENTER + PREVIEW_RADIUS)
    expect(envelope.y + envelope.height).toBeGreaterThan(PREVIEW_CENTER + PREVIEW_RADIUS)
  })

  it('retains a raster window’s physical aspect ratio', () => {
    const rectangle = imagePlacement([-128000, -64000, 128000, 64000])
    expect(rectangle.width / rectangle.height).toBe(2)
  })

  it.each([[0, 0, 0, 1], [0, 1, 1, 0], [0, 0, NaN, 1], [0, 0, 1]].map((bounds) => [bounds]))('rejects invalid imagery bounds %j', (bounds) => {
    expect(() => imagePlacement(bounds!)).toThrow(RangeError)
  })

  it.each([NaN, Infinity, -91, -79])('rejects out-of-cap latitude rings %s', (lat) => {
    expect(() => circleRadiusForLatitude(lat)).toThrow(RangeError)
  })
})
