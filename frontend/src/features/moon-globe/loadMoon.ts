/**
 * Parse a NASA SVS 14959 GLB into a single mesh in SELENORA's CANONICAL globe frame
 * (Phase 6A: north +Y, 0°E −Z, 90°E −X, mean radius = MOON_MODELS.small.modelRadius).
 *
 * - Each asset carries its own measured `canonicalFromModel` rotation and scale
 *   (scripts/moon-validation/analyze_glb.py); nothing is assumed from file names.
 * - Material: the GLB's PBR/clear-coat material is replaced. Photographic models are
 *   shown UNLIT (texture as delivered). The topographic model may use a "relief light"
 *   that is attached to the CAMERA — it reveals shape, is labelled as display lighting
 *   and never represents the Sun.
 * - Texture: anisotropic filtering at the GPU maximum, trilinear mipmaps; optional
 *   in-browser down-sampling of the SAME NASA texture for low-memory devices.
 * - `dispose()` frees geometry, material and texture GPU memory.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { MOON_MODELS, type MoonModel, type MoonModelId } from './asset'

export type ReliefMode = 'true' | 'nasa'

export type MoonQuality = 'reduced' | 'standard' | 'high'

export interface LoadedMoon {
  modelId: MoonModelId
  model: MoonModel
  mesh: THREE.Mesh
  /** Texture as uploaded [w, h] (after any down-sampling). */
  textureSize: [number, number]
  /** Max surface radius / canonical mean radius (overlays sit above this). */
  surfaceMax: number
  /** Surface radius (canonical units / mean radius) at a lat/lon, from the mesh vertices. */
  surfaceRadiusAt: (latDeg: number, lonDeg: number) => number
  lit: boolean
  relief: ReliefMode | null
  dispose: () => void
}

function downscale(tex: THREE.Texture, maxW: number): THREE.Texture {
  const img = tex.image as CanvasImageSource & { width: number; height: number }
  if (!img || img.width <= maxW) return tex
  const k = maxW / img.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * k)
  canvas.height = Math.round(img.height * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = new THREE.CanvasTexture(canvas)
  out.flipY = tex.flipY // glTF textures are not flipped
  out.colorSpace = tex.colorSpace
  out.wrapS = tex.wrapS
  out.wrapT = tex.wrapT
  tex.dispose()
  ;(img as unknown as { close?: () => void }).close?.()
  return out
}

/**
 * Equirectangular models: sample the texture PER PIXEL from the surface direction (lat/lon
 * computed in the shader) instead of interpolating vertex UVs. Linear UV interpolation across
 * the long, fan-shaped polar triangles bends longitudes (ring/wedge artefacts at the pole);
 * the per-pixel lookup is exact everywhere. Longitude uses two wrapped candidates and picks the
 * one with the smaller screen derivative so the ±180° seam does not select a tiny mip level.
 * Convention (measured on the asset): u = atan2(z, −x) / 2π (mod 1), v = 0.5 − lat / π.
 */
function applyEquirectLookup(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSelDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSelDir = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSelDir;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec3 selD = normalize(vSelDir);
  float selA = atan(selD.z, -selD.x) / 6.283185307179586;
  float selU1 = fract(selA);
  float selU2 = fract(selA + 0.5) - 0.5;
  float selU = fwidth(selU1) <= fwidth(selU2) + 1e-7 ? selU1 : selU2;
  float selV = 0.5 - asin(clamp(selD.y, -1.0, 1.0)) / 3.141592653589793;
  vec4 sampledDiffuseColor = texture2D(map, vec2(selU, selV));
  diffuseColor *= sampledDiffuseColor;
#endif`,
      )
  }
  material.customProgramCacheKey = () => 'selenora-equirect-lookup'
}

export interface ParseOptions {
  modelId: MoonModelId
  /** Max texture width to upload (GPU limit and quality tier). */
  maxTextureWidth: number
  anisotropy: number
  /** Relief models only: 'true' = LOLA heights at 1:1 (default), 'nasa' = as published (exaggerated). */
  relief?: ReliefMode
}

/**
 * 'uv-equirect' assets: rebuild each vertex direction from its UV (u·360° = atan2(z, −x),
 * lat = 90° − v·180°), keeping the vertex radius. Optionally rescale relief to 1:1.
 * Returns true if positions changed (normals must be recomputed).
 */
export function reregisterPositions(pos: Float32Array, uv: Float32Array, model: MoonModel, relief: ReliefMode): boolean {
  const rebuild = model.registration === 'uv-equirect'
  const rescale = model.relief !== null && relief === 'true'
  if (!rebuild && !rescale) return false
  const r0 = model.relief?.r0 ?? 0
  const ex = model.relief?.exaggeration ?? 1
  const n = pos.length / 3
  // The file stores several copies of each vertex. Near the poles copies at the SAME position can
  // carry different UVs; rebuilding them independently would tear the mesh (measured: 1,984 polar
  // groups split by up to 17 km). Copies are therefore grouped by original position and moved
  // together to the normalised mean of their UV-implied directions.
  const groups = new Map<string, number[]>()
  if (rebuild) {
    for (let v = 0; v < n; v++) {
      const x = pos[3 * v]!
      const y = pos[3 * v + 1]!
      const z = pos[3 * v + 2]!
      if (Math.abs(y) < 0.94 * Math.hypot(x, y, z)) continue // only |lat| > ~70° can be affected
      const k = `${x},${y},${z}`
      const g = groups.get(k)
      if (g) g.push(v)
      else groups.set(k, [v])
    }
  }
  const radius = new Float32Array(n)
  for (let v = 0; v < n; v++) {
    const i = 3 * v
    const x = pos[i]!
    const y = pos[i + 1]!
    const z = pos[i + 2]!
    const rOrig = Math.hypot(x, y, z)
    const r = rescale ? r0 + (rOrig - r0) / ex : rOrig
    radius[v] = r
    if (rebuild) {
      const lat = (0.5 - uv[2 * v + 1]!) * Math.PI
      const a = uv[2 * v]! * 2 * Math.PI
      const c = Math.cos(lat)
      pos[i] = -c * Math.cos(a)
      pos[i + 1] = Math.sin(lat)
      pos[i + 2] = c * Math.sin(a)
    } else {
      pos[i] = x / (rOrig || 1)
      pos[i + 1] = y / (rOrig || 1)
      pos[i + 2] = z / (rOrig || 1)
    }
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue
    let sx = 0
    let sy = 0
    let sz = 0
    for (const v of g) {
      sx += pos[3 * v]!
      sy += pos[3 * v + 1]!
      sz += pos[3 * v + 2]!
    }
    const len = Math.hypot(sx, sy, sz) || 1
    for (const v of g) {
      pos[3 * v] = sx / len
      pos[3 * v + 1] = sy / len
      pos[3 * v + 2] = sz / len
    }
  }
  for (let v = 0; v < n; v++) {
    const r = radius[v]!
    pos[3 * v] = pos[3 * v]! * r
    pos[3 * v + 1] = pos[3 * v + 1]! * r
    pos[3 * v + 2] = pos[3 * v + 2]! * r
  }
  return true
}

export async function parseMoon(buffer: ArrayBuffer, opts: ParseOptions): Promise<LoadedMoon> {
  const model = MOON_MODELS[opts.modelId]
  const gltf = await new GLTFLoader().parseAsync(buffer, '')
  let found: THREE.Mesh | null = null
  gltf.scene.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh
  })
  if (!found) throw new Error('GLB contains no mesh')
  const src = found as THREE.Mesh
  const oldMat = src.material as THREE.MeshStandardMaterial
  let map = oldMat.map
  if (!map) throw new Error('GLB mesh has no base-colour texture')
  map = downscale(map, opts.maxTextureWidth)
  map.anisotropy = Math.max(1, opts.anisotropy)
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.magFilter = THREE.LinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true

  const dbg = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  // measurement-only switches (?bench&unlit / ?bench&noRebuild) for diagnosing rendering
  const lit = model.relief !== null && !(dbg?.has('bench') && dbg.has('unlit'))
  const material: THREE.Material = lit
    ? new THREE.MeshLambertMaterial({ map, side: THREE.FrontSide })
    : new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide })
  oldMat.dispose()
  if (model.registration === 'uv-equirect') applyEquirectLookup(material)

  const geometry = src.geometry
  const posAttr = geometry.attributes.position as THREE.BufferAttribute
  const uvAttr = geometry.attributes.uv as THREE.BufferAttribute | undefined
  if (uvAttr && !(dbg?.has('bench') && dbg.has('noRebuild')) && reregisterPositions(posAttr.array as Float32Array, uvAttr.array as Float32Array, model, opts.relief ?? 'true')) {
    posAttr.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
  }
  const mesh = new THREE.Mesh(geometry, material)
  // Measured axis mapping + scale to the canonical frame (node transforms are absent in these assets).
  const m = model.canonicalFromModel
  const k = model.scale
  mesh.matrixAutoUpdate = false
  mesh.matrix.set(m[0][0] * k, m[0][1] * k, m[0][2] * k, 0, m[1][0] * k, m[1][1] * k, m[1][2] * k, 0, m[2][0] * k, m[2][1] * k, m[2][2] * k, 0, 0, 0, 0, 1)
  mesh.matrixWorldNeedsUpdate = true
  mesh.name = `nasa-svs-14959-${model.id}`

  // Surface radius lookup (model frame): nearest vertices to the requested direction.
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  const rMean = MOON_MODELS.small.modelRadius
  let rMax = 0
  for (let i = 0; i < arr.length; i += 3) rMax = Math.max(rMax, Math.hypot(arr[i]!, arr[i + 1]!, arr[i + 2]!))
  const radiusCache = new Map<string, number>()
  const surfaceRadiusAt = (latDeg: number, lonDeg: number) => {
    const ck = `${latDeg},${lonDeg}`
    const hit = radiusCache.get(ck)
    if (hit !== undefined) return hit
    const la = (latDeg * Math.PI) / 180
    const lo = (lonDeg * Math.PI) / 180
    const c: [number, number, number] = [-Math.cos(la) * Math.sin(lo), Math.sin(la), -Math.cos(la) * Math.cos(lo)]
    // model direction = Mᵀ · canonical direction (M orthonormal)
    const d = [m[0][0] * c[0] + m[1][0] * c[1] + m[2][0] * c[2], m[0][1] * c[0] + m[1][1] * c[1] + m[2][1] * c[2], m[0][2] * c[0] + m[1][2] * c[1] + m[2][2] * c[2]]
    let best = -2
    let bestR = rMean / k
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i]!
      const y = arr[i + 1]!
      const z = arr[i + 2]!
      const r = Math.hypot(x, y, z)
      const dot = (x * d[0]! + y * d[1]! + z * d[2]!) / r
      if (dot > best) {
        best = dot
        bestR = r
      }
    }
    const out = (bestR * k) / rMean
    radiusCache.set(ck, out)
    return out
  }

  const img = map.image as { width?: number; height?: number } | undefined
  return {
    modelId: model.id,
    model,
    mesh,
    textureSize: [img?.width ?? 0, img?.height ?? 0],
    surfaceMax: (rMax * k) / rMean,
    surfaceRadiusAt,
    lit,
    relief: model.relief ? (opts.relief ?? 'true') : null,
    dispose: () => {
      geometry.dispose()
      material.dispose()
      map.dispose()
      ;(map.image as { close?: () => void } | undefined)?.close?.()
    },
  }
}
