import { FlaskConical, GitCompareArrows, Loader2, Moon, Radio, RefreshCw, Satellite, Sun } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { DataQualityBadge } from '@/components/shared/badges'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { siteColor } from '@/components/shared/siteColors'
import { EmptyState, ErrorState } from '@/components/shared/States'
import { SyntheticBanner } from '@/components/shared/SyntheticBanner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { formatCoord, formatHours, formatPct } from '@/lib/format'
import { usePlannerInput } from '@/features/mission-planner/usePlannerInput'
import { useSyntheticDemo } from '@/features/mission-planner/useSyntheticDemo'
import { toAnalysisRequest, validatePlanner } from '@/features/mission-planner/validation'
import { WeightsEditor } from '@/features/mission-planner/WeightsEditor'
import { CumulativeJointChart, ElevationChart, VisibilityBarChart } from '@/features/site-comparison/Charts'
import { ScoreBreakdown } from '@/features/site-comparison/ScoreBreakdown'
import { VisibilityTimeline } from '@/features/site-comparison/VisibilityTimeline'
import { useMissionStore } from '@/stores/missionStore'
import type { AnalysisCreate, DemoAnalysisResponse } from '@/types/api'

function MetricTiles({ demo }: { demo: DemoAnalysisResponse }) {
  const { t } = useTranslation()
  const metrics = [
    { key: 'sun_visibility_pct', label: t('comparison.sunVisibility'), icon: Sun, fmt: formatPct, better: 'high' },
    { key: 'earth_visibility_pct', label: t('comparison.earthVisibility'), icon: Satellite, fmt: formatPct, better: 'high' },
    { key: 'joint_visibility_pct', label: t('comparison.jointVisibility'), icon: GitCompareArrows, fmt: formatPct, better: 'high' },
    { key: 'longest_darkness_hours', label: t('comparison.longestDarkness'), icon: Moon, fmt: formatHours, better: 'low' },
    { key: 'longest_communication_gap_hours', label: t('comparison.commGap'), icon: Radio, fmt: formatHours, better: 'low' },
  ] as const
  const sites = demo.result.sites
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {metrics.map((m) => {
        const values = sites.map((s) => s.metrics[m.key])
        const best = m.better === 'high' ? Math.max(...values) : Math.min(...values)
        return (
          <Card key={m.key} className="p-4">
            <div className="flex items-start gap-2 text-xs leading-snug text-fg-2">
              <m.icon className="mt-px size-3.5 shrink-0 text-fg-3" aria-hidden /> {m.label}
            </div>
            <ul className="mt-3 space-y-1.5">
              {sites.map((s, i) => {
                const v = s.metrics[m.key]
                return (
                  <li key={s.label} className="flex items-center justify-between gap-2" title={s.label}>
                    <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-fg-3">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: siteColor(i) }} aria-hidden />
                      <span className="font-mono">{String.fromCharCode(65 + i)}</span>
                      <span className="sr-only">{s.label}</span>
                    </span>
                    <span className={`font-mono text-[13px] ${v === best && sites.length > 1 ? 'font-semibold text-fg' : 'text-fg-2'}`}>
                      {m.fmt(v)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}

function Section({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function ComparisonPage() {
  const { t } = useTranslation()
  const demo = useMissionStore((s) => s.demo)
  const input = usePlannerInput()
  const run = useSyntheticDemo()
  const [weights, setWeights] = useState(demo?.result.weights ?? input.weights)

  const canRun = input.referenceLoaded && Object.keys(validatePlanner(input)).length === 0
  const runWith = (body: AnalysisCreate) => run.mutate(body)

  if (!demo) {
    return (
      <PageTransition>
        <PageHeader title={t('comparison.title')} description={t('comparison.description')} />
        <EmptyState
          icon={GitCompareArrows}
          title={t('comparison.emptyTitle')}
          body={t('comparison.emptyBody')}
          actions={
            <>
              <Button variant="primary" disabled={!canRun || run.isPending} onClick={() => runWith(toAnalysisRequest(input))}>
                {run.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />} {t('comparison.runDemo')}
              </Button>
              <Button asChild variant="secondary">
                <Link to="/planner">{t('comparison.goPlanner')}</Link>
              </Button>
            </>
          }
        />
        {run.error && (
          <div className="mt-4">
            <ErrorState error={run.error} />
          </div>
        )}
      </PageTransition>
    )
  }

  const { result, timeline } = demo
  const recompute = () => {
    runWith({
      mission_name: result.mission_name,
      sites: result.sites.map((s) => ({
        label: s.label,
        latitude_deg: s.latitude_deg,
        longitude_deg: s.longitude_deg,
        landing_site_id: s.landing_site_id,
      })),
      start_utc: result.start_utc,
      end_utc: result.end_utc,
      time_step_minutes: result.time_step_minutes,
      horizon_model: result.horizon_model,
      weights,
    })
  }
  const weightsValid = Math.abs(weights.sun_visibility + weights.earth_visibility + weights.joint_visibility - 100) < 0.01

  return (
    <PageTransition>
      <PageHeader
        eyebrow={result.mission_name}
        title={t('comparison.title')}
        description={t('comparison.description')}
        actions={
          <>
            <DataQualityBadge quality={result.data_quality} />
            <Button size="sm" variant="ghost" onClick={() => runWith(toAnalysisRequest(input))} disabled={!canRun || run.isPending}>
              <RefreshCw className={run.isPending ? 'animate-spin' : undefined} /> {t('comparison.runDemo')}
            </Button>
          </>
        }
      />
      <div className="space-y-5">
        <SyntheticBanner />
        {run.error && <ErrorState error={run.error} />}

        {/* site header cards */}
        <div className="grid gap-3 md:grid-cols-2">
          {result.sites.map((s, i) => (
            <Card key={s.label} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="sel-eyebrow text-[10px]" style={{ color: siteColor(i) }}>
                  {i === 0 ? t('common.siteA') : i === 1 ? t('common.siteB') : `#${i + 1}`}
                </div>
                <div className="mt-1 truncate font-display text-base font-semibold">{s.label}</div>
                <div className="font-mono text-[11px] text-fg-3">{formatCoord(s.latitude_deg, s.longitude_deg, 2)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-fg-3">{t('comparison.score')}</div>
                <div className="font-display text-3xl font-semibold" style={{ color: siteColor(i) }}>
                  {s.score?.toFixed(1) ?? '—'}
                </div>
                <div className="font-mono text-[10.5px] text-fg-3">/ 100</div>
              </div>
            </Card>
          ))}
        </div>

        <MetricTiles demo={demo} />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Section title={t('comparison.elevationTitle')} description={timeline.downsampled ? t('comparison.downsampled', { n: timeline.step_minutes }) : undefined}>
            <Tabs defaultValue="sun">
              <TabsList className="mb-4">
                <TabsTrigger value="sun">{t('comparison.sunElevation')}</TabsTrigger>
                <TabsTrigger value="earth">{t('comparison.earthElevation')}</TabsTrigger>
              </TabsList>
              <TabsContent value="sun">
                <ElevationChart timelines={timeline.sites} body="sun" />
              </TabsContent>
              <TabsContent value="earth">
                <ElevationChart timelines={timeline.sites} body="earth" />
              </TabsContent>
            </Tabs>
          </Section>
          <Section title={t('comparison.rankingTitle')}>
            <ScoreBreakdown sites={result.sites} />
          </Section>
        </div>

        <Section title={t('comparison.timelineTitle')}>
          <VisibilityTimeline timelines={timeline.sites} results={result.sites} stepMinutes={timeline.step_minutes} />
        </Section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
          <Section title={t('comparison.visibilityBars')}>
            <VisibilityBarChart sites={result.sites} />
          </Section>
          <Section title={t('comparison.cumulativeTitle')}>
            <CumulativeJointChart timelines={timeline.sites} stepMinutes={timeline.step_minutes} />
          </Section>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-3">
          <Section title={t('comparison.simulator')} description={t('comparison.simulatorHint')}>
            <WeightsEditor value={weights} onChange={setWeights} compact />
            <Button className="mt-4 w-full" variant="secondary" onClick={recompute} disabled={!weightsValid || run.isPending}>
              {run.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {t('comparison.recompute')}
            </Button>
          </Section>
          <Section title={t('comparison.tradeoffs')}>
            <ul className="space-y-3 text-[13px]">
              {result.sites.map((s, i) => (
                <li key={s.label} className="rounded-lg border border-line bg-bg-2/50 p-3">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="size-2 rounded-full" style={{ background: siteColor(i) }} aria-hidden /> {s.label}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                    <dt className="text-fg-3">{t('comparison.longestDarkness')}</dt>
                    <dd className="text-right text-danger/90">{formatHours(s.metrics.longest_darkness_hours)}</dd>
                    <dt className="text-fg-3">{t('comparison.commGap')}</dt>
                    <dd className="text-right text-warning/90">{formatHours(s.metrics.longest_communication_gap_hours)}</dd>
                    <dt className="text-fg-3">{t('comparison.longestJoint')}</dt>
                    <dd className="text-right text-violet">{formatHours(s.metrics.longest_joint_visibility_hours)}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={t('comparison.assumptions')}>
            <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-fg-2 marker:text-fg-3">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <div className="sel-eyebrow mt-4 mb-2 text-[10px]">{t('comparison.limitations')}</div>
            <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-fg-2 marker:text-fg-3">
              {result.limitations.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <div className="mt-4 font-mono text-[10.5px] text-fg-3">
              algorithm {result.algorithm_version} · {result.provenance.map((p) => p.source_id).join(', ')}
            </div>
          </Section>
        </div>
      </div>
    </PageTransition>
  )
}
