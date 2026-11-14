import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { LANDMARK_VALIDATION, LANDMARKS, TEXTURE_MEDIAN_LUM } from './landmarks'
import { graticule, LUNAR_FROM_MODEL, latLonToModel, modelToLatLon, presetPose, sitePose, SITE_ALTITUDE, slerp, surfaceDistanceKm, type Vec3 } from './orientation'

const close = (a: Vec3, b: Vec3, eps = 1e-9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)))

/** Screen position (NDC) of a model-space point for a camera pose (up = +Y, looking at the pivot). */
function project(pose: { target: Vec3; position: Vec3 }, p: Vec3) {
  const c = new THREE.PerspectiveCamera(40, 1, 0.001, 100)
  c.position.set(...pose.position)
  c.up.set(0, 1, 0)
  c.lookAt(...pose.target)
  c.updateMatrixWorld()
  return new THREE.Vector3(...p).project(c)
}

describe('NASA SVS 14959 lat/lon → model axes', () => {
  it('maps the cardinal longitudes on the equator', () => {
    close(latLonToModel(0, 0), [0, 0, -1]) // 0°E faces −Z
    close(latLonToModel(0, 90), [-1, 0, 0]) // 90°E faces −X
    close(latLonToModel(0, 180), [0, 0, 1]) // 180° faces +Z
    close(latLonToModel(0, -180), [0, 0, 1])
    close(latLonToModel(0, -90), [1, 0, 0]) // 90°W faces +X
  })

  it('puts north on +Y and south on −Y (latitude sign)', () => {
    close(latLonToModel(90, 123), [0, 1, 0])
    close(latLonToModel(-90, -45), [0, -1, 0])
    expect(latLonToModel(-89.68, -166)[1]).toBeLessThan(-0.99)
    expect(latLonToModel(30, 0)[1]).toBeGreaterThan(0)
  })

  it('equals the rotation found by the texture-correlation search (proper rotation, det = +1)', () => {
    const M = LUNAR_FROM_MODEL
    const det =
      M[0]![0]! * (M[1]![1]! * M[2]![2]! - M[1]![2]! * M[2]![1]!) -
      M[0]![1]! * (M[1]![0]! * M[2]![2]! - M[1]![2]! * M[2]![0]!) +
      M[0]![2]! * (M[1]![0]! * M[2]![1]! - M[1]![1]! * M[2]![0]!)
    expect(det).toBe(1)
    for (const [lat, lon] of [
      [12, 34],
      [-88.5, -87.1],
      [45, -170],
    ] as const) {
      const m = latLonToModel(lat, lon)
      const lunar = M.map((row) => row[0] * m[0] + row[1] * m[1] + row[2] * m[2])
      const la = (lat * Math.PI) / 180
      const lo = (lon * Math.PI) / 180
      close(lunar as Vec3, [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)])
    }
  })

  it('round-trips lat/lon (east-positive, −180…180)', () => {
    for (const [lat, lon] of [
      [0, 0],
      [-89.68, -166],
      [-85.2, 53.5],
      [17, 59],
      [-43.3, -11.4],
      [10, 179.9],
    ] as const) {
      const r = modelToLatLon(latLonToModel(lat, lon, 1.27))
      expect(r.lat).toBeCloseTo(lat, 9)
      expect(r.lon).toBeCloseTo(lon, 9)
    }
  })

  it('computes great-circle distances on the 1737.4 km sphere', () => {
    expect(surfaceDistanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo((Math.PI / 2) * 1737.4, 6)
    // Shackleton Rim A ↔ Connecting Ridge B (≈ 10 km): the global model's ~3 km texels barely separate them.
    const d = surfaceDistanceKm({ lat: -89.68, lon: -166 }, { lat: -89.44, lon: -141.8 })
    expect(d).toBeGreaterThan(5)
    expect(d).toBeLessThan(15)
  })
})

describe('camera presets (screen orientation)', () => {
  it('near side: north up, east (Mare Crisium side) on the right', () => {
    const cam = presetPose('near')
    expect(project(cam, latLonToModel(30, 0)).y).toBeGreaterThan(0)
    expect(project(cam, latLonToModel(0, 60)).x).toBeGreaterThan(0)
    expect(project(cam, latLonToModel(0, -60)).x).toBeLessThan(0)
  })

  it('far side: 180° faces the camera, north up', () => {
    const cam = presetPose('far')
    expect(project(cam, latLonToModel(0, 180)).z).toBeLessThan(project(cam, latLonToModel(0, 0)).z)
    expect(project(cam, latLonToModel(30, 180)).y).toBeGreaterThan(0)
  })

  it('south pole: 0°E at the top and 90°E on the right, like the polar stereographic maps', () => {
    const cam = presetPose('south')
    const pole = project(cam, latLonToModel(-90, 0))
    const lon0 = project(cam, latLonToModel(-80, 0))
    const lon90 = project(cam, latLonToModel(-80, 90))
    const lon180 = project(cam, latLonToModel(-80, 180))
    expect(lon0.y).toBeGreaterThan(pole.y)
    expect(lon180.y).toBeLessThan(pole.y)
    expect(lon90.x).toBeGreaterThan(pole.x)
    // pole sits near the screen centre
    expect(Math.hypot(pole.x, pole.y)).toBeLessThan(0.15)
  })

  it('site close-up: centred on the site, 0°E up and 90°E right (polar map convention)', () => {
    for (const [lat, lon] of [
      [-89.68, -166],
      [-85.2, 53.5],
      [-88.71, -68.7],
    ] as const) {
      const pose = sitePose(lat, lon)
      const site = project(pose, latLonToModel(lat, lon))
      expect(Math.hypot(site.x, site.y)).toBeLessThan(0.02)
      // camera hovers SITE_ALTITUDE above the surface
      const h = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2])
      expect(h).toBeCloseTo(SITE_ALTITUDE, 9)
    }
    const pose = sitePose(-89.68, -166)
    const pole = project(pose, latLonToModel(-90, 0))
    expect(project(pose, latLonToModel(-89, 0)).y).toBeGreaterThan(pole.y)
    expect(project(pose, latLonToModel(-89, 90)).x).toBeGreaterThan(pole.x)
  })

  it('site close-up of Point A also shows Point B (≈ 10 km away)', () => {
    const p = project(sitePose(-89.68, -166), latLonToModel(-89.44, -141.8))
    expect(Math.abs(p.x)).toBeLessThan(1)
    expect(Math.abs(p.y)).toBeLessThan(1)
  })

  it('slerp stays on the unit sphere', () => {
    const a = latLonToModel(0, 0)
    const b = latLonToModel(-88, 0)
    for (const t of [0, 0.25, 0.5, 1]) expect(Math.hypot(...slerp(a, b, t))).toBeCloseTo(1, 9)
    close(slerp(a, b, 1), b)
  })
})

describe('graticule', () => {
  it('draws the prime meridian through 0°E and the equator at latitude 0', () => {
    const g = graticule(30)
    for (const p of g.primeMeridian) expect(Math.abs(modelToLatLon(p).lon) < 1e-6 || Math.abs(modelToLatLon(p).lat) > 89.9).toBe(true)
    for (const p of g.equator) expect(modelToLatLon(p).lat).toBeCloseTo(0, 9)
  })
})

describe('landmark validation fixture (from the GLB texture, see report §3)', () => {
  const validated = LANDMARKS.filter((l) => l.expect !== null)

  it('covers near side, far side, both hemispheres and both mirror axes', () => {
    expect(validated.length).toBeGreaterThanOrEqual(7)
    expect(validated.some((l) => Math.abs(l.lon) > 90)).toBe(true) // far side
    expect(validated.some((l) => l.lat < 0) && validated.some((l) => l.lat > 0)).toBe(true)
    expect(new Set(validated.map((l) => l.mirror))).toEqual(new Set(['lon', 'lat']))
  })

  it('every landmark satisfies the albedo rule against its mirrored position', () => {
    for (const l of validated) {
      const v = LANDMARK_VALIDATION[l.id]
      expect(v, l.id).toBeDefined()
      const mirror = l.mirror === 'lon' ? v!.lumMirrorLon : v!.lumMirrorLat
      if (l.expect === 'dark') {
        expect(v!.lum, l.id).toBeLessThan(TEXTURE_MEDIAN_LUM)
        expect(v!.lum, l.id).toBeLessThan(0.75 * mirror)
      } else {
        expect(v!.lum, l.id).toBeGreaterThan(TEXTURE_MEDIAN_LUM)
        expect(v!.lum, l.id).toBeGreaterThan(mirror / 0.75)
      }
      expect(v!.pass).toBe(true)
    }
  })

  it('an east/west-mirrored globe would fail the longitude checks', () => {
    const lonChecks = validated.filter((l) => l.mirror === 'lon')
    const failures = lonChecks.filter((l) => {
      const v = LANDMARK_VALIDATION[l.id]!
      // swap roles: the mirrored model shows the mirror's albedo at the landmark position
      return l.expect === 'dark' ? !(v.lumMirrorLon < TEXTURE_MEDIAN_LUM && v.lumMirrorLon < 0.75 * v.lum) : !(v.lumMirrorLon > TEXTURE_MEDIAN_LUM && v.lumMirrorLon > v.lum / 0.75)
    })
    expect(failures.length).toBe(lonChecks.length)
  })
})
