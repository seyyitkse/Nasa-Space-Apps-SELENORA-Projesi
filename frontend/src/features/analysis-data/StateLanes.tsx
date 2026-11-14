import { type KeyboardEvent, memo, type PointerEvent, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { siteColor } from '@/components/shared/siteColors'
import { formatUtc, formatUtcDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { nearestSampleIndex } from './adapter'
import { type LaneBody, laneSegments, stateFill } from './stateStyle'
import type { SiteEpochs } from './useWorkspaceAnalysis'

const W = 1000
const ROW = 11
const GAP = 4
const SITE_GAP = 14

/** SVG patterns for UNKNOWN / UNRESOLVED — rendered once per lane chart. */
export function StatePatterns() {
  return (
    <defs>
      <pattern id="sel-unknown-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="rgba(251,191,36,0.10)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(251,191,36,0.75)" strokeWidth="2" />
      </pattern>
      <pattern id="sel-unresolved-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="6" height="6" fill="rgba(251,191,36,0.06)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(251,191,36,0.4)" strokeWidth="1.5" />
      </pattern>
    </defs>
  )
}

interface Props {
  sites: SiteEpochs[]
  bodies?: LaneBody[]
  stepMinutes: number
  endUtc: string
  cursorT: number | null
  onCursor?: (t: number) => void
  className?: string
  /** Visually emphasise one site (others dimmed). */
  focusIndex?: number
}

/**
 * Shared visibility lanes (Sun / Earth / Joint) for one or more sites, with a
 * scrubbable cursor that always snaps to a sampled epoch.
 */
export const StateLanes = memo(function StateLanes({
  sites,
  bodies = ['sun', 'earth', 'joint'],
  stepMinutes,
  endUtc,
  cursorT,
  onCursor,
  className,
  focusIndex,
}: Props) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const first = sites[0]?.epochs ?? []
  const t0 = first[0]?.t ?? 0
  const t1 = Date.parse(endUtc) || (first[first.length - 1]?.t ?? 1)
  const x = (ms: number) => ((ms - t0) / Math.max(1, t1 - t0)) * W
  const stepMs = stepMinutes * 60_000
  const blockH = bodies.length * (ROW + GAP)
  const H = sites.length * blockH + Math.max(0, sites.length - 1) * SITE_GAP

  const lanes = useMemo(
    () => sites.map((s) => bodies.map((b) => ({ body: b, segs: laneSegments(s.epochs, b, stepMs, t1) }))),
    [sites, bodies, stepMs, t1],
  )

  const ticks = useMemo(() => {
    const days = (t1 - t0) / 86_400_000
    const every = days > 20 ? 7 : days > 8 ? 2 : 1
    const out: number[] = []
    const d0 = new Date(t0)
    d0.setUTCHours(0, 0, 0, 0)
    for (let d = d0.getTime(); d <= t1; d += every * 86_400_000) if (d >= t0) out.push(d)
    return out
  }, [t0, t1])

  const label: Record<LaneBody, string> = {
    sun: t('lab.sun'),
    earth: t('lab.earth'),
    joint: t('lab.joint'),
  }

  const scrub = (e: PointerEvent<SVGSVGElement>) => {
    if (!onCursor || !svgRef.current || first.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const idx = nearestSampleIndex(first, t0 + frac * (t1 - t0))
    const ep = first[idx]
    if (ep) onCursor(ep.t)
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!onCursor || first.length === 0) return
    const idx = cursorT === null ? 0 : nearestSampleIndex(first, cursorT)
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'PageUp' ? 24 : e.key === 'PageDown' ? -24 : 0
    if (!delta) return
    e.preventDefault()
    const ep = first[Math.max(0, Math.min(first.length - 1, idx + delta))]
    if (ep) onCursor(ep.t)
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <div className="hidden w-32 shrink-0 sm:block" style={{ height: H }} aria-hidden>
        {sites.map((s, si) => (
          <div key={s.label} style={{ height: blockH, marginBottom: si < sites.length - 1 ? SITE_GAP : 0 }} className="flex flex-col justify-around">
            {bodies.map((b, bi) => (
              <div key={b} className="flex items-center gap-1.5 truncate text-[10.5px] leading-none text-fg-3">
                {bi === 0 && <span className="size-1.5 shrink-0 rounded-full" style={{ background: siteColor(s.index) }} />}
                <span className={cn('truncate', bi > 0 && 'pl-3')}>{bi === 0 ? `${String.fromCharCode(65 + s.index)} · ${label[b]}` : label[b]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className={cn('block w-full overflow-visible', onCursor && 'cursor-ew-resize touch-none')}
          style={{ height: H }}
          role={onCursor ? 'slider' : 'img'}
          tabIndex={onCursor ? 0 : undefined}
          aria-label={t('lab.lanesAria')}
          aria-valuemin={onCursor ? t0 : undefined}
          aria-valuemax={onCursor ? t1 : undefined}
          aria-valuenow={onCursor && cursorT !== null ? cursorT : undefined}
          aria-valuetext={cursorT !== null ? formatUtc(cursorT) : undefined}
          onPointerDown={(e) => {
            if (!onCursor) return
            e.currentTarget.setPointerCapture(e.pointerId)
            scrub(e)
          }}
          onPointerMove={(e) => e.buttons === 1 && scrub(e)}
          onKeyDown={onKey}
        >
          <StatePatterns />
          {lanes.map((rows, si) => {
            const y0 = si * (blockH + SITE_GAP)
            const dim = focusIndex !== undefined && focusIndex !== si
            return (
              <g key={si} opacity={dim ? 0.45 : 1}>
                {rows.map((row, bi) => {
                  const y = y0 + bi * (ROW + GAP)
                  return (
                    <g key={row.body}>
                      <rect x={0} y={y} width={W} height={ROW} rx={2} fill="rgba(148,163,184,0.05)" />
                      {row.segs.map((s, k) => (
                        <rect key={k} x={x(s.start)} y={y} width={Math.max(0.6, x(s.end) - x(s.start))} height={ROW} fill={stateFill(row.body, s.state)}>
                          <title>{`${label[row.body]}: ${s.state} · ${formatUtc(s.start)} → ${formatUtc(s.end)}`}</title>
                        </rect>
                      ))}
                    </g>
                  )
                })}
              </g>
            )
          })}
          {cursorT !== null && (
            <g pointerEvents="none">
              <line x1={x(cursorT)} x2={x(cursorT)} y1={-4} y2={H + 4} stroke="#F4F7FF" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>
        <div className="relative mt-1.5 h-4 font-mono text-[10px] text-fg-3" aria-hidden>
          {ticks.map((tk) => (
            <span key={tk} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(tk) / W) * 100}%` }}>
              {formatUtcDate(tk).replace(/ \d{4}$/, '')}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
})

export function StateLegend({ terrain }: { terrain: boolean }) {
  const { t } = useTranslation()
  const items: { key: string; label: string; swatch: string }[] = [
    { key: 'sun', label: t('lab.legendSun'), swatch: 'bg-gold' },
    { key: 'earth', label: t('lab.legendEarth'), swatch: 'bg-cyan' },
    { key: 'joint', label: t('lab.legendJoint'), swatch: 'bg-violet' },
    { key: 'below', label: t('lab.state.BELOW_HORIZON'), swatch: 'bg-white/10' },
  ]
  if (terrain) items.push({ key: 'blocked', label: t('lab.state.BLOCKED'), swatch: 'bg-danger/60' })
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-fg-2">
      {items.map((i) => (
        <span key={i.key} className="flex items-center gap-1.5">
          <span className={cn('h-2 w-4 rounded-sm', i.swatch)} aria-hidden /> {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <svg width="16" height="8" aria-hidden>
          <StatePatterns />
          <rect width="16" height="8" fill="url(#sel-unknown-hatch)" />
        </svg>
        {t('lab.state.UNKNOWN')}
      </span>
      {terrain && (
        <span className="flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <StatePatterns />
            <rect width="16" height="8" fill="url(#sel-unresolved-hatch)" />
          </svg>
          {t('lab.state.UNRESOLVED')}
        </span>
      )}
    </div>
  )
}
