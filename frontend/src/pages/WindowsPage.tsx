import { CalendarRange, SunMoon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { DataQualityBadge } from '@/components/shared/badges'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { BODY_COLORS } from '@/components/shared/siteColors'
import { EmptyState, ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/misc'
import { AnalysisPicker } from '@/features/analysis-data/AnalysisPicker'
import type { LaneBody } from '@/features/analysis-data/stateStyle'
import { useWorkspaceAnalysis } from '@/features/analysis-data/useWorkspaceAnalysis'
import { buildHeatmap, dayStartMs } from '@/features/mission-windows/heatmap'
import { formatHours, formatUtc } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Interval } from '@/types/api'

const HOURS = Array.from({ length: 24 }, (_, h) => h)

function IntervalList({
  title,
  items,
  tone,
  from,
  to,
  onPick,
}: {
  title: string
  items: Interval[]
  tone: 'violet' | 'danger' | 'warning'
  from?: number
  to?: number
  onPick: (t: number) => void
}) {
  const { t } = useTranslation()
  const [sort, setSort] = useState<'time' | 'duration'>('duration')
  const filtered = items
    .filter((w) => (from === undefined || Date.parse(w.end_utc) > from) && (to === undefined || Date.parse(w.start_utc) < to))
    .sort((a, b) => (sort === 'duration' ? b.duration_hours - a.duration_hours : Date.parse(a.start_utc) - Date.parse(b.start_utc)))
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-[14px]">{title}</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setSort(sort === 'time' ? 'duration' : 'time')}>
          {sort === 'duration' ? t('windows.sortDuration') : t('windows.sortTime')}
        </Button>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-[12.5px] text-fg-3">{t('windows.none')}</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {filtered.map((w) => (
              <li key={w.start_utc}>
                <button
                  type="button"
                  onClick={() => onPick(Date.parse(w.start_utc))}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-bg-2/50 px-2.5 py-1.5 text-left font-mono text-[11px] hover:border-line-strong"
                >
                  <span className="text-fg-2">
                    {formatUtc(w.start_utc)} → {formatUtc(w.end_utc)}
                  </span>
                  <Badge tone={tone}>{formatHours(w.duration_hours)}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length >= 50 && <p className="mt-2 text-[11px] text-warning">{t('windows.truncated')}</p>}
      </CardContent>
    </Card>
  )
}

export default function WindowsPage() {
  const { t } = useTranslation()
  const ws = useWorkspaceAnalysis()
  const siteIndex = useWorkspaceStore((s) => s.siteIndex)
  const setCursor = useWorkspaceStore((s) => s.setCursor)
  const [body, setBody] = useState<LaneBody>('joint')
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')

  const result = ws.result
  const idx = result ? Math.min(siteIndex, result.sites.length - 1) : 0
  const site = result?.sites[idx]
  const epochs = useMemo(() => ws.sites[idx]?.epochs ?? [], [ws.sites, idx])
  const from = fromDay ? dayStartMs(fromDay) : undefined
  const to = toDay ? dayStartMs(toDay) + 86_400_000 : undefined
  const heat = useMemo(() => buildHeatmap(epochs, body, from, to), [epochs, body, from, to])
  const color = BODY_COLORS[body]
  const terrain = result?.horizon_model === 'TERRAIN'
  const pick = (tms: number) => setCursor(tms)

  if (ws.noAnalyses)
    return (
      <PageTransition>
        <PageHeader title={t('windows.title')} description={t('windows.description')} />
        <EmptyState icon={CalendarRange} title={t('lab.noAnalyses')} body={t('lab.noAnalysesBody')} actions={<Button asChild variant="primary"><Link to="/planner">{t('overview.openPlanner')}</Link></Button>} />
      </PageTransition>
    )

  const bodies: { key: LaneBody; label: string }[] = [
    { key: 'joint', label: t('lab.joint') },
    { key: 'sun', label: t('lab.sun') },
    { key: 'earth', label: t('lab.earth') },
  ]

  return (
    <PageTransition>
      <PageHeader
        title={t('windows.title')}
        description={t('windows.description')}
        actions={result && <DataQualityBadge quality={result.data_quality} />}
      />
      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <AnalysisPicker current={result} />
            <div className="flex flex-wrap items-end gap-3">
              <div role="radiogroup" aria-label={t('windows.body')} className="flex gap-1.5">
                {bodies.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    role="radio"
                    aria-checked={body === b.key}
                    onClick={() => setBody(b.key)}
                    className={cn(
                      'flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-xs font-medium',
                      body === b.key ? 'border-line-strong bg-surface-2 text-fg' : 'border-line text-fg-2 hover:text-fg',
                    )}
                  >
                    <span className="size-2 rounded-full" style={{ background: BODY_COLORS[b.key] }} aria-hidden /> {b.label}
                  </button>
                ))}
              </div>
              <div>
                <Label htmlFor="win-from">{t('windows.from')}</Label>
                <Input id="win-from" type="date" className="w-[160px]" value={fromDay} min={result?.start_utc.slice(0, 10)} max={result?.end_utc.slice(0, 10)} onChange={(e) => setFromDay(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="win-to">{t('windows.to')}</Label>
                <Input id="win-to" type="date" className="w-[160px]" value={toDay} min={result?.start_utc.slice(0, 10)} max={result?.end_utc.slice(0, 10)} onChange={(e) => setToDay(e.target.value)} />
              </div>
              {(fromDay || toDay) && (
                <Button variant="ghost" onClick={() => { setFromDay(''); setToDay('') }}>
                  {t('common.reset')}
                </Button>
              )}
            </div>
            {result && (
              <p className="text-[11.5px] leading-relaxed text-fg-3">
                {t('windows.scope', { start: formatUtc(result.start_utc), end: formatUtc(result.end_utc) })}
              </p>
            )}
          </CardContent>
        </Card>

        {ws.error ? (
          <ErrorState error={ws.error} onRetry={ws.refetch} />
        ) : ws.isPending || !result || !site ? (
          <Skeleton className="h-72" />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('windows.heatmap', { site: site.label })}</CardTitle>
                <CardDescription>{terrain ? t('windows.heatTerrain') : t('windows.heatGeometric')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="-mx-1 overflow-x-auto px-1">
                  <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-[2px] text-[10px]">
                    <thead>
                      <tr>
                        <th className="w-14 text-left font-mono font-normal text-fg-3">UTC</th>
                        {HOURS.map((h) => (
                          <th key={h} className="font-mono font-normal text-fg-3">
                            {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heat.days.map((d) => (
                        <tr key={d}>
                          <th scope="row" className="pr-2 text-left font-mono font-normal whitespace-nowrap text-fg-2">
                            {d.slice(5)}
                          </th>
                          {HOURS.map((h) => {
                            const c = heat.cells.get(`${d}|${h}`)
                            if (!c) return <td key={h} className="h-6 rounded-[3px] bg-white/[0.02]" title={t('windows.noData')} />
                            const frac = c.visible / c.samples
                            const unknown = c.unknown > 0
                            return (
                              <td
                                key={h}
                                className="h-6 cursor-pointer rounded-[3px] outline-offset-1 hover:outline hover:outline-1 hover:outline-fg-2"
                                style={{
                                  background: unknown
                                    ? `repeating-linear-gradient(45deg, rgba(251,191,36,0.55) 0 2px, rgba(251,191,36,0.08) 2px 5px)`
                                    : c.blocked > 0 && c.visible === 0
                                      ? 'rgba(248,113,113,0.45)'
                                      : frac > 0
                                        ? color
                                        : 'rgba(148,163,184,0.10)',
                                  opacity: unknown || frac === 0 ? 1 : 0.35 + 0.65 * frac,
                                }}
                                title={`${d} ${String(h).padStart(2, '0')}:00 UTC — ${t('windows.cellTip', { v: c.visible, n: c.samples, b: c.blocked, u: c.unknown })}`}
                                onClick={() => pick(Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00Z`))}
                              />
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-fg-2">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: color }} /> {t('windows.legendVisible')}</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-white/10" /> {t('windows.legendNot')}</span>
                  {terrain && <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-danger/45" /> {t('lab.state.BLOCKED')}</span>}
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: 'repeating-linear-gradient(45deg, rgba(251,191,36,0.55) 0 2px, rgba(251,191,36,0.08) 2px 5px)' }} /> {t('windows.legendUnknown')}</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-white/[0.02] ring-1 ring-line" /> {t('windows.noData')}</span>
                </div>
                {ws.timeline?.downsampled && <p className="mt-2 text-[11px] text-fg-3">{t('comparison.downsampled', { n: ws.timeline.step_minutes })}</p>}
              </CardContent>
            </Card>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-3">
              <IntervalList title={t('windows.joint')} items={site.joint_windows} tone="violet" from={from} to={to} onPick={pick} />
              <IntervalList title={t('windows.darkness')} items={site.darkness_windows} tone="danger" from={from} to={to} onPick={pick} />
              <IntervalList title={t('windows.gaps')} items={site.communication_gaps} tone="warning" from={from} to={to} onPick={pick} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-fg-3">
              <span>{t('windows.pickHint')}</span>
              <Button asChild size="sm" variant="secondary">
                <Link to="/simulator">
                  <SunMoon /> {t('nav.simulator')}
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </PageTransition>
  )
}
