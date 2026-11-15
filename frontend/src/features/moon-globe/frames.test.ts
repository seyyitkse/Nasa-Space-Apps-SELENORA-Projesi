import { describe, expect, it } from 'vitest'

import { MOON_MODELS, type MoonModel } from './asset'
import { latLonToModel, type Vec3 } from './orientation'

type Mat3 = MoonModel['canonicalFromModel']

const mul = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]

// For orthonormal M (rows), Mᵀ maps canonical -> model.
const mulT = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
]

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]) || 1
const unit = (a: Vec3): Vec3 => {
  const n = norm(a)
  return [a[0] / n, a[1] / n, a[2] / n]
}

describe('M5: coordinate-frame transforms', () => {
  it('canonicalFromModel is orthonormal per asset', () => {
    for (const model of Object.values(MOON_MODELS)) {
      const m = model.canonicalFromModel
      const r0: Vec3 = [m[0][0], m[0][1], m[0][2]]
      const r1: Vec3 = [m[1][0], m[1][1], m[1][2]]
      const r2: Vec3 = [m[2][0], m[2][1], m[2][2]]
      expect(norm(r0), model.id).toBeCloseTo(1, 12)
      expect(norm(r1), model.id).toBeCloseTo(1, 12)
      expect(norm(r2), model.id).toBeCloseTo(1, 12)
      expect(dot(r0, r1), model.id).toBeCloseTo(0, 12)
      expect(dot(r0, r2), model.id).toBeCloseTo(0, 12)
      expect(dot(r1, r2), model.id).toBeCloseTo(0, 12)
    }
  })

  it('model -> canonical -> model preserves directions for all assets (test vectors)', () => {
    const vectors: Array<{ lat: number; lon: number }> = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 90 },
      { lat: 0, lon: 180 },
      { lat: 0, lon: -90 },
      { lat: -43.3, lon: -11.4 },
      { lat: -85.2, lon: 53.5 },
      { lat: -89.68, lon: -166.0 },
      { lat: -89.9, lon: 0 },
    ]
    for (const model of Object.values(MOON_MODELS)) {
      const m = model.canonicalFromModel
      for (const v of vectors) {
        const canonical = unit(latLonToModel(v.lat, v.lon, 1))
        const modelDir = unit(mulT(m, canonical))
        const back = unit(mul(m, modelDir))
        expect(back[0], `${model.id} ${v.lat},${v.lon}`).toBeCloseTo(canonical[0], 12)
        expect(back[1], `${model.id} ${v.lat},${v.lon}`).toBeCloseTo(canonical[1], 12)
        expect(back[2], `${model.id} ${v.lat},${v.lon}`).toBeCloseTo(canonical[2], 12)
      }
    }
  })
})

