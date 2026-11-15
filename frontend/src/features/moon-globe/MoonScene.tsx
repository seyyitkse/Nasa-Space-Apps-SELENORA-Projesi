/**
 * React Three Fiber scene for the NASA SVS 14959 Moon (lazy chunk).
 *
 * - frameloop="demand": nothing renders unless the camera moves or data changes.
 * - Unlit photographic texture: no simulated Sun, shadow or terminator.
 * - Site pins are placed ONLY through the verified `latLonToModel` transform.
 */
import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import { xyToLonLat } from '@/features/lunar-explorer/projection'

import { MOON_ASSET } from './asset'
import type { LoadedMoon } from './loadMoon'
import { easeInOut, graticule, latLonToModel, modelToLatLon, presetPose, sitePose, slerp, type Vec3, type ViewPreset } from './orientation'
import { PICK_DRAG_THRESHOLD_PX, worldPointToLatLon } from './pickHelpers'

export interface GlobeSite {
  id: string
  name: string
  lat: number
  lon: number
  slot: 'A' | 'B' | null
  /** Reference API seed vs user-defined (missionStore / localStorage). */
  kind?: 'reference' | 'custom'
}

export interface DraftPick {
  lat: number
  lon: number
}

export interface GlobeLandmark {
  id: string
  name: string
  lat: number
  lon: number
}

export type CameraIntent =
  | { kind: 'preset'; preset: ViewPreset }
  | { kind: 'site'; lat: number; lon: number }
  | { kind: 'orbit'; dAzimuth: number; dPolar: number }
  | { kind: 'zoom'; factor: number }
export type CameraCommand = CameraIntent & { seq: number }

export interface CameraState {
  lat: number
  lon: number
  /** Camera distance from the Moon's centre in lunar radii. */
  distance: number
}

interface Props {
  /** Real LOLA 5 m DEM tile footprints (polar stereographic metres) drawn as outlines. */
  tiles?: { site_id: string; bounds_m: [number, number, number, number] }[]
  moon: LoadedMoon
  sites: GlobeSite[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** When true, a non-drag click on the mesh places a draft research point. */
  pickMode?: boolean
  onSurfacePick?: (lat: number, lon: number) => void
  /** Temporary marker while naming a new custom point. */
  draftPick?: DraftPick | null
  landmarks: GlobeLandmark[]
  showGraticule: boolean
  command: CameraCommand | null
  reducedMotion: boolean
  dpr: [number, number]
  onCamera: (c: CameraState) => void
  onReady: () => void
}

const R = MOON_ASSET.modelRadius
const MIN_DIST = 1.18
const MAX_DIST = 6
const COLORS = { A: '#56D9E9', B: '#9585FF', none: '#F5C674' } as const

/** Global views pivot on the Moon's centre; site views pivot on the site (closer zoom allowed). */
function applyLimits(controls: OrbitControlsImpl | null, target: THREE.Vector3) {
  if (!controls) return
  const onSurface = target.lengthSq() > 0.25 * R * R
  controls.minDistance = onSurface ? 0.06 * R : MIN_DIST * R
  controls.maxDistance = onSurface ? 3 * R : MAX_DIST * R
}

/** Moves the camera for preset/site/keyboard commands (animated unless reduced motion). */
function CameraRig({ command, reducedMotion, onCamera }: { command: CameraCommand | null; reducedMotion: boolean; onCamera: (c: CameraState) => void }) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const flight = useRef<{ p0: THREE.Vector3; p1: THREE.Vector3; q0: THREE.Vector3; q1: THREE.Vector3; t0: number; ms: number } | null>(null)
  const lastSeq = useRef(-1)

  const report = () => {
    const p = camera.position
    const ll = modelToLatLon([p.x, p.y, p.z])
    onCamera({ lat: ll.lat, lon: ll.lon, distance: p.length() / R })
  }
  const pivot = () => controls?.target ?? new THREE.Vector3()
  // Initial distance limits (global view). Set imperatively so prop diffs never override flights.
  useEffect(() => applyLimits(controls, controls?.target ?? new THREE.Vector3()), [controls])

  useEffect(() => {
    if (!command || command.seq === lastSeq.current) return
    lastSeq.current = command.seq
    const tgt = pivot()
    if (command.kind === 'orbit') {
      const off = camera.position.clone().sub(tgt)
      const s = new THREE.Spherical().setFromVector3(off)
      s.theta += command.dAzimuth
      s.phi = THREE.MathUtils.clamp(s.phi + command.dPolar, 0.02, Math.PI - 0.02)
      camera.position.copy(tgt).add(new THREE.Vector3().setFromSpherical(s))
      camera.lookAt(tgt)
      controls?.update()
      invalidate()
      report()
      return
    }
    if (command.kind === 'zoom') {
      const off = camera.position.clone().sub(tgt)
      const lo = controls?.minDistance ?? MIN_DIST * R
      const hi = controls?.maxDistance ?? MAX_DIST * R
      off.setLength(THREE.MathUtils.clamp(off.length() * command.factor, lo, hi))
      camera.position.copy(tgt).add(off)
      controls?.update()
      invalidate()
      report()
      return
    }
    const pose = command.kind === 'preset' ? presetPose(command.preset) : sitePose(command.lat, command.lon)
    const p1 = new THREE.Vector3(...pose.position).multiplyScalar(R)
    const q1 = new THREE.Vector3(...pose.target).multiplyScalar(R)
    if (reducedMotion) {
      camera.position.copy(p1)
      controls?.target.copy(q1)
      applyLimits(controls, q1)
      camera.lookAt(q1)
      controls?.update()
      invalidate()
      report()
      return
    }
    // Relax limits during the flight; the destination's limits apply on arrival.
    if (controls) {
      controls.minDistance = 0
      controls.maxDistance = Infinity
    }
    flight.current = { p0: camera.position.clone(), p1, q0: tgt.clone(), q1, t0: performance.now(), ms: 1400 }
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command])

  useFrame(() => {
    const f = flight.current
    if (!f) return
    const t = Math.min(1, (performance.now() - f.t0) / f.ms)
    const e = easeInOut(t)
    const a = f.p0.toArray() as Vec3
    const b = f.p1.toArray() as Vec3
    const la = f.p0.length()
    const lb = f.p1.length()
    const dir = slerp(scaleV(a, 1 / la), scaleV(b, 1 / lb), e)
    const n = Math.hypot(...dir) || 1
    // Travel along an arc around the Moon (never through it); lift a little mid-flight on long arcs.
    const arc = Math.acos(THREE.MathUtils.clamp(f.p0.dot(f.p1) / (la * lb), -1, 1))
    const d = la + (lb - la) * e + Math.sin(Math.PI * e) * Math.min(0.5, arc / 2) * R
    camera.position.set((dir[0] / n) * d, (dir[1] / n) * d, (dir[2] / n) * d)
    const q = f.q0.clone().lerp(f.q1, e)
    controls?.target.copy(q)
    camera.lookAt(q)
    controls?.update()
    if (t < 1) invalidate()
    else {
      flight.current = null
      applyLimits(controls, f.q1)
      report()
      // One more frame so screen-size-scaled pins see the final camera position.
      invalidate()
    }
  })
  return null
}

const scaleV = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]

/** Keep ≥ 40° of view across the NARROW side, so portrait phones see the whole disc. */
function AdaptiveFov() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const base = 40
    camera.fov = aspect >= 1 ? base : (2 * Math.atan(Math.tan((base * Math.PI) / 360) / aspect) * 180) / Math.PI
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size.width, size.height, invalidate])
  return null
}

/** frameloop="demand": redraw when non-camera scene content changes (grid, pins, selection). */
function InvalidateOn({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => invalidate(), deps)
  return null
}

function MoonMesh({
  moon,
  onReady,
  pickMode,
  onSurfacePick,
}: {
  moon: LoadedMoon
  onReady: () => void
  pickMode?: boolean
  onSurfacePick?: (lat: number, lon: number) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const down = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    invalidate()
    onReady()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moon])

  // Click-without-drag → surface pick. Drag still rotates via OrbitControls (no stopPropagation on down).
  const onPointerDown = (e: { clientX: number; clientY: number }) => {
    if (!pickMode) return
    down.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: {
    clientX: number
    clientY: number
    point: { x: number; y: number; z: number }
    stopPropagation: () => void
  }) => {
    if (!pickMode || !onSurfacePick || !down.current) return
    const dx = e.clientX - down.current.x
    const dy = e.clientY - down.current.y
    down.current = null
    if (dx * dx + dy * dy > PICK_DRAG_THRESHOLD_PX * PICK_DRAG_THRESHOLD_PX) return
    e.stopPropagation()
    // Direction from Moon centre in the verified model frame (radius-independent → Standard/High stable).
    const { lat, lon } = worldPointToLatLon(e.point.x, e.point.y, e.point.z)
    onSurfacePick(lat, lon)
  }

  return (
    <primitive
      object={moon.mesh}
      onPointerDown={pickMode ? onPointerDown : undefined}
      onPointerUp={pickMode ? onPointerUp : undefined}
      onPointerMissed={() => {
        down.current = null
      }}
    />
  )
}

const UP = new THREE.Vector3(0, 1, 0)

/** A pin of constant on-screen size: a stem along the local vertical plus a head. */
function Pin({ site, selected, onSelect, visible, radius }: { site: GlobeSite; selected: boolean; onSelect: (id: string) => void; visible: boolean; radius: number }) {
  const [hover, setHover] = useState(false)
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  // Base on the rendered surface (relief models) or just above the chord faces (smooth models).
  const base = useMemo(() => latLonToModel(site.lat, site.lon, R * radius), [site.lat, site.lon, radius])
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...base).normalize()), [base])
  const color = COLORS[site.slot ?? 'none']
  const k = selected ? 1.35 : 1
  // ≈ constant screen size: scale with the distance from the camera.
  useFrame(() => {
    if (!group.current) return
    const d = camera.position.distanceTo(group.current.position)
    group.current.scale.setScalar(d * 0.018 * k)
  })
  return (
    <group ref={group} position={base} quaternion={quat}>
      <Line points={[[0, 0, 0], [0, 1, 0]]} color={color} lineWidth={selected ? 2.5 : 1.5} />
      <mesh
        position={[0, 1, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(site.id)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
      >
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshBasicMaterial color={selected ? '#ffffff' : color} />
      </mesh>
      {/* Always mounted (drei Html roots must not mount/unmount mid-render); hidden via CSS. */}
      <Html position={[0, 1, 0]} center zIndexRange={[20, 0]}>
        <span
          className="pointer-events-none -translate-y-5 rounded-md border border-line-strong bg-bg/90 px-2 py-0.5 font-mono text-[10.5px] whitespace-nowrap shadow"
          style={{ color, display: (selected || hover) && visible ? undefined : 'none' }}
        >
          {site.slot ? `${site.slot} · ` : ''}
          {site.name}
        </span>
      </Html>
    </group>
  )
}

/**
 * Measurement hook (only when the URL has `?bench`): `await window.__selenoraMoonBench(3000)`
 * renders continuously while orbiting and reports FPS, draw stats and buffer/texture sizes.
 * Used for docs/PHASE6A1_MOON_QUALITY_REPORT.md; inert otherwise.
 */
function Bench({ moon }: { moon: LoadedMoon }) {
  const { gl, camera, invalidate } = useThree()
  const run = useRef<{ until: number; frames: number; t0: number; resolve: (v: unknown) => void } | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('bench')) return
    const w = window as unknown as { __selenoraMoonBench?: (ms?: number) => Promise<unknown> }
    w.__selenoraMoonBench = (ms = 3000) =>
      new Promise((resolve) => {
        run.current = { until: performance.now() + ms, frames: 0, t0: performance.now(), resolve }
        invalidate()
      })
    return () => {
      delete w.__selenoraMoonBench
    }
  }, [invalidate])
  useFrame(() => {
    const r = run.current
    if (!r) return
    r.frames += 1
    const s = new THREE.Spherical().setFromVector3(camera.position)
    s.theta += 0.01
    camera.position.setFromSpherical(s)
    camera.lookAt(0, 0, 0)
    if (performance.now() < r.until) {
      invalidate()
      return
    }
    const ms = performance.now() - r.t0
    run.current = null
    const geo = moon.mesh.geometry
    const attrBytes = Object.values(geo.attributes).reduce((a, x) => a + (x as THREE.BufferAttribute).array.byteLength, 0) + (geo.index?.array.byteLength ?? 0)
    const ctx = gl.getContext()
    r.resolve({
      model: moon.modelId,
      frames: r.frames,
      ms: Math.round(ms),
      fps: Math.round((r.frames / ms) * 10000) / 10,
      dpr: gl.getPixelRatio(),
      drawingBuffer: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
      triangles: gl.info.render.triangles,
      calls: gl.info.render.calls,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      geometryMB: Math.round(attrBytes / 1e5) / 10,
      textureMBWithMips: Math.round((moon.textureSize[0] * moon.textureSize[1] * 4 * 4) / 3 / 1e5) / 10,
      texturePx: moon.textureSize,
      maxTextureSize: gl.capabilities.maxTextureSize,
      maxAnisotropy: gl.capabilities.getMaxAnisotropy(),
      renderer: (() => {
        const ext = ctx.getExtension('WEBGL_debug_renderer_info')
        return ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a'
      })(),
    })
  })
  return null
}

/**
 * Display light for the topographic model ONLY: a light that rides with the camera (slightly
 * above-left of the view direction) so relief reads as shape. It is NOT the Sun and casts no
 * shadows; the UI labels it as such.
 */
function ReliefLight() {
  const camera = useThree((s) => s.camera)
  const light = useRef<THREE.DirectionalLight>(null)
  useFrame(() => {
    const l = light.current
    if (!l) return
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(camera.quaternion)
    l.position.copy(camera.position).addScaledVector(up, camera.position.length() * 0.35).addScaledVector(left, camera.position.length() * 0.35)
    l.target.position.set(0, 0, 0)
    l.target.updateMatrixWorld()
  })
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight ref={light} intensity={1.6} />
    </>
  )
}

export default function MoonScene(props: Props) {
  const {
    moon,
    sites,
    selectedId,
    onSelect,
    pickMode = false,
    onSurfacePick,
    draftPick = null,
    landmarks,
    showGraticule,
    command,
    reducedMotion,
    dpr,
    onCamera,
    onReady,
    tiles = [],
  } = props
  const start = presetPose('near').position
  // Camera position in lunar radii (direction × distance), for horizon tests of HTML labels.
  const [camPos, setCamPos] = useState<Vec3>(start)
  // The sphere-ised cube's vertices span r = 1.2719–1.2822 (+0.8 %); overlays sit just above that.
  const grid = useMemo(() => graticule(30, R * moon.surfaceMax * 1.002), [moon])
  // Inverse polar stereographic (same projection as the 2D Explorer) → outline on the globe.
  const footprints = useMemo(
    () =>
      tiles.map((t) => {
        const [x0, y0, x1, y1] = t.bounds_m
        const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
        const pts: Vec3[] = []
        for (let i = 0; i < 4; i++) {
          const [ax, ay] = corners[i]!
          const [bx, by] = corners[i + 1]!
          for (let k = 0; k <= 12; k++) {
            const [lon, lat] = xyToLonLat(ax + ((bx - ax) * k) / 12, ay + ((by - ay) * k) / 12)
            pts.push(latLonToModel(lat, lon, R * moon.surfaceMax * 1.003))
          }
        }
        return { id: t.site_id, pts }
      }),
    [tiles, moon],
  )
  /** True when the surface point is above the camera's horizon: p̂·c > 1 (+ small margin). */
  const facing = (lat: number, lon: number) => {
    const p = latLonToModel(lat, lon)
    return p[0] * camPos[0] + p[1] * camPos[1] + p[2] * camPos[2] > 1.01
  }
  const raf = useRef(0)
  // Surface radius under each pin: computed once per model/site list (a full vertex scan per site).
  const pinRadii = useMemo(() => {
    const m = new Map<string, number>()
    for (const site of sites) m.set(site.id, moon.lit ? moon.surfaceRadiusAt(site.lat, site.lon) * 1.0005 : moon.surfaceMax)
    return m
  }, [moon, sites])
  const draftRadius = draftPick
    ? moon.lit
      ? moon.surfaceRadiusAt(draftPick.lat, draftPick.lon) * 1.0005
      : moon.surfaceMax
    : moon.surfaceMax
  const draftSite: GlobeSite | null = draftPick
    ? { id: '__draft__', name: '…', lat: draftPick.lat, lon: draftPick.lon, slot: null, kind: 'custom' }
    : null

  return (
    <Canvas
      frameloop="demand"
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      camera={{ position: scaleV(start, R), fov: 40, near: 0.005, far: 100 }}
      style={{ touchAction: 'none', cursor: pickMode ? 'crosshair' : undefined }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <color attach="background" args={['#05070f']} />
      <MoonMesh moon={moon} onReady={onReady} pickMode={pickMode} onSurfacePick={onSurfacePick} />
      {moon.lit && <ReliefLight />}
      <AdaptiveFov />
      <Bench moon={moon} />
      <InvalidateOn deps={[showGraticule, sites, selectedId, landmarks, footprints, draftPick, pickMode]} />
      {showGraticule && (
        <group>
          {grid.lines.map((l, i) => (
            <Line key={i} points={l} color="#0B1120" lineWidth={1.2} transparent opacity={0.7} />
          ))}
          <Line points={grid.equator} color="#56D9E9" lineWidth={1.6} />
          <Line points={grid.primeMeridian} color="#F5C674" lineWidth={1.8} />
        </group>
      )}
      {footprints.map((f) => (
        <Line key={f.id} points={f.pts} color="#56D9E9" lineWidth={2} />
      ))}
      {landmarks.map((l) => (
        <Html key={l.id} position={latLonToModel(l.lat, l.lon, R * moon.surfaceMax)} center zIndexRange={[10, 0]}>
          <span
            className="pointer-events-none flex items-center gap-1 font-mono text-[10px] whitespace-nowrap text-fg-2 [text-shadow:0_1px_2px_#000]"
            style={{ display: facing(l.lat, l.lon) ? undefined : 'none' }}
          >
            <span className="size-1.5 rounded-full border border-fg-2" aria-hidden />
            {l.name}
          </span>
        </Html>
      ))}
      {sites.map((s) => (
        <Pin key={s.id} site={s} selected={s.id === selectedId} onSelect={onSelect} visible={facing(s.lat, s.lon)} radius={pinRadii.get(s.id) ?? moon.surfaceMax} />
      ))}
      {draftSite && <Pin site={draftSite} selected onSelect={() => undefined} visible={facing(draftSite.lat, draftSite.lon)} radius={draftRadius} />}
      <CameraRig
        command={command}
        reducedMotion={reducedMotion}
        onCamera={(c) => {
          setCamPos(latLonToModel(c.lat, c.lon, c.distance))
          onCamera(c)
        }}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        onChange={(e) => {
          cancelAnimationFrame(raf.current)
          const cam = (e?.target as unknown as { object: THREE.Camera } | undefined)?.object
          if (!cam) return
          raf.current = requestAnimationFrame(() => {
            const p = cam.position
            setCamPos([p.x / R, p.y / R, p.z / R])
            const ll = modelToLatLon([p.x, p.y, p.z])
            onCamera({ lat: ll.lat, lon: ll.lon, distance: p.length() / R })
          })
        }}
      />
    </Canvas>
  )
}
