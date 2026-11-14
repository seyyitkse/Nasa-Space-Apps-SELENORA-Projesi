import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { BODY_COLORS } from '@/components/shared/siteColors'
import type { HorizonProfile } from '@/services/contracts'

const W = 720
const H = 280
const PAD_X = 36
const PAD_Y = 18

export interface BodyDirection {
  body: 'sun' | 'earth'
  azimuthDeg: number
  elevationDeg: number
}

/** Split a profile into contiguous runs, breaking at null (incomplete-ray) azimuths. */
export function profileRuns(az: number[], el: (number | null)[]): { az: number; el: number }[][] {
  const runs: { az: number; el: number }[][] = []
  let cur: { az: number; el: number }[] = []
  az.forEach((a, i) => {
    const e = el[i]
    if (e === null || e === undefined) {
      if (cur.length) runs.push(cur)
      cur = []
    } else cur.push({ az: a, el: e })
  })
  if (cur.length) runs.push(cur)
  return runs
}

/**
 * Unrolled 360° horizon (azimuth clockwise from true north) with the LOLA
 * terrain silhouette (R2), the geometric 0° horizon and Sun/Earth directions (R1).
 * Gaps where the DEM ray was incomplete are drawn as UNKNOWN, never as 0°.
 */
export const HorizonPanorama = memo(function HorizonPanorama({
  profile,
  bodies,
}: {
  profile: HorizonProfile
  bodies: BodyDirection[]
}) {
  const { t } = useTranslation()
  const finite = profile.horizon_elevation_deg.filter((v): v is number => v !== null)
  const top = Math.max(3, ...finite, ...bodies.map((b) => b.elevationDeg)) + 1
  const bottom = Math.min(-3, ...finite, ...bodies.map((b) => b.elevationDeg)) - 1
  const x = (az: number) => PAD_X + (((az % 360) + 360) % 360) / 360 * (W - 2 * PAD_X)
  const y = (el: number) => PAD_Y + ((top - el) / (top - bottom)) * (H - 2 * PAD_Y)
  const runs = useMemo(() => profileRuns(profile.azimuth_deg, profile.horizon_elevation_deg), [profile])
  const gaps = profile.azimuth_deg.filter((_, i) => profile.horizon_elevation_deg[i] === null)
  const partial = profile.azimuth_deg.filter((_, i) => profile.horizon_elevation_deg[i] !== null && profile.complete[i] === false)
  const binW = (W - 2 * PAD_X) / Math.max(1, profile.azimuth_deg.length)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t('sim.panoramaAria')}>
      <rect x={PAD_X} y={PAD_Y} width={W - 2 * PAD_X} height={H - 2 * PAD_Y} fill="rgba(16,24,39,0.6)" rx={6} />
      {partial.map((a) => (
        <rect key={`p${a}`} x={x(a)} y={PAD_Y} width={binW} height={H - 2 * PAD_Y} fill="rgba(251,191,36,0.07)">
          <title>{`${a}° — ${t('sim.partialRay')}`}</title>
        </rect>
      ))}
      {gaps.map((a) => (
        <rect key={a} x={x(a)} y={PAD_Y} width={binW} height={H - 2 * PAD_Y} fill="rgba(251,191,36,0.22)">
          <title>{`${a}° — ${t('lab.state.UNKNOWN')}`}</title>
        </rect>
      ))}
      {runs.map((run, i) => (
        <path
          key={i}
          d={`M ${x(run[0]!.az)} ${H - PAD_Y} ${run.map((p) => `L ${x(p.az)} ${y(p.el)}`).join(' ')} L ${x(run[run.length - 1]!.az)} ${H - PAD_Y} Z`}
          fill="rgba(110,231,183,0.18)"
          stroke="#6EE7B7"
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line x1={PAD_X} x2={W - PAD_X} y1={y(0)} y2={y(0)} stroke="#F87171" strokeDasharray="6 5" />
      {[0, 90, 180, 270, 360].map((a) => (
        <text key={a} x={x(a === 360 ? 359.999 : a)} y={H - 3} textAnchor="middle" fontSize={11} fill="#94A3B8" fontFamily="JetBrains Mono Variable, monospace">
          {['N', 'E', 'S', 'W', 'N'][a / 90]} {a === 360 ? '' : `${a}°`}
        </text>
      ))}
      {[top, 0, bottom].map((v) => (
        <text key={v} x={PAD_X - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#64748B" fontFamily="JetBrains Mono Variable, monospace">
          {v.toFixed(0)}°
        </text>
      ))}
      {bodies.map((b) => (
        <g key={b.body}>
          <line x1={x(b.azimuthDeg)} x2={x(b.azimuthDeg)} y1={PAD_Y} y2={H - PAD_Y} stroke={BODY_COLORS[b.body]} strokeOpacity={0.35} strokeDasharray="2 4" />
          <circle cx={x(b.azimuthDeg)} cy={y(b.elevationDeg)} r={b.body === 'sun' ? 11 : 9} fill={BODY_COLORS[b.body]} stroke="#070B16" strokeWidth={2}>
            <title>{`${b.body} az ${b.azimuthDeg.toFixed(2)}° el ${b.elevationDeg.toFixed(3)}°`}</title>
          </circle>
        </g>
      ))}
    </svg>
  )
})
