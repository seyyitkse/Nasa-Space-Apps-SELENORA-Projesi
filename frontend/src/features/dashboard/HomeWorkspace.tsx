import { ArrowRight, CalendarRange, Cpu, GitCompareArrows, ShieldAlert, SunMoon, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { DataQualityBadge, StateBadge } from '@/components/shared/badges'
import { siteColor } from '@/components/shared/siteColors'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { recommendationStatus } from '@/features/analysis-data/adapter'
import { useAnalysisCatalog } from '@/features/analysis-data/useWorkspaceAnalysis'
import { useHealth } from '@/hooks/useApi'
import { formatPct, formatUtcDate } from '@/lib/format'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { AnalysisResult } from '@/types/api'

/** Engine mode from live /health — never hardcoded. */
export function EngineModeCard() {
  const { t } = useTranslation()
  const { data, isPending, error, refetch } = useHealth()
  const get = (n: string) => data?.components.find((c) => c.name === n)
  const rows = [
    { name: 'scientific_engine', label: t('home.engineEphemeris') },
    { name: 'terrain_model', label: t('home.engineTerrain') },
    { name: 'ai_analyst', label: t('home.engineAi') },
  ]
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="size-4 text-cyan" aria-hidden /> {t('home.engineMode')}
        </CardTitle>
        <CardDescription>{t('overview.systemHealthText')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-32" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const c = get(r.name)
              return (
                <div key={r.name} className="rounded-xl border border-line bg-bg-2/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-fg">{r.label}</span>
                    {c ? <StateBadge state={c.status} /> : <Badge>—</Badge>}
                  </div>
                  {c && <p className="mt-1 text-[11.5px] leading-relaxed text-fg-3">{c.detail}</p>}
                </div>
              )
            })}
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="cyan">GEOMETRIC</Badge>
              {get('terrain_model')?.status === 'READY' && <Badge tone="success">TERRAIN</Badge>}
              <span className="font-mono text-[10.5px] text-fg-3">algorithm {data.algorithm_version}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RecommendationLine({ a }: { a: AnalysisResult }) {
  const { t } = useTranslation()
  const st = recommendationStatus(a)
  if (st.kind === 'recommended')
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-fg-2">
        <Trophy className="size-3.5 text-gold" aria-hidden /> {st.label}
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-fg-3">
      <ShieldAlert className="size-3.5 text-warning" aria-hidden /> {st.kind === 'tie' ? t('lab.tie') : t(`lab.refusedShort.${st.reason}`)}
    </span>
  )
}

export function RecentAnalyses() {
  const { t } = useTranslation()
  const { items, isPending, error, refetch } = useAnalysisCatalog()
  const setAnalysis = useWorkspaceStore((s) => s.setAnalysis)
  const featured = items[0]
  const rest = items.slice(1, 5)

  return (
    <section aria-labelledby="recent-title" className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <h2 id="recent-title" className="font-display text-lg font-semibold">
          {t('home.recent')}
        </h2>
        <Button asChild size="sm" variant="ghost">
          <Link to="/reports">
            {t('nav.reports')} <ArrowRight />
          </Link>
        </Button>
      </div>
      {isPending ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !featured ? (
        <Card className="p-6 text-[13px] text-fg-2">
          {t('lab.noAnalysesBody')}{' '}
          <Link className="text-cyan hover:underline" to="/planner">
            {t('overview.openPlanner')}
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-violet/10 blur-3xl" aria-hidden />
            <CardHeader>
              <div className="sel-eyebrow text-[10px] text-violet">{t('home.featured')}</div>
              <CardTitle className="text-lg">{featured.mission_name}</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <DataQualityBadge quality={featured.data_quality} />
                <Badge>{featured.horizon_model}</Badge>
                <span className="font-mono text-[11px] text-fg-3">
                  {formatUtcDate(featured.start_utc)} → {formatUtcDate(featured.end_utc)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {featured.sites.slice(0, 4).map((s, i) => (
                  <div key={s.label} className="rounded-xl border border-line bg-bg-2/50 p-3">
                    <div className="flex items-center gap-1.5 truncate text-[12.5px] font-medium">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: siteColor(i) }} aria-hidden />
                      <span className="truncate">{s.label}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-1 font-mono text-[10.5px]">
                      <div>
                        <dt className="text-fg-3">☉</dt>
                        <dd className="text-fg">{formatPct(s.metrics.sun_visibility_pct)}</dd>
                      </div>
                      <div>
                        <dt className="text-fg-3">⊕</dt>
                        <dd className="text-fg">{formatPct(s.metrics.earth_visibility_pct)}</dd>
                      </div>
                      <div>
                        <dt className="text-fg-3">{t('comparison.score')}</dt>
                        <dd className="text-fg">{s.score?.toFixed(1) ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <RecommendationLine a={featured} />
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="primary">
                  <Link to={`/comparison/${featured.id}`}>
                    <GitCompareArrows /> {t('nav.comparison')}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/simulator" onClick={() => setAnalysis(featured.id)}>
                    <SunMoon /> {t('nav.simulator')}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/windows" onClick={() => setAnalysis(featured.id)}>
                    <CalendarRange /> {t('nav.windows')}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
          <ul className="space-y-2.5">
            {rest.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/comparison/${a.id}`}
                  className="sel-card block p-3.5 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{a.mission_name}</span>
                    <DataQualityBadge quality={a.data_quality} />
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] text-fg-3">
                    {a.horizon_model} · {formatUtcDate(a.start_utc)} → {formatUtcDate(a.end_utc)} · {a.sites.length} {t('home.sites')}
                  </div>
                  <div className="mt-1.5">
                    <RecommendationLine a={a} />
                  </div>
                </Link>
              </li>
            ))}
            {rest.length === 0 && <li className="text-[12.5px] text-fg-3">{t('home.onlyOne')}</li>}
          </ul>
        </div>
      )}
    </section>
  )
}
