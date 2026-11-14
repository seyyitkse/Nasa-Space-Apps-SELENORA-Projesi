import { useMutation, useQueries } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  Compass,
  FlaskConical,
  Loader2,
  Mountain,
  Play,
  RotateCcw,
  Satellite,
  Scale,
  Sun,
  SunMoon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { DataQualityBadge } from '@/components/shared/badges'
import { HelpTip, Term } from '@/components/shared/Explain'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { siteColor } from '@/components/shared/siteColors'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Skeleton, Switch } from '@/components/ui/misc'
import { resolveSiteEpochs } from '@/features/analysis-data/adapter'
import { StateLanes, StateLegend } from '@/features/analysis-data/StateLanes'
import { useAnalysisCatalog } from '@/features/analysis-data/useWorkspaceAnalysis'
import { matchingExamples } from '@/features/guided/examples'
import { PlainSummary } from '@/features/guided/PlainSummary'
import { type Objective, OBJECTIVE_WEIGHTS } from '@/features/guided/presets'
import { useAnalysis, useSites, useTimeline } from '@/hooks/useApi'
import { formatCoord, formatUtc, formatUtcDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAnalysisEpochs, useCapabilities } from '@/services/contracts'
import { selenoraApi } from '@/services/selenoraApi'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { LandingSite } from '@/types/api'

const STEPS = ['objective', 'sites', 'date', 'run'] as const
const OBJECTIVES: { key: Objective; icon: typeof Sun }[] = [
  { key: 'sunlight', icon: Sun },
  { key: 'earth', icon: Satellite },
  { key: 'balanced', icon: Scale },
]
const MAX_DAYS = 7

function Stepper({ step }: { step: number }) {
  const { t } = useTranslation()
  return (
    <ol className="flex flex-wrap gap-2" aria-label={t('guided.stepsAria')}>
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px]',
            i === step ? 'border-cyan/50 bg-cyan/10 text-fg' : i < step ? 'border-success/30 text-success' : 'border-line text-fg-3',
          )}
        >
          <span className="grid size-5 place-items-center rounded-full bg-white/5 font-mono text-[10.5px]">{i < step ? <Check className="size-3" /> : i + 1}</span>
          {t(`guided.step.${s}`)}
        </li>
      ))}
    </ol>
  )
}

function GuidedResults({ id, objective }: { id: string; objective: Objective | null }) {
  const { t } = useTranslation()
  const analysis = useAnalysis(id)
  const done = analysis.data?.status === 'COMPLETED'
  const timeline = useTimeline(id, done)
  const caps = useCapabilities()
  const epochsQ = useAnalysisEpochs(id, done && caps.has('analysisEpochs'))
  const setAnalysis = useWorkspaceStore((s) => s.setAnalysis)
  const r = analysis.data
  const sites = useMemo(
    () =>
      r
        ? r.sites.map((s, index) => {
            const tl = timeline.data?.sites.find((x) => x.label === s.label) ?? timeline.data?.sites[index]
            return {
              label: s.label,
              index,
              epochs: resolveSiteEpochs(r, s, tl?.points, epochsQ.data),
            }
          })
        : [],
    [r, timeline.data, epochsQ.data],
  )

  if (analysis.error) return <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />
  if (!r || r.status === 'PENDING' || r.status === 'RUNNING')
    return (
      <Card className="flex items-center gap-3 p-6 text-sm text-fg-2" role="status">
        <Loader2 className="size-5 animate-spin text-cyan" aria-hidden /> {t('guided.running')}
      </Card>
    )
  if (r.status === 'FAILED') return <ErrorState error={new Error(r.limitations[0] ?? t('comparison.failed'))} />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
        <DataQualityBadge quality={r.data_quality} />
        <Badge>{r.horizon_model}</Badge>
        <span className="font-mono">
          {formatUtcDate(r.start_utc)} → {formatUtcDate(r.end_utc)} · {r.time_step_minutes} min
        </span>
        <HelpTip label={t('guided.sourceHelpLabel')} text={t('guided.sourceHelp')} />
      </div>
      <PlainSummary result={r} objective={objective ? OBJECTIVE_WEIGHTS[objective] : undefined} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px]">{t('guided.timelineTitle')}</CardTitle>
          <p className="text-[12.5px] leading-relaxed text-fg-2">
            {t('guided.timelineHelp1')} <Term k="terrainBlocked" />. {t('guided.timelineHelpStriped')} <Term k="unknown" />. {t('guided.timelineHelp2')}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {timeline.isPending ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              <StateLanes sites={sites} stepMinutes={timeline.data?.step_minutes ?? r.time_step_minutes} endUtc={r.end_utc} cursorT={null} />
              <StateLegend terrain={r.horizon_model === 'TERRAIN'} />
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <Button asChild variant="primary" size="lg">
          <Link to="/simulator" onClick={() => setAnalysis(r.id)}>
            <SunMoon /> {t('guided.openSimulator')}
          </Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link to="/simulator?view=3d" onClick={() => setAnalysis(r.id)}>
            <Box /> {t('guided.open3d')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to={`/comparison/${r.id}`}>
            <FlaskConical /> {t('guided.openDetails')}
          </Link>
        </Button>
      </div>
    </div>
  )
}

export default function GuidedMissionPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const resultId = params.get('analysis')
  const paramObjective = params.get('objective') as Objective | null

  const sites = useSites()
  const catalog = useAnalysisCatalog()
  const [step, setStep] = useState(0)
  const [objective, setObjective] = useState<Objective | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [dateMode, setDateMode] = useState<'example' | 'custom'>('example')
  const [exampleId, setExampleId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('2026-12-01')
  const [days, setDays] = useState(3)
  const [useTerrain, setUseTerrain] = useState(false)

  const items = useMemo(() => sites.data?.items ?? [], [sites.data])
  const coverage = useQueries({
    queries: items.map((s) => ({
      queryKey: ['terrain-coverage', s.latitude_deg, s.longitude_deg],
      queryFn: () => selenoraApi.terrainCoverage(s.latitude_deg, s.longitude_deg),
      staleTime: 10 * 60_000,
      retry: 0,
    })),
  })
  const covered = (id: string) => coverage[items.findIndex((s) => s.id === id)]?.data?.covered === true
  const [a, b] = picked.map((id) => items.find((s) => s.id === id)).filter((s): s is LandingSite => Boolean(s))
  const examples = a && b ? matchingExamples(catalog.items, a, b) : []
  const bothCovered = picked.length === 2 && picked.every(covered)

  const run = useMutation({
    mutationFn: () => {
      const start = `${startDate}T00:00:00Z`
      const end = new Date(Date.parse(start) + days * 86_400_000).toISOString().replace('.000Z', 'Z')
      return selenoraApi.createAnalysis({
        mission_name: t('guided.missionName', { a: a!.name, b: b!.name }),
        sites: [a!, b!].map((s) => ({ label: s.name, latitude_deg: s.latitude_deg, longitude_deg: s.longitude_deg, landing_site_id: s.id })),
        start_utc: start,
        end_utc: end,
        time_step_minutes: 60,
        horizon_model: useTerrain && bothCovered ? 'TERRAIN' : 'GEOMETRIC',
        weights: OBJECTIVE_WEIGHTS[objective ?? 'balanced'],
      })
    },
    onSuccess: (s) => navigate(`/mission?analysis=${s.id}&objective=${objective ?? 'balanced'}`),
  })

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1]!, id] : [...p, id]))

  const canNext = [objective !== null, picked.length === 2, dateMode === 'example' ? exampleId !== null : Boolean(startDate), true][step]

  if (resultId)
    return (
      <PageTransition>
        <PageHeader
          eyebrow={t('guided.eyebrow')}
          title={t('guided.resultsTitle')}
          description={t('guided.resultsDesc')}
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/mission')}>
              <RotateCcw /> {t('guided.startOver')}
            </Button>
          }
        />
        <GuidedResults id={resultId} objective={paramObjective && paramObjective in OBJECTIVE_WEIGHTS ? paramObjective : null} />
      </PageTransition>
    )

  return (
    <PageTransition>
      <PageHeader eyebrow={t('guided.eyebrow')} title={t('guided.title')} description={t('guided.description')} />
      <div className="space-y-5">
        <Stepper step={step} />

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('guided.objectiveQ')}</CardTitle>
              <p className="text-[12.5px] text-fg-3">{t('guided.presetNote')}</p>
            </CardHeader>
            <CardContent>
              <div role="radiogroup" aria-label={t('guided.objectiveQ')} className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
                {OBJECTIVES.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={objective === o.key}
                    onClick={() => setObjective(o.key)}
                    className={cn(
                      'flex cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left transition-colors',
                      objective === o.key ? 'border-cyan/60 bg-cyan/[0.08]' : 'border-line bg-bg-2/50 hover:border-line-strong',
                    )}
                  >
                    <o.icon className="size-5 text-cyan" aria-hidden />
                    <span className="font-display text-[15px] font-semibold text-fg">{t(`guided.objective.${o.key}.title`)}</span>
                    <span className="text-[12.5px] leading-relaxed text-fg-2">{t(`guided.objective.${o.key}.body`)}</span>
                    <span className="font-mono text-[10.5px] text-fg-3">
                      ☉ {OBJECTIVE_WEIGHTS[o.key].sun_visibility}% · ⊕ {OBJECTIVE_WEIGHTS[o.key].earth_visibility}% · {t('lab.joint')} {OBJECTIVE_WEIGHTS[o.key].joint_visibility}%
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('guided.sitesQ')}</CardTitle>
              <p className="text-[12.5px] text-fg-3">{t('guided.sitesNote')}</p>
            </CardHeader>
            <CardContent>
              {sites.isPending ? (
                <Skeleton className="h-48" />
              ) : sites.error ? (
                <ErrorState error={sites.error} onRetry={() => void sites.refetch()} />
              ) : (
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
                  {items.map((s) => {
                    const idx = picked.indexOf(s.id)
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          aria-pressed={idx >= 0}
                          onClick={() => togglePick(s.id)}
                          className={cn(
                            'flex h-full w-full cursor-pointer flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-colors',
                            idx >= 0 ? 'border-cyan/60 bg-cyan/[0.07]' : 'border-line bg-bg-2/50 hover:border-line-strong',
                          )}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-[13.5px] font-medium text-fg">{s.name}</span>
                            {idx >= 0 && (
                              <span className="grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-bg" style={{ background: siteColor(idx) }}>
                                {String.fromCharCode(65 + idx)}
                              </span>
                            )}
                          </span>
                          <span className="text-[12px] leading-relaxed text-fg-2">
                            {t(`guided.siteNotes.${s.id as 'nobile'}`, { defaultValue: s.description })}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {covered(s.id) && (
                              <Badge tone="success">
                                <Mountain className="size-3" aria-hidden /> {t('guided.has5m')}
                              </Badge>
                            )}
                            <Badge tone="neutral" className="normal-case">{formatCoord(s.latitude_deg, s.longitude_deg, 2)}</Badge>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && a && b && (
          <Card>
            <CardHeader>
              <CardTitle>{t('guided.dateQ')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div role="radiogroup" aria-label={t('guided.dateQ')} className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
                {(['example', 'custom'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={dateMode === m}
                    onClick={() => setDateMode(m)}
                    className={cn('cursor-pointer rounded-xl border p-3.5 text-left', dateMode === m ? 'border-cyan/60 bg-cyan/[0.07]' : 'border-line bg-bg-2/50')}
                  >
                    <div className="text-[13.5px] font-medium text-fg">{t(`guided.dateMode.${m}.title`)}</div>
                    <div className="mt-1 text-[12px] leading-relaxed text-fg-2">{t(`guided.dateMode.${m}.body`)}</div>
                  </button>
                ))}
              </div>
              {dateMode === 'example' ? (
                catalog.isPending ? (
                  <Skeleton className="h-16" />
                ) : examples.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line-strong p-3.5 text-[12.5px] text-fg-2">{t('guided.noExample')}</p>
                ) : (
                  <ul className="space-y-2">
                    {examples.map((ex) => (
                      <li key={ex.id}>
                        <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3', exampleId === ex.id ? 'border-cyan/60 bg-cyan/[0.06]' : 'border-line')}>
                          <input type="radio" name="example" className="mt-1 accent-[#56D9E9]" checked={exampleId === ex.id} onChange={() => setExampleId(ex.id)} />
                          <span className="min-w-0 text-[12.5px]">
                            <span className="block font-medium text-fg">{t('guided.exampleLabel', { date: formatUtc(ex.created_at) })}</span>
                            <span className="block font-mono text-[11px] text-fg-3">
                              {ex.horizon_model} · {formatUtcDate(ex.start_utc)} → {formatUtcDate(ex.end_utc)} · {ex.data_quality}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="g-start">{t('guided.startDate')}</Label>
                    <Input id="g-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="g-days">{t('guided.days', { max: MAX_DAYS })}</Label>
                    <Input id="g-days" type="number" min={1} max={MAX_DAYS} value={days} onChange={(e) => setDays(Math.max(1, Math.min(MAX_DAYS, Number(e.target.value) || 1)))} />
                  </div>
                  <div>
                    <Label htmlFor="g-terrain" className="flex items-center gap-1">
                      {t('guided.includeTerrain')} <HelpTip label={t('guided.includeTerrain')} text={t('guided.terrainHelp')} />
                    </Label>
                    <div className="flex h-10 items-center gap-2">
                      <Switch id="g-terrain" checked={useTerrain && bothCovered} disabled={!bothCovered} onCheckedChange={setUseTerrain} />
                      <span className="text-[11.5px] text-fg-3">{bothCovered ? t('guided.terrainAvailable') : t('guided.terrainUnavailable')}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 3 && a && b && (
          <Card>
            <CardHeader>
              <CardTitle>{t('guided.reviewTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-bg-2/50 p-3">
                  <dt className="text-[11px] text-fg-3">{t('guided.step.objective')}</dt>
                  <dd className="text-fg">{t(`guided.objective.${objective ?? 'balanced'}.title`)}</dd>
                </div>
                <div className="rounded-lg border border-line bg-bg-2/50 p-3">
                  <dt className="text-[11px] text-fg-3">{t('guided.step.sites')}</dt>
                  <dd className="text-fg">A: {a.name} · B: {b.name}</dd>
                </div>
                <div className="rounded-lg border border-line bg-bg-2/50 p-3 sm:col-span-2">
                  <dt className="text-[11px] text-fg-3">{t('guided.step.date')}</dt>
                  <dd className="text-fg">
                    {dateMode === 'example'
                      ? t('guided.reviewExample')
                      : t('guided.reviewCustom', { start: startDate, days, model: useTerrain && bothCovered ? 'TERRAIN' : 'GEOMETRIC' })}
                  </dd>
                </div>
              </dl>
              <p className="text-[12.5px] leading-relaxed text-fg-3">
                {t('guided.reviewNote')} <Term k="ephemeris" />.
              </p>
              {dateMode === 'example' ? (
                <Button size="lg" variant="primary" className="w-full sm:w-auto" onClick={() => navigate(`/mission?analysis=${exampleId}&objective=${objective ?? 'balanced'}`)}>
                  <Compass /> {t('guided.loadExample')}
                </Button>
              ) : (
                <Button size="lg" variant="primary" className="w-full sm:w-auto" disabled={run.isPending} onClick={() => run.mutate()}>
                  {run.isPending ? <Loader2 className="animate-spin" /> : <Play />} {run.isPending ? t('guided.running') : t('guided.runReal')}
                </Button>
              )}
              {run.error && <ErrorState error={run.error} />}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft /> {t('guided.back')}
          </Button>
          {step < 3 && (
            <Button variant="secondary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              {t('guided.next')} <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
