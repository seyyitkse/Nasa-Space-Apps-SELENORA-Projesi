/**
 * Three.js / React Three Fiber scene for the real LOLA mesh. Lazy-loaded only
 * when the user opens the 3D view (performance safeguard).
 *
 * - Terrain: GET /maps/mesh vertices (eye-relative, curvature-corrected, ×k).
 * - Observer: Point A/B eye at surface + 2 m (scene origin).
 * - Sun / Earth: direction indicators from JPL Horizons azimuth/elevation converted
 *   with the backend true-north → grid convergence. They are VISUALIZATIONS of a
 *   direction — no shadow or illumination is rendered or implied.
 */
import { Html, Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { bearingToScene, buildTerrainGeometry, gridBearingDeg, type MeshResponse, sightDirection } from './mesh'

export interface BodyDir {
  body: 'sun' | 'earth'
  azimuthDeg: number
  elevationDeg: number
  label: string
}

interface Props {
  mesh: MeshResponse
  eyeZ: number
  exaggeration: number
  gammaDeg: number
  bodies: BodyDir[]
  northLabel: string
  observerLabel: string
  reducedMotion: boolean
}

// Height ramp (low → high): dark slate → steel → pale regolith. Colour encodes height only.
const RAMP = [new THREE.Color('#141c2e'), new THREE.Color('#5b6b86'), new THREE.Color('#dfe6f1')]
function rampColor(h: number, out: THREE.Color) {
  const x = Math.min(1, Math.max(0, h)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x))
  return out.copy(RAMP[i]!).lerp(RAMP[i + 1]!, x - i)
}

function Terrain({ mesh, eyeZ, k }: { mesh: MeshResponse; eyeZ: number; k: number }) {
  const geometry = useMemo(() => {
    const g = buildTerrainGeometry(mesh, eyeZ, k)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3))
    const colors = new Float32Array(g.heights.length * 3)
    const c = new THREE.Color()
    g.heights.forEach((h, i) => {
      rampColor(h, c)
      colors.set([c.r, c.g, c.b], i * 3)
    })
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setIndex(new THREE.BufferAttribute(g.indices, 1))
    geo.computeVertexNormals()
    return geo
  }, [mesh, eyeZ, k])
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.95} metalness={0} flatShading />
    </mesh>
  )
}

/** frameloop="demand" only renders on change: force frames on mount, data change and resize. */
function Invalidate({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target?: THREE.Vector3; update?: () => void } | null
  // Aim at the observer once OrbitControls has registered (it otherwise only re-aims on interaction).
  useEffect(() => {
    camera.lookAt(0, 0, 0)
    controls?.target?.set(0, 0, 0)
    controls?.update?.()
    invalidate()
  }, [camera, controls, invalidate])
  useEffect(() => {
    invalidate()
    const id = window.setTimeout(() => invalidate(), 50)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidate, size.width, size.height, ...deps])
  return null
}

export default function TerrainScene({ mesh, eyeZ, exaggeration: k, gammaDeg, bodies, northLabel, observerLabel, reducedMotion }: Props) {
  const R = mesh.half_extent_m
  const rayLen = R * 0.9
  const northDir = bearingToScene(gridBearingDeg(0, gammaDeg))
  // Start behind the observer, looking along the Sun (or Earth) direction when known.
  const look = bodies[0] ? bearingToScene(gridBearingDeg(bodies[0].azimuthDeg, gammaDeg)) : ([0.6, 0.8] as [number, number])
  const camPos: [number, number, number] = [-look[0] * R * 0.85, R * 0.55, -look[1] * R * 0.85]

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={['#070b16']} />
      <PerspectiveCamera makeDefault position={camPos} fov={50} near={1} far={R * 20} />
      <Invalidate deps={[mesh, k, bodies, eyeZ]} />
      <ambientLight intensity={0.45} />
      {/* Fixed neutral lighting for readability only — NOT the Sun position. */}
      <directionalLight position={[R, R * 2, R * 0.5]} intensity={1.1} />
      <Terrain mesh={mesh} eyeZ={eyeZ} k={k} />

      {/* Observer (scene origin = eye at surface + 2 m) */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[R * 0.015, 16, 16]} />
        <meshBasicMaterial color="#9585FF" />
      </mesh>
      <Line points={[[0, 0, 0], [0, -R * 0.04, 0]]} color="#9585FF" lineWidth={2} />
      <Html position={[0, R * 0.05, 0]} center distanceFactor={undefined} zIndexRange={[10, 0]}>
        <span className="pointer-events-none rounded bg-bg/85 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-violet">{observerLabel}</span>
      </Html>

      {/* True north (after grid convergence) */}
      <Line points={[[0, 0, 0], [northDir[0] * R * 0.5, 0, northDir[1] * R * 0.5]]} color="#94A3B8" lineWidth={1.5} dashed dashSize={R * 0.03} gapSize={R * 0.02} />
      <Html position={[northDir[0] * R * 0.55, 0, northDir[1] * R * 0.55]} center>
        <span className="pointer-events-none font-mono text-[10px] text-fg-2">{northLabel}</span>
      </Html>

      {bodies.map((b) => {
        const d = sightDirection(gridBearingDeg(b.azimuthDeg, gammaDeg), b.elevationDeg, k)
        const len = Math.hypot(d[0], d[2]) || 1
        const end: [number, number, number] = [(d[0] / len) * rayLen, (d[1] / len) * rayLen, (d[2] / len) * rayLen]
        const color = b.body === 'sun' ? '#F5C674' : '#56D9E9'
        return (
          <group key={b.body}>
            <Line points={[[0, 0, 0], end]} color={color} lineWidth={2.5} />
            <mesh position={end}>
              <sphereGeometry args={[R * (b.body === 'sun' ? 0.035 : 0.025), 20, 20]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <Html position={end} center>
              <span className="pointer-events-none -translate-y-5 rounded bg-bg/85 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap" style={{ color }}>
                {b.label}
              </span>
            </Html>
          </group>
        )
      })}

      <OrbitControls makeDefault target={[0, 0, 0]} enableDamping={!reducedMotion} maxPolarAngle={Math.PI * 0.495} minDistance={R * 0.1} maxDistance={R * 5} />
    </Canvas>
  )
}
