/**
 * Parse the NASA GLB into a single unlit mesh.
 *
 * - The GLB's PBR material (clear-coat/specular extensions) is replaced with an UNLIT
 *   material: the photographic LRO texture is shown as-is, and no illumination,
 *   shadow or terminator is simulated (so nothing on screen can be mistaken for a
 *   Sun-visibility result).
 * - "Reduced" quality resamples the NASA texture to 2048 px in the browser (same
 *   imagery, lower resolution) for low-memory/mobile GPUs. No synthetic texture.
 * - `dispose()` frees geometry, material and texture GPU memory.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export type MoonQuality = 'standard' | 'reduced'

export interface LoadedMoon {
  mesh: THREE.Mesh
  textureSize: number
  dispose: () => void
}

function downscale(tex: THREE.Texture, size: number): THREE.Texture {
  const img = tex.image as CanvasImageSource & { width: number; height: number }
  if (!img || img.width <= size) return tex
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, size, size)
  const out = new THREE.CanvasTexture(canvas)
  out.flipY = tex.flipY // glTF textures are not flipped
  out.colorSpace = tex.colorSpace
  out.wrapS = tex.wrapS
  out.wrapT = tex.wrapT
  out.generateMipmaps = true
  out.minFilter = THREE.LinearMipmapLinearFilter
  tex.dispose()
  const bitmap = img as unknown as { close?: () => void }
  bitmap.close?.()
  return out
}

export async function parseMoon(buffer: ArrayBuffer, quality: MoonQuality, maxTextureSize: number): Promise<LoadedMoon> {
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
  const target = Math.min(quality === 'reduced' ? 2048 : 4096, maxTextureSize)
  map = downscale(map, target)
  map.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide })
  oldMat.dispose()
  const mesh = new THREE.Mesh(src.geometry, material)
  // The node carries no transform in this asset; keep any that exists so orientation matches the file.
  mesh.applyMatrix4(src.matrixWorld)
  mesh.name = 'nasa-svs-14959-moon'
  const size = (map.image as { width?: number } | undefined)?.width ?? target
  return {
    mesh,
    textureSize: size,
    dispose: () => {
      mesh.geometry.dispose()
      material.dispose()
      map.dispose()
      const bmp = map.image as { close?: () => void } | undefined
      bmp?.close?.()
    },
  }
}
