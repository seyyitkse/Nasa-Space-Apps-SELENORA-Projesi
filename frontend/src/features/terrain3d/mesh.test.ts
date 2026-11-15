import { describe, expect, it } from 'vitest'

import {
  bearingToScene,
  buildTerrainGeometry,
  gridBearingDeg,
  MESH_PRESETS,
  meshLayerForRequest,
  meshLayerForTile,
  meshSourceLabel,
  type MeshResponse,
  rayProfile,
  sampleZ,
  sightDirection,
  sphereDropM,
  trueNorthGridAzimuthDeg,
  vertexCount,
} from './mesh'

// Synthetic test meshes (deterministic fixtures, never displayed as NASA data).
function flatMesh(z: (r: number, c: number, x: number, y: number) => number | null, n = 5, step = 100): MeshResponse {
  const xs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step)
  const ys = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step)
  return {
    layer_id: 'fixture', role: 'fixture', crs_summary: '', attribution: '', origin_stereo_m: [0, 0],
    x_m: xs, y_m: ys, z_m: ys.map((y, r) => xs.map((x, c) => z(r, c, x, y))),
    step_m: step, half_extent_m: ((n - 1) / 2) * step, warning: '',
  }
}

describe('LOLA mesh geometry', () => {
  it('maps DEM tiles to mesh layer ids', () => {
    expect(meshLayerForTile('Site04')).toBe('lola-site04-5mpp-surf')
    expect(meshLayerForTile('Site01')).toBe('lola-site01-5mpp-surf')
    expect(meshLayerForTile(null)).toBeNull()
  })

  it('falls back to auto layer selection outside local 5 m tiles (Phase 7D)', () => {
    expect(meshLayerForRequest('Site04')).toBe('lola-site04-5mpp-surf')
    expect(meshLayerForRequest(null)).toBe('auto')
    expect(meshLayerForRequest(undefined)).toBe('auto')
    expect(
      meshSourceLabel({
        coverage_tier: 'REMOTE_PGDA90',
        native_resolution_m: 80,
        dem_site_id: null,
        layer_id: 'ldem-80s-80mpp',
      }),
    ).toBe('LOLA 80 m · PGDA 90')
    expect(
      meshSourceLabel({
        coverage_tier: 'LOCAL_5MPP',
        native_resolution_m: 5,
        dem_site_id: 'Site04',
        layer_id: 'lola-site04-5mpp-surf',
      }),
    ).toBe('LOLA 5 m · Site04')
  })

  it('uses the backend true-north convention (Point A γ = 194°, Point B γ = 218.2°)', () => {
    expect(trueNorthGridAzimuthDeg(-166)).toBe(194)
    expect(trueNorthGridAzimuthDeg(-141.8)).toBeCloseTo(218.2, 9)
    // Sun at true az 86° from Point A → grid bearing 280°
    expect(gridBearingDeg(86, 194)).toBe(280)
  })

  it('orients scene axes: grid +Y (bearing 0) is −Z, grid +X (bearing 90) is +X', () => {
    const [x0, z0] = bearingToScene(0)
    expect(x0).toBeCloseTo(0, 12)
    expect(z0).toBeCloseTo(-1, 12)
    const [x90, z90] = bearingToScene(90)
    expect(x90).toBeCloseTo(1, 12)
    expect(z90).toBeCloseTo(0, 12)
  })

  it('scales sight-line slope with exaggeration so above/below relations are preserved', () => {
    const [, y1] = sightDirection(0, 10, 1)
    const [, y3] = sightDirection(0, 10, 3)
    expect(y3).toBeCloseTo(3 * y1, 12)
  })

  it('bilinearly samples z and refuses null neighbours', () => {
    const m = flatMesh((_, __, x) => 1000 + x / 10)
    expect(sampleZ(m, 50, 0)).toBeCloseTo(1005, 9)
    const holed = flatMesh((r, c) => (r === 2 && c === 2 ? null : 1000))
    expect(sampleZ(holed, 0, 0)).toBeNull()
  })

  it('finds the terrain obstruction angle along a ray (with curvature drop)', () => {
    // A 100 m-high wall 200 m east of an observer whose eye is at 1002 m.
    const m = flatMesh((_, __, x) => (x >= 200 ? 1100 : 1000), 9, 50)
    const p = rayProfile(m, 90, 1002, 50)
    const expected = (Math.atan2(1100 - 1002 - sphereDropM(200), 200) * 180) / Math.PI
    expect(p.maxDeg).toBeCloseTo(expected, 6)
    expect(p.atM).toBe(200)
    expect(rayProfile(m, 270, 1002, 50).maxDeg!).toBeLessThan(0)
  })

  it('builds eye-relative, exaggerated geometry with holes for null cells', () => {
    const m = flatMesh((r, c) => (r === 0 && c === 0 ? null : 1010))
    const g = buildTerrainGeometry(m, 1002, 2)
    expect(g.nullCount).toBe(1)
    // centre vertex: (0, (1010-1002)*2, 0)
    const centre = (2 * 5 + 2) * 3
    expect(Array.from(g.positions.slice(centre, centre + 3))).toEqual([0, 16, -0])
    // 16 quads, 1 touches the null corner → 15 quads → 90 indices
    expect(g.indices.length).toBe(90)
  })

  it('keeps presets under the backend 20 000-vertex guard', () => {
    for (const p of MESH_PRESETS) expect(vertexCount(p.halfExtentM, p.stepM)).toBeLessThanOrEqual(20_000)
  })
})
