import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileWarning,
  Lightbulb,
  ListChecks,
  Loader2,
  type LucideIcon,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { DataQualityBadge, StateBadge } from '@/components/shared/badges'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition, staggerChild, staggerParent } from '@/components/shared/PageTransition'
import { siteColor } from '@/components/shared/siteColors'
import { ErrorState } from '@/components/shared/States'
import { SyntheticBanner } from '@/components/shared/SyntheticBanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/misc'
import { useAnalyses, useAnalysis, useDataSources, useExplanation, useHealth } from '@/hooks/useApi'
import { formatHours, formatPct, formatUtc } from '@/lib/format'
import { ApiError } from '@/services/apiClient'
import { queryKeys, selenoraApi } from '@/services/selenoraApi'
import { useMissionStore } from '@/stores/missionStore'
import type { AIMissionReport, AnalysisResult, ExplainResponse } from '@/types/api'

type SectionKey =
  | 'summary'
  | 'findings'
  | 'advantages'
  | 'disadvantages'
  | 'tradeoffs'
  | 'recommendation'
  | 'limitations'
  | 'sources'

const SECTIONS: { key: SectionKey; icon: LucideIcon; wide?: boolean }[] = [
  { key: 'summary', icon: Sparkles, wide: true },
  { key: 'findings', icon: Lightbulb },
  { key: 'recommendation', icon: Scale },
  { key: 'advantages', icon: ThumbsUp },
  { key: 'disadvantages', icon: ThumbsDown },
  { key: 'tradeoffs', icon: ListChecks },
  { key: 'limitations', icon: FileWarning },
]

function ReportBody({
  section,
  report,
  recommended,
  result,
}: {
  section: SectionKey
  report: AIMissionReport | null
  recommended: string | null
  result: AnalysisResult | null
}) {
  const { t } = useTranslation()
  if (!report) {
    return (
      <>
        <div className="space-y-2" aria-hidden>
          <div className="h-2 w-11/12 rounded bg-white/[0.05]" />
          <div className="h-2 w-9/12 rounded bg-white/[0.05]" />
        </div>
        <p className="mt-3 text-[11.5px] text-fg-3">{t('analyst.placeholder')}</p>
      </>
    )
  }
  switch (section) {
    case 'summary':
      return <p className="text-[13px] leading-relaxed text-fg-2">{report.summary}</p>
    case 'findings':
      return (
        <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-fg-2 marker:text-fg-3">
          {report.key_findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )
    case 'recommendation':
      return (
        <div className="space-y-2 text-[13px] text-fg-2">
          <p className="font-medium text-fg">
            {recommended
              ? t('analyst.facts.ranking', {
                  site: recommended,
                  score: result?.sites.find((s) => s.label === recommended)?.score?.toFixed(2) ?? '—',
                })
              : t('analyst.facts.noRanking')}
          </p>
          <p className="leading-relaxed">{report.comparison_explanation}</p>
          <p className="text-[11px] text-fg-3">{t('analyst.recommendationSource')}</p>
        </div>
      )
    case 'advantages':
      return (
        <ul className="space-y-2 text-[13px] text-fg-2">
          {Object.entries(report.site_advantages).map(([site, items]) => (
            <li key={site}>
              <div className="font-medium text-fg">{site}</div>
              <ul className="mt-1 list-disc pl-4 marker:text-fg-3">
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )
    case 'disadvantages':
      return (
        <ul className="space-y-2 text-[13px] text-fg-2">
          {Object.entries(report.site_disadvantages).map(([site, items]) => (
            <li key={site}>
              <div className="font-medium text-fg">{site}</div>
              <ul className="mt-1 list-disc pl-4 marker:text-fg-3">
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )
    case 'tradeoffs':
      return (
        <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-fg-2 marker:text-fg-3">
          {report.mission_tradeoffs.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )
    case 'limitations':
      return (
        <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-fg-2 marker:text-fg-3">
          {[...report.scientific_limitations, ...report.data_quality_notes].map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )
    default:
      return null
  }
}

export default function AnalystPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const health = useHealth()
  const sources = useDataSources()
  const analyses = useAnalyses()
  const demo = useMissionStore((s) => s.demo)
  const [lang, setLang] = useState<'en' | 'tr'>('en')
  const [selectedId, setSelectedId] = useState<string>('')
  const [localExplain, setLocalExplain] = useState<ExplainResponse | null>(null)

  const completed = useMemo(
    () => (analyses.data ?? []).filter((a) => a.status === 'COMPLETED'),
    [analyses.data],
  )

  // Prefer stored analysis; fall back to in-memory synthetic demo for evidence preview only.
  const analysisQuery = useAnalysis(selectedId || undefined)
  const storedExplain = useExplanation(selectedId || undefined, lang)

  const result: AnalysisResult | null =
    analysisQuery.data?.status === 'COMPLETED'
      ? analysisQuery.data
      : !selectedId && demo?.result
        ? demo.result
        : null

  const explain = localExplain?.analysis_id === selectedId && localExplain.language === lang
    ? localExplain
    : storedExplain.data && storedExplain.data.language === lang
      ? storedExplain.data
      : localExplain?.analysis_id === selectedId
        ? localExplain
        : null

  const ai = health.data?.components.find((c) => c.name === 'ai_analyst')
  const configured = ai?.status === 'READY'
  const canGenerate = Boolean(selectedId && configured && result)

  const generate = useMutation({
    mutationFn: (regenerate: boolean) =>
      selenoraApi.explainAnalysis(selectedId, { language: lang, regenerate }),
    onSuccess: (data) => {
      setLocalExplain(data)
      void queryClient.invalidateQueries({ queryKey: queryKeys.explanation(selectedId, lang) })
    },
  })

  const leader = result?.sites.find((s) => s.rank === 1 && result.recommended_site_label === s.label)
  const genError = generate.error instanceof ApiError ? generate.error : generate.error

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('common.phase', { n: 3 })}
        title={t('analyst.title')}
        description={t('analyst.description')}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="size-4 text-violet" aria-hidden /> {t('analyst.provider')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {health.isPending ? (
                <Skeleton className="h-10" />
              ) : health.error ? (
                <ErrorState error={health.error} compact onRetry={() => void health.refetch()} />
              ) : (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-bg-2/60 p-3">
                  <p className="text-xs leading-relaxed text-fg-2">
                    {configured ? t('analyst.providerReady') : t('analyst.providerMissing')}
                  </p>
                  {ai && <StateBadge state={ai.status} />}
                </div>
              )}

              <div>
                <div className="sel-eyebrow mb-2 text-[10px]">{t('analyst.selectAnalysis')}</div>
                <NativeSelect
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value)
                    setLocalExplain(null)
                    generate.reset()
                  }}
                >
                  <option value="">{t('analyst.selectPlaceholder')}</option>
                  {completed.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id.slice(0, 8)}… · {a.data_quality}
                    </option>
                  ))}
                </NativeSelect>
                {completed.length === 0 && (
                  <p className="mt-2 text-[11.5px] text-fg-3">
                    {t('analyst.noStored')}{' '}
                    <Link to="/planner" className="text-cyan hover:underline">
                      {t('overview.openPlanner')}
                    </Link>
                  </p>
                )}
              </div>

              <div>
                <div className="sel-eyebrow mb-2 text-[10px]">{t('analyst.language')}</div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('analyst.language')}>
                  {(['en', 'tr'] as const).map((l) => (
                    <Button
                      key={l}
                      role="radio"
                      aria-checked={lang === l}
                      size="sm"
                      variant={lang === l ? 'secondary' : 'ghost'}
                      onClick={() => {
                        setLang(l)
                        setLocalExplain(null)
                        generate.reset()
                      }}
                    >
                      {l === 'en' ? 'English' : 'Türkçe'}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                variant="violet"
                className="w-full"
                disabled={!canGenerate || generate.isPending}
                onClick={() => generate.mutate(false)}
              >
                {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {generate.isPending ? t('analyst.generating') : t('analyst.generate')}
              </Button>
              {explain && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!canGenerate || generate.isPending}
                  onClick={() => generate.mutate(true)}
                >
                  <RefreshCw /> {t('analyst.regenerate')}
                </Button>
              )}
              {!configured && (
                <p className="text-[11.5px] leading-relaxed text-fg-3">{t('analyst.generateDisabled')}</p>
              )}
              {generate.error && <ErrorState error={genError} compact />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" aria-hidden /> {t('analyst.guardrails')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {(t('analyst.guardrailItems', { returnObjects: true }) as string[]).map((g) => (
                  <li key={g} className="flex gap-2 text-[12.5px] leading-relaxed text-fg-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {g}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-5" aria-label={t('analyst.title')}>
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-2">
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="size-4 text-cyan" aria-hidden /> {t('analyst.evidence')}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {result && <DataQualityBadge quality={result.data_quality} />}
                {explain && (
                  <>
                    <Badge tone="violet">{explain.model}</Badge>
                    {explain.cached && <Badge tone="neutral">{t('analyst.cached')}</Badge>}
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!result ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] text-fg-2">{t('analyst.evidenceNone')}</p>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/planner">{t('overview.openPlanner')}</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {result.data_quality === 'SYNTHETIC_DEMO' && <SyntheticBanner />}
                  <div>
                    <div className="sel-eyebrow mb-2 text-[10px]">{t('analyst.deterministicFindings')}</div>
                    <ul className="space-y-2">
                      {result.sites.map((s, i) => (
                        <li
                          key={s.label}
                          className="rounded-lg border border-line bg-bg-2/50 px-3 py-2.5 text-[13px] leading-relaxed text-fg-2"
                        >
                          <span
                            className="mr-2 inline-block size-2 rounded-full align-middle"
                            style={{ background: siteColor(i) }}
                            aria-hidden
                          />
                          {t('analyst.facts.visibility', {
                            site: s.label,
                            sun: formatPct(s.metrics.sun_visibility_pct),
                            earth: formatPct(s.metrics.earth_visibility_pct),
                            joint: formatPct(s.metrics.joint_visibility_pct),
                          })}{' '}
                          {t('analyst.facts.outages', {
                            site: s.label,
                            dark: formatHours(s.metrics.longest_darkness_hours),
                            gap: formatHours(s.metrics.longest_communication_gap_hours),
                          })}
                        </li>
                      ))}
                      <li className="rounded-lg border border-gold/25 bg-gold/[0.05] px-3 py-2.5 text-[13px] text-fg">
                        {leader
                          ? t('analyst.facts.ranking', {
                              site: leader.label,
                              score: leader.score?.toFixed(2),
                            })
                          : t('analyst.facts.noRanking')}
                      </li>
                    </ul>
                  </div>
                  {explain?.unsupported_numbers && explain.unsupported_numbers.length > 0 && (
                    <div className="rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-[12.5px] text-fg-2">
                      {t('analyst.unsupportedWarning')}{' '}
                      <span className="font-mono">{explain.unsupported_numbers.join(', ')}</span>
                    </div>
                  )}
                  {explain && (
                    <p className="font-mono text-[10.5px] text-fg-3">
                      {t('analyst.generatedAt')}: {formatUtc(explain.generated_at)} · prompt{' '}
                      {explain.prompt_version}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <motion.div
            variants={staggerParent}
            initial="hidden"
            animate="show"
            className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2"
          >
            {SECTIONS.map((s) => (
              <motion.div key={s.key} variants={staggerChild} className={s.wide ? 'md:col-span-2' : undefined}>
                <Card className="h-full">
                  <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
                    <CardTitle className="flex items-center gap-2 text-[14px]">
                      <s.icon className="size-4 text-violet" aria-hidden /> {t(`analyst.sections.${s.key}`)}
                    </CardTitle>
                    <span className="sel-eyebrow shrink-0 text-right text-[9.5px] text-fg-3">
                      {explain ? t('analyst.aiLayer') : t('analyst.awaiting')}
                    </span>
                  </CardHeader>
                  <CardContent>
                    {generate.isPending && !explain ? (
                      <Skeleton className="h-16" />
                    ) : (
                      <ReportBody
                        section={s.key}
                        report={explain?.report ?? null}
                        recommended={explain?.recommended_site_label ?? result?.recommended_site_label ?? null}
                        result={result}
                      />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            <motion.div variants={staggerChild}>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-[14px]">
                    <Database className="size-4 text-cyan" aria-hidden /> {t('analyst.sections.sources')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sources.isPending ? (
                    <Skeleton className="h-16" />
                  ) : sources.error ? (
                    <ErrorState error={sources.error} compact />
                  ) : (
                    <ul className="space-y-2">
                      {sources.data.items.map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="truncate text-fg-2">{d.name}</span>
                          <StateBadge state={d.integration_status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </section>
      </div>
    </PageTransition>
  )
}
