import { Archive, FileText, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { DataQualityBadge } from '@/components/shared/badges'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { siteColor } from '@/components/shared/siteColors'
import { EmptyState, ErrorState } from '@/components/shared/States'
import { SyntheticBanner } from '@/components/shared/SyntheticBanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { ScienceTransparencyPanel } from '@/features/site-comparison/ScienceTransparencyPanel'
import { useAnalyses, useAnalysis, useExplanation } from '@/hooks/useApi'
import { formatCoord, formatHours, formatPct, formatUtc, formatUtcDate } from '@/lib/format'
import { useMissionStore } from '@/stores/missionStore'
import type { AnalysisResult } from '@/types/api'

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <h3 className="sel-eyebrow mb-3 text-[10.5px]">{title}</h3>
      {children}
    </section>
  )
}

function AiReportBlock({ analysisId }: { analysisId: string }) {
  const { t } = useTranslation()
  const explain = useExplanation(analysisId.startsWith('demo-') ? undefined : analysisId)
  if (analysisId.startsWith('demo-')) {
    return <p className="text-[13px] text-fg-3">{t('reports.aiNone')}</p>
  }
  if (explain.isPending) return <Skeleton className="h-16" />
  if (explain.error || !explain.data) {
    return (
      <p className="text-[13px] text-fg-3">
        {t('reports.aiNone')}{' '}
        <Link to="/analyst" className="text-cyan hover:underline">
          {t('nav.analyst')}
        </Link>
      </p>
    )
  }
  const { report, model, generated_at, recommended_site_label } = explain.data
  return (
    <div className="space-y-3 text-[13px] text-fg-2">
      <p className="text-[11.5px] text-fg-3">{t('reports.aiDisclaimer')}</p>
      <p className="font-mono text-[11px] text-fg-3">
        {model} · {formatUtc(generated_at)}
        {recommended_site_label ? ` · #1 ${recommended_site_label}` : ''}
      </p>
      <p className="leading-relaxed text-fg">{report.summary}</p>
      {report.key_findings.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 marker:text-fg-3">
          {report.key_findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReportView({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="sel-eyebrow text-[10px]">{result.id}</div>
          <CardTitle className="mt-1 text-xl">{result.mission_name}</CardTitle>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <DataQualityBadge quality={result.data_quality} />
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer /> {t('reports.print')}
          </Button>
          <Button size="sm" variant="ghost" disabled title={t('reports.exportPdf')}>
            PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {result.data_quality === 'SYNTHETIC_DEMO' && (
          <div className="mb-5">
            <SyntheticBanner />
          </div>
        )}
        <ReportSection title={t('reports.metadata')}>
          <dl className="grid gap-3 font-mono text-xs sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t('reports.dateRange'), `${formatUtcDate(result.start_utc)} → ${formatUtcDate(result.end_utc)}`],
              [t('planner.resolution'), `${result.time_step_minutes} min`],
              [t('planner.horizonModel'), result.horizon_model],
              ['Algorithm', result.algorithm_version],
              [t('overview.weights'), `${result.weights.sun_visibility}/${result.weights.earth_visibility}/${result.weights.joint_visibility}`],
              ['Created', formatUtc(result.created_at)],
              [t('reports.recommended'), result.recommended_site_label ?? t('reports.none')],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-bg-2/50 p-2.5">
                <dt className="text-[10.5px] text-fg-3">{k}</dt>
                <dd className="mt-0.5 break-words text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </ReportSection>

        <ReportSection title={t('reports.selectedSites')}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {result.sites.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 rounded-lg border border-line bg-bg-2/50 p-3 text-[13px]">
                <span className="size-2 rounded-full" style={{ background: siteColor(i) }} aria-hidden />
                <span className="flex-1 truncate font-medium">{s.label}</span>
                <span className="font-mono text-[11px] text-fg-3">{formatCoord(s.latitude_deg, s.longitude_deg, 3)}</span>
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportSection title={`${t('reports.metrics')} · ${t('reports.comparison')}`}>
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead className="text-fg-3">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Site</th>
                  <th className="py-2 pr-3 font-medium">{t('comparison.sunVisibility')}</th>
                  <th className="py-2 pr-3 font-medium">{t('comparison.earthVisibility')}</th>
                  <th className="py-2 pr-3 font-medium">{t('comparison.jointVisibility')}</th>
                  <th className="py-2 pr-3 font-medium">{t('comparison.longestDarkness')}</th>
                  <th className="py-2 pr-3 font-medium">{t('comparison.commGap')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('comparison.score')}</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {result.sites.map((s) => (
                  <tr key={s.label} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-sans text-fg">{s.label}</td>
                    <td className="py-2 pr-3">{formatPct(s.metrics.sun_visibility_pct)}</td>
                    <td className="py-2 pr-3">{formatPct(s.metrics.earth_visibility_pct)}</td>
                    <td className="py-2 pr-3">{formatPct(s.metrics.joint_visibility_pct)}</td>
                    <td className="py-2 pr-3">{formatHours(s.metrics.longest_darkness_hours)}</td>
                    <td className="py-2 pr-3">{formatHours(s.metrics.longest_communication_gap_hours)}</td>
                    <td className="py-2 pr-3 text-right text-fg">
                      {s.score?.toFixed(2) ?? '—'} {s.rank === 1 && <Badge tone="gold">#1</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>

        <ReportSection title={t('reports.ai')}>
          <AiReportBlock analysisId={result.id} />
        </ReportSection>

        <ReportSection title={t('reports.provenance')}>
          <ul className="space-y-1.5 text-[12.5px] text-fg-2">
            {result.provenance.map((p) => (
              <li key={p.source_id}>
                <span className="font-mono text-fg">{p.source_id}</span> — {p.description}
                {p.version && <span className="font-mono text-fg-3"> ({p.version})</span>}
                {p.retrieved_at && <span className="text-fg-3"> · {formatUtc(p.retrieved_at)}</span>}
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportSection title={t('reports.limitations')}>
          <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-fg-2 marker:text-fg-3">
            {[...result.assumptions, ...result.limitations].map((a) => (
              <li key={a}>{a}</li>
            ))}
            <li>{t('common.researchOnly')}</li>
          </ul>
        </ReportSection>

        <div className="mt-5">
          <ScienceTransparencyPanel result={result} />
        </div>
      </CardContent>
    </Card>
  )
}

function StoredReport({ id }: { id: string }) {
  const { t } = useTranslation()
  const analysis = useAnalysis(id)
  if (analysis.isPending) return <Skeleton className="h-96" />
  if (analysis.error) return <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />
  if (!analysis.data || analysis.data.status !== 'COMPLETED') {
    return <EmptyState icon={FileText} title={t('reports.title')} body={t('comparison.timelineMissing')} />
  }
  return <ReportView result={analysis.data} />
}

export default function ReportsPage() {
  const { t } = useTranslation()
  const { analysisId } = useParams<{ analysisId?: string }>()
  const demo = useMissionStore((s) => s.demo)
  const stored = useAnalyses()

  return (
    <PageTransition>
      <PageHeader title={t('reports.title')} description={t('reports.description')} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="no-print space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Archive className="size-4 text-cyan" aria-hidden /> {t('reports.stored')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stored.isPending ? (
                <Skeleton className="h-12" />
              ) : stored.error ? (
                <ErrorState error={stored.error} compact onRetry={() => void stored.refetch()} />
              ) : stored.data.length === 0 ? (
                <p className="text-[12.5px] text-fg-3">{t('reports.storedNone')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {stored.data.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={`/reports/${a.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-1.5 font-mono text-xs hover:border-cyan/40"
                      >
                        <span className="truncate">{a.id.slice(0, 8)}…</span>
                        <DataQualityBadge quality={a.data_quality} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-gold" aria-hidden /> {t('reports.session')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {demo ? (
                <Link to="/reports" className="block rounded-lg border border-gold/30 bg-gold/[0.05] p-3">
                  <div className="truncate text-[13px] font-medium">{demo.result.mission_name}</div>
                  <div className="mt-1 font-mono text-[10.5px] text-fg-3">{demo.result.id}</div>
                </Link>
              ) : (
                <p className="text-[12.5px] text-fg-3">{t('reports.sessionNone')}</p>
              )}
            </CardContent>
          </Card>
        </aside>
        <div>
          {analysisId ? (
            <StoredReport id={analysisId} />
          ) : demo ? (
            <ReportView result={demo.result} />
          ) : (
            <EmptyState
              icon={FileText}
              title={t('reports.title')}
              body={t('reports.sessionNone')}
              actions={
                <Button asChild variant="primary">
                  <Link to="/planner">{t('overview.openPlanner')}</Link>
                </Button>
              }
            />
          )}
        </div>
      </div>
    </PageTransition>
  )
}
