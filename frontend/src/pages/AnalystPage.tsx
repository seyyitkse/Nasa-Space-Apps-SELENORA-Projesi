import {
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileWarning,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  Scale,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { DataQualityBadge, StateBadge } from '@/components/shared/badges'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition, staggerChild, staggerParent } from '@/components/shared/PageTransition'
import { siteColor } from '@/components/shared/siteColors'
import { ErrorState } from '@/components/shared/States'
import { SyntheticBanner } from '@/components/shared/SyntheticBanner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton, Tooltip } from '@/components/ui/misc'
import { useDataSources, useHealth } from '@/hooks/useApi'
import { formatHours, formatPct } from '@/lib/format'
import { useMissionStore } from '@/stores/missionStore'

type SectionKey = 'summary' | 'findings' | 'advantages' | 'disadvantages' | 'tradeoffs' | 'recommendation' | 'limitations' | 'sources'

const SECTIONS: { key: SectionKey; icon: LucideIcon; wide?: boolean }[] = [
  { key: 'summary', icon: Sparkles, wide: true },
  { key: 'findings', icon: Lightbulb },
  { key: 'recommendation', icon: Scale },
  { key: 'advantages', icon: ThumbsUp },
  { key: 'disadvantages', icon: ThumbsDown },
  { key: 'tradeoffs', icon: ListChecks },
  { key: 'limitations', icon: FileWarning },
]

export default function AnalystPage() {
  const { t } = useTranslation()
  const health = useHealth()
  const sources = useDataSources()
  const demo = useMissionStore((s) => s.demo)
  const [lang, setLang] = useState<'en' | 'tr'>('en')

  const ai = health.data?.components.find((c) => c.name === 'ai_analyst')
  const configured = ai?.status === 'READY'
  const result = demo?.result

  const leader = result?.sites.find((s) => s.rank === 1 && result.recommended_site_label === s.label)

  return (
    <PageTransition>
      <PageHeader
        eyebrow="DeepSeek · Explainable AI"
        title={t('analyst.title')}
        description={t('analyst.description')}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ---------- Control rail ---------- */}
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
                <div className="sel-eyebrow mb-2 text-[10px]">{t('analyst.language')}</div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('analyst.language')}>
                  {(['en', 'tr'] as const).map((l) => (
                    <Button
                      key={l}
                      role="radio"
                      aria-checked={lang === l}
                      size="sm"
                      variant={lang === l ? 'secondary' : 'ghost'}
                      onClick={() => setLang(l)}
                    >
                      {l === 'en' ? 'English' : 'Türkçe'}
                    </Button>
                  ))}
                </div>
              </div>
              <Tooltip content={t('analyst.generateDisabled')} side="top">
                {/* span wrapper keeps the tooltip working on a disabled button */}
                <span className="block" tabIndex={0}>
                  <Button variant="violet" className="w-full" disabled aria-describedby="gen-note">
                    <Sparkles /> {t('analyst.generate')}
                  </Button>
                </span>
              </Tooltip>
              <p id="gen-note" className="text-[11.5px] leading-relaxed text-fg-3">
                {t('analyst.generateDisabled')}
              </p>
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

        {/* ---------- Workspace ---------- */}
        <section className="space-y-5" aria-label={t('analyst.title')}>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="size-4 text-cyan" aria-hidden /> {t('analyst.evidence')}
              </CardTitle>
              {result && <DataQualityBadge quality={result.data_quality} />}
            </CardHeader>
            <CardContent className="space-y-4">
              {!result ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] text-fg-2">{t('analyst.evidenceNone')}</p>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/comparison">{t('comparison.runDemo')}</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {result.data_quality === 'SYNTHETIC_DEMO' && <SyntheticBanner />}
                  <div>
                    <div className="sel-eyebrow mb-2 text-[10px]">{t('analyst.deterministicFindings')}</div>
                    <ul className="space-y-2">
                      {result.sites.map((s, i) => (
                        <li key={s.label} className="rounded-lg border border-line bg-bg-2/50 px-3 py-2.5 text-[13px] leading-relaxed text-fg-2">
                          <span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ background: siteColor(i) }} aria-hidden />
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
                          ? t('analyst.facts.ranking', { site: leader.label, score: leader.score?.toFixed(2) })
                          : t('analyst.facts.noRanking')}
                      </li>
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            {SECTIONS.map((s) => (
              <motion.div key={s.key} variants={staggerChild} className={s.wide ? 'md:col-span-2' : undefined}>
                <Card className="h-full">
                  <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
                    <CardTitle className="flex items-center gap-2 text-[14px]">
                      <s.icon className="size-4 text-violet" aria-hidden /> {t(`analyst.sections.${s.key}`)}
                    </CardTitle>
                    <span className="sel-eyebrow shrink-0 text-right text-[9.5px] text-fg-3">{t('analyst.awaiting')}</span>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2" aria-hidden>
                      <div className="h-2 w-11/12 rounded bg-white/[0.05]" />
                      <div className="h-2 w-9/12 rounded bg-white/[0.05]" />
                      {s.wide && <div className="h-2 w-10/12 rounded bg-white/[0.05]" />}
                    </div>
                    <p className="mt-3 text-[11.5px] text-fg-3">{t('analyst.placeholder')}</p>
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
