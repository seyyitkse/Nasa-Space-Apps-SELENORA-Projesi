/**
 * Verified lunar latitude/longitude ↔ NASA SVS 14959 `moon_small.glb` model axes.
 *
 * The model is a sphere-ised cube with a cube-face texture atlas, NOT an
 * equirectangular UV sphere, so ordinary Earth-globe formulas cannot be assumed.
 *
 * How the mapping was established (reproducible; scripts in docs/PHASE6A report §3):
 *  1. For every mesh vertex the luminance of the GLB's own embedded texture (at its UV)
 *     was compared with the NASA CGI Moon Kit equirectangular LRO colour map (SVS 4720,
 *     centred on 0° longitude) at the lat/lon implied by each of the 48 signed axis
 *     permutations × 180 longitude offsets.
 *  2. One proper rotation wins clearly: Pearson r = 0.919 (best mirrored candidate
 *     r = 0.454), longitude offset 0.0° at 0.1° search resolution.
 *  3. Cross-checked against IAU/USGS Gazetteer landmarks (see landmarks.ts) and visually
 *     in the browser (near side shows Mare Crisium on the east/right limb with north up).
 *
 * Result (lunar body-fixed X → 0°E, Y → 90°E, Z → north pole):
 *     model = ( −Y_lunar , +Z_lunar , −X_lunar )
 * i.e. north = +Y, 0° longitude faces −Z, 90°E faces −X, 180° faces +Z, 90°W faces +X.
 * East-positive longitude in −180…180 (the project's site API convention).
 */

export type Vec3 = [number, number, number]

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

/** Rotation matrix taking model-space unit vectors to lunar body-fixed (rows = lunar X, Y, Z). */
export const LUNAR_FROM_MODEL: readonly (readonly [number, number, number])[] = [
  [0, 0, -1],
  [-1, 0, 0],
  [0, 1, 0],
]

/** Planetocentric lat/lon (degrees, east-positive) → model-space point at radius r. */
export function latLonToModel(latDeg: number, lonDeg: number, r = 1): Vec3 {
  const lat = latDeg * D2R
  const lon = lonDeg * D2R
  const c = Math.cos(lat)
  return [-c * Math.sin(lon) * r, Math.sin(lat) * r, -c * Math.cos(lon) * r]
}

/** Model-space point → planetocentric lat/lon in degrees (lon in −180…180]. */
export function modelToLatLon([x, y, z]: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(x, y, z) || 1
  const lat = Math.asin(Math.max(-1, Math.min(1, y / r))) * R2D
  let lon = Math.atan2(-x, -z) * R2D
  if (lon <= -180) lon += 360
  return { lat, lon }
}

/** Great-circle distance in km on the IAU mean lunar sphere (R = 1737.4 km). */
export function surfaceDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const p = latLonToModel(a.lat, a.lon)
  const q = latLonToModel(b.lat, b.lon)
  const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))
  return Math.acos(dot) * 1737.4
}

/* ------------------------------------------------------------------ camera views */

export type ViewPreset = 'near' | 'far' | 'south'

/** Camera pose in units of the lunar radius (multiply by the model radius to place it). */
export interface CameraPose {
  /** OrbitControls pivot. The Moon's centre for global views, the site itself for site views. */
  target: Vec3
  position: Vec3
}

const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const unit = (v: Vec3): Vec3 => scale(v, 1 / (Math.hypot(...v) || 1))

/**
 * Global views. Camera `up` stays +Y (lunar north) for OrbitControls, so:
 *  - near/far side: north is up, east is to the right on the near side;
 *  - south pole: viewed from below with 0° longitude at the top of the screen and 90°E
 *    on the right — the same orientation as SELENORA's south-polar stereographic maps
 *    (+proj=stere +lat_0=-90 +lon_0=0). Verified in orientation.test.ts.
 */
export function presetPose(preset: ViewPreset): CameraPose {
  const origin: Vec3 = [0, 0, 0]
  switch (preset) {
    case 'near':
      return { target: origin, position: latLonToModel(0, 0, 3.2) }
    case 'far':
      return { target: origin, position: latLonToModel(0, 180, 3.2) }
    case 'south':
      // 2° off the pole toward 0°E keeps OrbitControls off its singular axis and makes 0°E
      // the screen "up" direction.
      return { target: origin, position: latLonToModel(-88, 0, 3.0) }
  }
}

/** Altitude of the site close-up, in lunar radii (≈ 410 km → ≈ ±150 km visible vertically). */
export const SITE_ALTITUDE = 0.237

/**
 * Site close-up: orbit pivot ON the site, camera above it. For polar sites the camera is
 * offset 2° toward 0°E from straight overhead so 0°E stays at the top of the screen (map
 * convention); elsewhere it looks straight down with north up.
 */
export function sitePose(latDeg: number, lonDeg: number, altitude = SITE_ALTITUDE): CameraPose {
  const target = latLonToModel(latDeg, lonDeg)
  const polar = Math.abs(latDeg) >= 80
  const pole: Vec3 = [0, Math.sign(latDeg) || -1, 0]
  const view = polar ? unit(add(pole, [0, 0, -0.035])) : target
  return { target, position: add(target, scale(view, altitude)) }
}

/** Spherical interpolation between two unit vectors (falls back to lerp when nearly parallel). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const omega = Math.acos(dot)
  if (omega < 1e-4) return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  const s = Math.sin(omega)
  const wa = Math.sin((1 - t) * omega) / s
  const wb = Math.sin(t * omega) / s
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]
}

/** Smooth ease for camera flights. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/* ------------------------------------------------------------------ graticule */

/** Latitude circles and meridians as polylines (model space, radius r). */
export function graticule(stepDeg = 30, r = 1, samples = 96): { lines: Vec3[][]; primeMeridian: Vec3[]; equator: Vec3[] } {
  const lines: Vec3[][] = []
  for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
    if (lat === 0) continue
    lines.push(Array.from({ length: samples + 1 }, (_, i) => latLonToModel(lat, -180 + (360 * i) / samples, r)))
  }
  for (let lon = -180 + stepDeg; lon <= 180; lon += stepDeg) {
    if (lon === 0) continue
    lines.push(Array.from({ length: samples / 2 + 1 }, (_, i) => latLonToModel(-90 + (180 * i) / (samples / 2), lon, r)))
  }
  const equator = Array.from({ length: samples + 1 }, (_, i) => latLonToModel(0, -180 + (360 * i) / samples, r))
  const primeMeridian = Array.from({ length: samples / 2 + 1 }, (_, i) => latLonToModel(-90 + (180 * i) / (samples / 2), 0, r))
  return { lines, primeMeridian, equator }
}
