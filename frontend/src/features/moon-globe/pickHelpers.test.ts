import { describe, expect, it } from 'vitest'

import { latLonToModel } from './orientation'
import {
  isValidLatLon,
  normalizeLonDeg,
  validateCustomSiteName,
  worldPointToLatLon,
} from './pickHelpers'

describe('worldPointToLatLon (direction → MOON_ME)', () => {
  it('round-trips Shackleton Rim A and both poles', () => {
    for (const [lat, lon] of [
      [-89.68, -166],
      [-90, 0],
      [90, 45],
      [0, 0],
      [-85.2, 53.5],
    ] as const) {
      const p = latLonToModel(lat, lon, 1.27)
      const r = worldPointToLatLon(p[0], p[1], p[2])
      expect(r.lat).toBeCloseTo(lat, 9)
      expect(r.lon).toBeCloseTo(lon, 9)
    }
  })

  it('is independent of hit radius (Standard vs High relief direction)', () => {
    const a = worldPointToLatLon(...latLonToModel(-89.68, -166, 1.0))
    const b = worldPointToLatLon(...latLonToModel(-89.68, -166, 1.35))
    expect(a.lat).toBeCloseTo(b.lat, 12)
    expect(a.lon).toBeCloseTo(b.lon, 12)
  })

  it('keeps southern latitude negative and east-positive longitude', () => {
    const south = worldPointToLatLon(...latLonToModel(-88, 120, 1))
    expect(south.lat).toBeLessThan(0)
    expect(south.lon).toBeGreaterThan(0)
    const west = worldPointToLatLon(...latLonToModel(-89, -40, 1))
    expect(west.lon).toBeLessThan(0)
  })
})

describe('normalizeLonDeg / isValidLatLon', () => {
  it('folds longitude into (−180, 180]', () => {
    expect(normalizeLonDeg(180)).toBe(180)
    expect(normalizeLonDeg(-180)).toBe(180)
    expect(normalizeLonDeg(190)).toBeCloseTo(-170, 10)
    expect(normalizeLonDeg(-190)).toBeCloseTo(170, 10)
  })

  it('rejects out-of-range coordinates', () => {
    expect(isValidLatLon(-89.68, -166)).toBe(true)
    expect(isValidLatLon(91, 0)).toBe(false)
    expect(isValidLatLon(0, 181)).toBe(false)
    expect(isValidLatLon(Number.NaN, 0)).toBe(false)
  })
})

describe('validateCustomSiteName', () => {
  it('trims and accepts unique names', () => {
    expect(validateCustomSiteName('  Ridge A  ', ['Other'])).toEqual({ ok: true, name: 'Ridge A' })
  })

  it('rejects empty and duplicate (case-insensitive)', () => {
    expect(validateCustomSiteName('   ', [])).toEqual({ ok: false, error: 'empty' })
    expect(validateCustomSiteName('Shackleton Rim — Point A', ['Shackleton Rim — Point A'])).toEqual({
      ok: false,
      error: 'duplicate',
    })
    expect(validateCustomSiteName('ridge a', ['Ridge A'])).toEqual({ ok: false, error: 'duplicate' })
  })
})
