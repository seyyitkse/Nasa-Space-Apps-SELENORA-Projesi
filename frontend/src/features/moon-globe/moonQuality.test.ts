import { describe, expect, it } from 'vitest'

import { HIGH_MODEL_ID, MOON_MODELS, type MoonModel } from './asset'
import { reregisterPositions } from './loadMoon'
import { latLonToModel, type Vec3 } from './orientation'

const apply = (m: MoonModel['canonicalFromModel'], p: Vec3): Vec3 => [
  m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2],
  m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2],
  m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2],
]
const det = (m: MoonModel['canonicalFromModel']) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
const norm = (p: Vec3): Vec3 => {
  const l = Math.hypot(...p)
  return [p[0] / l, p[1] / l, p[2] / l]
}

describe('NASA model registry (measured facts)', () => {
  it('High uses the topographic model; moon.glb is not offered (same texture as moon_small)', () => {
    expect(HIGH_MODEL_ID).toBe('topo')
    expect(MOON_MODELS.hd.texturePx).toEqual(MOON_MODELS.small.texturePx)
    expect(MOON_MODELS.hd.kmPerTexel).toEqual(MOON_MODELS.small.kmPerTexel)
    expect(MOON_MODELS.topo.texturePx).toEqual([8192, 4096])
    expect(MOON_MODELS.topo.kmPerTexel.southPole).toBeLessThan(MOON_MODELS.small.kmPerTexel.southPole / 2)
  })

  it('every model maps to the canonical frame with a proper rotation and the same mean radius', () => {
    for (const m of Object.values(MOON_MODELS)) {
      expect(det(m.canonicalFromModel), m.id).toBeCloseTo(1, 12)
      expect(m.modelRadius * m.scale, m.id).toBeCloseTo(MOON_MODELS.small.modelRadius, 9)
    }
  })

  it('relief is LOLA-derived and its NASA exaggeration is recorded', () => {
    const r = MOON_MODELS.topo.relief!
    expect(r.exaggeration).toBeGreaterThan(2.5)
    expect(r.exaggeration).toBeLessThan(3.2)
    expect(r.corrWithLola).toBeGreaterThan(0.8)
    expect(MOON_MODELS.small.relief).toBeNull()
  })
})

/** u = (lon + 180)/360, v = (90 − lat)/180 — the equirectangular texture convention of the topo asset. */
const uvFor = (lat: number, lon: number) => [(lon + 180) / 360, (90 - lat) / 180] as const

describe('topo re-registration (vertex ← UV-implied lat/lon)', () => {
  const topo = MOON_MODELS.topo

  it('places each vertex at its UV lat/lon; in the canonical frame this equals latLonToModel', () => {
    const pts: [number, number][] = [
      [0, 0],
      [0, 90],
      [0, -90],
      [45, 170],
      [-60, -30],
      [-89.68, -166],
      [-85.2, 53.5],
    ]
    // deliberately WRONG starting directions (pinched), correct radius
    const pos = new Float32Array(pts.flatMap(() => [0, 0, topo.modelRadius]))
    const uv = new Float32Array(pts.flatMap(([la, lo]) => uvFor(la, lo)))
    expect(reregisterPositions(pos, uv, topo, 'nasa')).toBe(true)
    pts.forEach(([la, lo], i) => {
      const c = norm(apply(topo.canonicalFromModel, [pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!]))
      const want = latLonToModel(la, lo)
      c.forEach((v, k) => expect(v).toBeCloseTo(want[k]!, 5))
    })
  })

  it('moves coincident polar copies together (no cracks) and leaves mid-latitude seams closed', () => {
    const r = topo.modelRadius
    // two copies at the same position near the pole with different UVs, plus a seam pair at u=0/1
    const p = latLonToModel(-88.5, 40, r)
    const pos = new Float32Array([...p, ...p, 0, 0, -r, 0, 0, -r])
    const uv = new Float32Array([...uvFor(-88.4, 30), ...uvFor(-88.7, 55), 0, 0.5, 1, 0.5])
    reregisterPositions(pos, uv, topo, 'nasa')
    for (let k = 0; k < 3; k++) {
      expect(pos[k]).toBeCloseTo(pos[3 + k]!, 9)
      expect(pos[6 + k]).toBeCloseTo(pos[9 + k]!, 6)
    }
  })

  it('true-scale relief divides heights above r0 by the measured exaggeration', () => {
    const { r0, exaggeration } = topo.relief!
    const high = r0 * 1.003
    const pos = new Float32Array([0, high, 0])
    const uv = new Float32Array(uvFor(90, 0))
    reregisterPositions(pos, uv, topo, 'true')
    expect(Math.hypot(pos[0]!, pos[1]!, pos[2]!)).toBeCloseTo(r0 + (high - r0) / exaggeration, 6)
  })

  it('leaves the verified small model untouched', () => {
    const pos = new Float32Array([1, 2, 3])
    expect(reregisterPositions(pos, new Float32Array([0.5, 0.5]), MOON_MODELS.small, 'true')).toBe(false)
    expect([...pos]).toEqual([1, 2, 3])
  })
})
