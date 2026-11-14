import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { BODY_COLORS, siteColor } from '@/components/shared/siteColors'
import { formatHours, formatUtc, formatUtcDate } from '@/lib/format'
import type { SiteResult, SiteTimeline } from '@/types/api'

import { type Body, longest, segments } from './derive'

const W = 1000
const ROW_H = 12
const ROW_GAP = 5

/**
 * Gantt-style visibility bands per site (Sun / Earth / Joint), with the longest
 * darkness and the longest communication gap highlighted — weaknesses are as
 * visible as strengths (Failure & Trade-off Visualization).
 */
export const VisibilityTimeline = memo(function VisibilityTimeline({
  timelines,
  results,
  stepMinutes,
}: {
  timelines: SiteTimeline[]
  results: SiteResult[]
  stepMinutes: number
}) {
  const { t } = useTranslation()
  const bodies: { key: Body; label: string; color: string }[] = [
    { key: 'sun', label: t('comparison.sunVisibility'), color: BODY_COLORS.sun },
    { key: 'earth', label: t('comparison.earthVisibility'), color: BODY_COLORS.earth },
    { key: 'joint', label: t('comparison.jointVisibility'), color: BODY_COLORS.joint },
  ]
  const first = timelines[0]?.points
  const t0 = first?.[0] ? Date.parse(first[0].t) : 0
  const t1 = first?.length ? Date.parse(first[first.length - 1]!.t) + stepMinutes * 60_000 : 1
  const x = (ms: number) => ((ms - t0) / (t1 - t0)) * W

  const ticks = useMemo(() => {
    const days = (t1 - t0) / 86_400_000
    const every = days > 20 ? 7 : days > 8 ? 3 : 1
    const out: number[] = []
    const start = new Date(t0)
    start.setUTCHours(0, 0, 0, 0)
    for (let d = start.getTime(); d <= t1; d += every * 86_400_000) if (d >= t0) out.push(d)
    return out
  }, [t0, t1])

  const rows = useMemo(
    () =>
      timelines.map((tl) => ({
        label: tl.label,
        bands: bodies.map((b) => ({ ...b, segs: segments(tl.points, b.key, stepMinutes) })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timelines, stepMinutes, t],
  )

  return (
    <div className="space-y-5">
      {rows.map((row, si) => {
        const result = results[si]
        const dark = result ? longest(result.darkness_windows) : null
        const gap = result ? longest(result.communication_gaps) : null
        const h = bodies.length * (ROW_H + ROW_GAP)
        return (
          <div key={row.label}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                <span className="size-2 rounded-full" style={{ background: siteColor(si) }} aria-hidden />
                {row.label}
              </span>
              <span className="font-mono text-[11px] text-fg-3">
                {dark && (
                  <span className="mr-3 text-danger/90">
                    ▮ {t('comparison.longestDarkness')}: {formatHours(dark.duration_hours)}
                  </span>
                )}
                {gap && (
                  <span className="text-warning/90">
                    ▮ {t('comparison.commGap')}: {formatHours(gap.duration_hours)}
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="hidden w-28 shrink-0 flex-col justify-around text-[10.5px] text-fg-3 sm:flex" style={{ height: h }}>
                {row.bands.map((b) => (
                  <span key={b.key} className="truncate leading-none">
                    {b.label}
                  </span>
                ))}
              </div>
              <svg
                viewBox={`0 0 ${W} ${h}`}
                preserveAspectRatio="none"
                className="block w-full min-w-0 flex-1 overflow-visible"
                style={{ height: h }}
                role="img"
                aria-label={`${row.label}: ${bodies.map((b) => b.label).join(', ')}`}
              >
                {row.bands.map((b, bi) => {
                  const y = bi * (ROW_H + ROW_GAP)
                  return (
                    <g key={b.key}>
                      <rect x={0} y={y} width={W} height={ROW_H} rx={2} fill="rgba(148,163,184,0.07)" />
                      {b.segs
                        .filter((s) => s.visible)
                        .map((s, k) => (
                          <rect key={k} x={x(s.start)} y={y} width={Math.max(0.5, x(s.end) - x(s.start))} height={ROW_H} fill={b.color} opacity={0.85}>
                            <title>{`${b.label}: ${formatUtc(s.start)} → ${formatUtc(s.end)}`}</title>
                          </rect>
                        ))}
                      {b.key === 'sun' && dark && (
                        <rect
                          x={x(Date.parse(dark.start_utc))}
                          y={y - 1.5}
                          width={Math.max(1, x(Date.parse(dark.end_utc)) - x(Date.parse(dark.start_utc)))}
                          height={ROW_H + 3}
                          fill="rgba(248,113,113,0.18)"
                          stroke="#F87171"
                          strokeWidth={1.2}
                          vectorEffect="non-scaling-stroke"
                        >
                          <title>{`${t('comparison.longestDarkness')}: ${formatHours(dark.duration_hours)}`}</title>
                        </rect>
                      )}
                      {b.key === 'earth' && gap && (
                        <rect
                          x={x(Date.parse(gap.start_utc))}
                          y={y - 1.5}
                          width={Math.max(1, x(Date.parse(gap.end_utc)) - x(Date.parse(gap.start_utc)))}
                          height={ROW_H + 3}
                          fill="rgba(251,191,36,0.14)"
                          stroke="#FBBF24"
                          strokeWidth={1.2}
                          vectorEffect="non-scaling-stroke"
                        >
                          <title>{`${t('comparison.commGap')}: ${formatHours(gap.duration_hours)}`}</title>
                        </rect>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        )
      })}
      <div className="flex gap-2">
        <div className="hidden w-28 shrink-0 sm:block" />
        <div className="relative h-5 flex-1 font-mono text-[10px] text-fg-3">
          {ticks.map((tk) => (
            <span key={tk} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(tk) / W) * 100}%` }}>
              {formatUtcDate(tk).replace(/ \d{4}$/, '')}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-fg-2">
        {bodies.map((b) => (
          <span key={b.key} className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm" style={{ background: b.color }} aria-hidden /> {b.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm border border-danger bg-danger/20" aria-hidden /> {t('comparison.longestDarkness')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm border border-warning bg-warning/20" aria-hidden /> {t('comparison.commGap')}
        </span>
      </div>
    </div>
  )
})
