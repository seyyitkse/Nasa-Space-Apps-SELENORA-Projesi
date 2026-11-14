import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { BODY_COLORS } from '@/components/shared/siteColors'
import { Badge } from '@/components/ui/badge'

import type { BodyState, EpochState } from '../analysis-data/adapter'
import { STATE_TONE } from '../analysis-data/stateStyle'

const W = 220
const H = 300
const PAD = 22

/**
 * Side-view "sky column" for one body: elevation of the current *sampled* epoch
 * against the geometric 0° horizon (and the terrain horizon when exposed).
 * Trail dots are earlier real samples — nothing is interpolated.
 */
export const ElevationGauge = memo(function ElevationGauge({
  body,
  epochs,
  index,
  terrainHorizonDeg,
  terrainMode,
  liveState,
}: {
  body: 'sun' | 'earth'
  epochs: EpochState[]
  index: number
  /** Terrain horizon elevation at the body's azimuth for this sample (R1), if available. */
  terrainHorizonDeg: number | null | undefined
  terrainMode: boolean
  /** Exact per-epoch backend classification (observer-series), preferred over window-derived state. */
  liveState?: 'VISIBLE' | 'BLOCKED' | 'UNKNOWN' | null
}) {
  const { t } = useTranslation()
  const values = useMemo(
    () => epochs.map((e) => (body === 'sun' ? e.sunElevation : e.earthElevation)),
    [epochs, body],
  )
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v))
  const span = Math.max(3, ...finite.map((v) => Math.abs(v)), Math.abs(terrainHorizonDeg ?? 0)) * 1.15
  const y = (el: number) => PAD + ((span - el) / (2 * span)) * (H - 2 * PAD)
  const cur = values[index] ?? null
  const ep = epochs[index]
  const derived: BodyState = ep ? (body === 'sun' ? ep.sun : ep.earth) : 'UNKNOWN'
  const state: BodyState = terrainMode && liveState ? liveState : derived
  const geo: BodyState = ep ? (body === 'sun' ? ep.sunGeometric : ep.earthGeometric) : 'UNKNOWN'
  const color = BODY_COLORS[body]
  const trail = values.slice(Math.max(0, index - 24), index)
  const name = body === 'sun' ? t('lab.sun') : t('lab.earth')

  return (
    <figure className="flex min-w-0 flex-col items-center gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full max-w-[240px] sm:h-[300px]" role="img" aria-label={`${name}: ${cur === null ? t('lab.state.UNKNOWN') : `${cur.toFixed(3)}°`} · ${t(`lab.state.${state}`)}`}>
        <defs>
          <linearGradient id={`sky-${body}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={body === 'sun' ? '#2a2140' : '#0f2a35'} />
            <stop offset="1" stopColor="#101827" />
          </linearGradient>
          <linearGradient id={`ground-${body}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b2335" />
            <stop offset="1" stopColor="#070B16" />
          </linearGradient>
          <radialGradient id={`glow-${body}`}>
            <stop offset="0" stopColor={color} stopOpacity="0.55" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={W} height={y(0)} rx={14} fill={`url(#sky-${body})`} />
        <rect x={0} y={y(0)} width={W} height={H - y(0)} fill={`url(#ground-${body})`} />
        {/* scale */}
        {[-span, -span / 2, 0, span / 2, span].map((v) => (
          <g key={v}>
            <line x1={0} x2={7} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.5)" />
            <text x={W - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#64748B" fontFamily="JetBrains Mono Variable, monospace">
              {v > 0 ? '+' : v < 0 ? '−' : ''}
              {Math.abs(v).toFixed(1)}°
            </text>
          </g>
        ))}
        <line x1={0} x2={W - 36} y1={y(0)} y2={y(0)} stroke="#F87171" strokeDasharray="5 4" strokeWidth={1.2} />
        <text x={6} y={y(0) - 5} fontSize={9.5} fill="#F87171" fontFamily="JetBrains Mono Variable, monospace">
          {t('sim.geometricHorizon')}
        </text>
        {terrainMode && terrainHorizonDeg !== null && terrainHorizonDeg !== undefined && (
          <>
            <line x1={0} x2={W - 36} y1={y(terrainHorizonDeg)} y2={y(terrainHorizonDeg)} stroke="#6EE7B7" strokeWidth={1.6} />
            <text x={6} y={y(terrainHorizonDeg) + 12} fontSize={9.5} fill="#6EE7B7" fontFamily="JetBrains Mono Variable, monospace">
              {t('sim.terrainHorizon')} {terrainHorizonDeg.toFixed(2)}°
            </text>
          </>
        )}
        {trail.map((v, i) =>
          v === null ? null : (
            <circle key={i} cx={W / 2 - 18 - (trail.length - i) * 2.4} cy={y(v)} r={1.6} fill={color} opacity={0.15 + (i / trail.length) * 0.5} />
          ),
        )}
        {cur !== null ? (
          <g>
            <circle cx={W / 2 - 18} cy={y(cur)} r={22} fill={`url(#glow-${body})`} />
            <circle cx={W / 2 - 18} cy={y(cur)} r={body === 'sun' ? 9 : 7.5} fill={color} stroke="#070B16" strokeWidth={2} />
          </g>
        ) : (
          <text x={W / 2 - 18} y={H / 2} textAnchor="middle" fontSize={11} fill="#FBBF24">
            {t('lab.state.UNKNOWN')}
          </text>
        )}
      </svg>
      <figcaption className="flex w-full flex-col items-center gap-1.5 text-center">
        <span className="font-display text-sm font-semibold" style={{ color }}>
          {name}
        </span>
        <span className="font-mono text-lg text-fg">{cur === null ? '—' : `${cur.toFixed(3)}°`}</span>
        <div className="flex w-full min-w-0 flex-wrap justify-center gap-1.5">
          <Badge tone={STATE_TONE[state]} className="max-w-full whitespace-normal text-center">
            {terrainMode ? t('sim.terrainShort') : t('sim.geometricShort')}: {t(`lab.state.${state}`)}
            {terrainMode && liveState ? ' · live' : ''}
          </Badge>
          {terrainMode && <Badge tone={STATE_TONE[geo]} className="max-w-full whitespace-normal text-center">{t('sim.geometricShort')}: {t(`lab.state.${geo}`)}</Badge>}
        </div>
      </figcaption>
    </figure>
  )
})
