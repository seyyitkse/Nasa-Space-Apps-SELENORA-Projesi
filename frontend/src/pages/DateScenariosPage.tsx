import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { DataQualityBadge } from '@/components/shared/badges'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  hasScenarioErrors,
  MAX_SCENARIOS,
  MAX_SCENARIO_DAYS,
  MAX_TOTAL_SCENARIO_SAMPLES,
  SCENARIO_TIME_STEPS,
  scenarioSampleCount,
  toScenarioRequest,
  validateScenarioPlanner,
  type ScenarioErrorKey,
  type ScenarioPlannerInput,
  type ScenarioWindowDraft,
} from '@/features/date-scenarios/validation'
import { WeightsEditor } from '@/features/mission-planner/WeightsEditor'
import { useScenarioComparison, useSites } from '@/hooks/useApi'
import { formatCoord, formatHours, formatPct, formatUtc } from '@/lib/format'
import { queryKeys, selenoraApi } from '@/services/selenoraApi'
import { DEFAULT_WEIGHTS, resolveSite, type SiteRef, useMissionStore } from '@/stores/missionStore'
import type { ScenarioComparisonResult, ScenarioEvidence } from '@/types/api'

const DEFAULT_SCENARIOS: ScenarioWindowDraft[] = [
  { id: 'dec-2026', label: 'December 2026', start: '2026-12-01T00:00', end: '2026-12-15T00:00' },
  { id: 'jan-2027', label: 'January 2027', start: '2027-01-01T00:00', end: '2027-01-15T00:00' },
  { id: 'feb-2027', label: 'February 2027', start: '2027-02-01T00:00', end: '2027-02-15T00:00' },
]

function encodeRef(ref: SiteRef | null) {
  return ref ? `${ref.kind}:${ref.id}` : ''
}

function decodeRef(value: string): SiteRef | null {
  const [kind, ...rest] = value.split(':')
  if ((kind !== 'reference' && kind !== 'custom') || rest.length === 0) return null
  return { kind, id: rest.join(':') }
}

function shiftUtcInput(value: string, days: number) {
  const parsed = Date.parse(`${value}:00Z`)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 16)
}

function ScenarioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg/35 p-3">
      <div className="text-[11px] text-fg-3">{label}</div>
      <div className="mt-1 font-mono text-base font-semibold text-fg">{value}</div>
    </div>
  )
}

function EvidenceCard({ item, recommended }: { item: ScenarioEvidence; recommended: boolean }) {
  const { t } = useTranslation()
  const terrainIncomplete =
    item.data_quality === 'LOCAL_TERRAIN_PARTIAL' ||
    (item.site.terrain?.sun_unknown_fraction ?? 0) > 0 ||
    (item.site.terrain?.earth_unknown_fraction ?? 0) > 0
  return (
    <Card className={recommended ? 'border-cyan/45 shadow-[0_0_30px_-20px_rgb(86_217_233/0.7)]' : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{item.site.rank ? `#${item.site.rank}` : '—'}</Badge>
              {recommended && <Badge tone="cyan">{t('scenarios.recommended')}</Badge>}
            </div>
            <CardTitle className="text-lg">{item.label}</CardTitle>
            <CardDescription>{formatUtc(item.start_utc)} → {formatUtc(item.end_utc)}</CardDescription>
          </div>
          <DataQualityBadge quality={item.data_quality} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <ScenarioMetric label={t('scenarios.sun')} value={formatPct(item.site.metrics.sun_visibility_pct)} />
          <ScenarioMetric label={t('scenarios.earth')} value={formatPct(item.site.metrics.earth_visibility_pct)} />
          <ScenarioMetric label={t('scenarios.joint')} value={formatPct(item.site.metrics.joint_visibility_pct)} />
          <ScenarioMetric label={t('scenarios.darkness')} value={formatHours(item.site.metrics.longest_darkness_hours)} />
          <ScenarioMetric label={t('scenarios.commGap')} value={formatHours(item.site.metrics.longest_communication_gap_hours)} />
          <ScenarioMetric label={t('scenarios.score')} value={item.site.score == null ? '—' : item.site.score.toFixed(2)} />
        </div>
        {terrainIncomplete && (
          <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/[0.06] p-3 text-xs leading-relaxed text-fg-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>{t('scenarios.unknownTerrain')}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-[11px] text-fg-3">
          <Badge tone="neutral">{t('scenarios.samples', { n: item.sample_count })}</Badge>
          <Badge tone="neutral">{item.algorithm_version}</Badge>
        </div>
        <details className="rounded-xl border border-line px-3 py-2 text-xs text-fg-2">
          <summary className="cursor-pointer font-medium text-fg">{t('scenarios.evidenceDetails')}</summary>
          <div className="mt-3 space-y-3">
            <div>
              <div className="font-medium text-fg">{t('scenarios.provenance')}</div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {item.provenance.map((source) => <li key={`${source.source_id}-${source.version ?? ''}`}>{source.source_id}{source.version ? ` · ${source.version}` : ''}</li>)}
              </ul>
            </div>
            {item.limitations.length > 0 && (
              <div>
                <div className="font-medium text-fg">{t('scenarios.limitations')}</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">{item.limitations.map((text) => <li key={text}>{text}</li>)}</ul>
              </div>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  )
}

function ScenarioResults({ result }: { result: ScenarioComparisonResult }) {
  const { t } = useTranslation()
  const recommended = result.scenarios.find((item) => item.scenario_id === result.recommended_scenario_id)
  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('scenarios.eyebrow')}
        title={result.name}
        description={t('scenarios.resultsDescription')}
        actions={<Button asChild variant="secondary"><Link to="/scenarios"><ArrowLeft />{t('scenarios.newComparison')}</Link></Button>}
      />
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-5">
            <div>
              <div className="text-[11px] text-fg-3">{t('scenarios.selectedSite')}</div>
              <div className="mt-1 font-medium text-fg">{result.site.label}</div>
              <div className="font-mono text-[11px] text-fg-3">{formatCoord(result.site.latitude_deg, result.site.longitude_deg, 4)}</div>
            </div>
            <Badge tone="neutral">{result.horizon_model}</Badge>
            <Badge tone="neutral">{t('scenarios.stepMinutes', { n: result.time_step_minutes })}</Badge>
            <Badge tone={result.cache_status === 'HIT' ? 'success' : 'neutral'}>{t(`scenarios.cache.${result.cache_status}`)}</Badge>
          </CardContent>
        </Card>
        <Button asChild variant="outline">
          <Link to={`/explorer?site=${encodeURIComponent(result.site.site_id)}`}>
            <MapPin /> {t('scenarios.returnToSite')} <ExternalLink />
          </Link>
        </Button>
      </div>

      <Card className="mb-5 border-gold/30 bg-gold/[0.04]">
        <CardContent className="flex items-start gap-3 pt-5">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
          <div>
            <h2 className="font-display text-base font-semibold text-fg">
              {recommended ? t('scenarios.recommendationTitle', { label: recommended.label }) : t('scenarios.noRecommendation')}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-fg-2">
              {recommended ? t('scenarios.recommendationBody') : t('scenarios.noRecommendationBody')}
            </p>
            <p className="mt-2 text-xs text-fg-3">{t('scenarios.evidenceRecommendationSplit')}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        {result.scenarios.map((item) => (
          <EvidenceCard key={item.scenario_id} item={item} recommended={item.scenario_id === result.recommended_scenario_id} />
        ))}
      </div>
    </PageTransition>
  )
}

function StoredScenarioResults({ id }: { id: string }) {
  const { t } = useTranslation()
  const query = useScenarioComparison(id)
  if (query.isPending) {
    return <div role="status" className="flex items-center gap-2 text-sm text-fg-2"><Loader2 className="animate-spin" />{t('scenarios.loading')}</div>
  }
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  return <ScenarioResults result={query.data} />
}

function ScenarioPlanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: referenceSites } = useSites()
  const customSites = useMissionStore((state) => state.customSites)
  const missionDraft = useMissionStore((state) => state.draft)
  const [name, setName] = useState('South-pole seasonal comparison')
  const [siteRef, setSiteRef] = useState<SiteRef | null>(missionDraft.siteA)
  const [scenarios, setScenarios] = useState<ScenarioWindowDraft[]>(DEFAULT_SCENARIOS)
  const [timeStepMinutes, setTimeStepMinutes] = useState(60)
  const [horizonModel, setHorizonModel] = useState<'GEOMETRIC' | 'TERRAIN'>('GEOMETRIC')
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [touched, setTouched] = useState(false)
  const site = resolveSite(siteRef, referenceSites?.items, customSites)
  const input: ScenarioPlannerInput = { name, site, scenarios, timeStepMinutes, horizonModel, weights }
  const validation = touched ? validateScenarioPlanner(input) : { rows: {} }
  const mutation = useMutation({
    mutationFn: selenoraApi.createScenarioComparison,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.scenarioComparison(result.id), result)
      void queryClient.invalidateQueries({ queryKey: queryKeys.scenarioComparisons })
      void navigate(`/scenarios/${result.id}`)
    },
  })

  const updateScenario = (id: string, patch: Partial<ScenarioWindowDraft>) =>
    setScenarios((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))

  const addScenario = () => {
    if (scenarios.length >= MAX_SCENARIOS) return
    const last = scenarios.at(-1) ?? DEFAULT_SCENARIOS[0]!
    const sequence = scenarios.length + 1
    setScenarios((items) => [...items, {
      id: `scenario-${Date.now().toString(36)}`,
      label: t('scenarios.scenarioLabel', { n: sequence }),
      start: shiftUtcInput(last.start, 29.53),
      end: shiftUtcInput(last.end, 29.53),
    }])
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    const checked = validateScenarioPlanner(input)
    if (hasScenarioErrors(checked)) return
    mutation.mutate(toScenarioRequest(input))
  }

  const reset = () => {
    setName('South-pole seasonal comparison')
    setSiteRef(missionDraft.siteA)
    setScenarios(DEFAULT_SCENARIOS)
    setTimeStepMinutes(60)
    setHorizonModel('GEOMETRIC')
    setWeights(DEFAULT_WEIGHTS)
    setTouched(false)
    mutation.reset()
  }

  const errorText = (key?: ScenarioErrorKey) => key ? t(`scenarios.errors.${key}`, {
    min: 2, max: MAX_SCENARIOS, days: MAX_SCENARIO_DAYS, samples: MAX_TOTAL_SCENARIO_SAMPLES,
  }) : undefined
  const totalSamples = useMemo(
    () => scenarios.reduce((sum, item) => sum + (scenarioSampleCount(item, timeStepMinutes) ?? 0), 0),
    [scenarios, timeStepMinutes],
  )

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('scenarios.eyebrow')}
        title={t('scenarios.title')}
        description={t('scenarios.description')}
        actions={<Button type="button" variant="ghost" size="sm" onClick={reset}><RotateCcw />{t('common.reset')}</Button>}
      />
      <form onSubmit={submit} noValidate className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="size-4 text-cyan" />{t('scenarios.siteTitle')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="scenario-name">{t('scenarios.name')}</Label>
                <Input id="scenario-name" value={name} maxLength={160} aria-invalid={Boolean(validation.name)} onChange={(event) => setName(event.target.value)} />
                <FieldError>{errorText(validation.name)}</FieldError>
              </div>
              <div>
                <Label htmlFor="scenario-site">{t('scenarios.selectedSite')}</Label>
                <Select value={encodeRef(siteRef) || undefined} onValueChange={(value) => setSiteRef(decodeRef(value))}>
                  <SelectTrigger id="scenario-site" data-testid="scenario-site-trigger" aria-invalid={Boolean(validation.site)}><SelectValue placeholder={t('scenarios.selectSite')} /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{t('explorer.reference')}</SelectLabel>
                      {referenceSites?.items.map((item) => <SelectItem key={item.id} value={`reference:${item.id}`}>{item.name}</SelectItem>)}
                    </SelectGroup>
                    {customSites.length > 0 && <SelectGroup><SelectLabel>{t('explorer.custom')}</SelectLabel>{customSites.map((item) => <SelectItem key={item.id} value={`custom:${item.id}`}>{item.name}</SelectItem>)}</SelectGroup>}
                  </SelectContent>
                </Select>
                <p className="mt-1 font-mono text-[11px] text-fg-3">{site ? formatCoord(site.latitude_deg, site.longitude_deg, 4) : ''}</p>
                <FieldError>{errorText(validation.site)}</FieldError>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><CardTitle className="flex items-center gap-2"><CalendarClock className="size-4 text-cyan" />{t('scenarios.windowsTitle')}</CardTitle><CardDescription>{t('scenarios.windowsHint')}</CardDescription></div>
                <Button type="button" size="sm" variant="outline" onClick={addScenario} disabled={scenarios.length >= MAX_SCENARIOS}><Plus />{t('scenarios.addScenario')}</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {scenarios.map((scenario, index) => {
                const row = validation.rows[scenario.id] ?? {}
                return (
                  <fieldset key={scenario.id} className="rounded-xl border border-line bg-bg/25 p-4">
                    <legend className="px-1 text-xs font-semibold text-fg-2">{t('scenarios.scenarioLabel', { n: index + 1 })}</legend>
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <div><Label htmlFor={`scenario-label-${scenario.id}`}>{t('scenarios.label')}</Label><Input id={`scenario-label-${scenario.id}`} value={scenario.label} aria-invalid={Boolean(row.label)} onChange={(event) => updateScenario(scenario.id, { label: event.target.value })} /><FieldError>{errorText(row.label)}</FieldError></div>
                      <div><Label htmlFor={`scenario-start-${scenario.id}`}>{t('scenarios.startUtc')}</Label><Input id={`scenario-start-${scenario.id}`} type="datetime-local" value={scenario.start} aria-invalid={Boolean(row.start)} onChange={(event) => updateScenario(scenario.id, { start: event.target.value })} /><FieldError>{errorText(row.start)}</FieldError></div>
                      <div><Label htmlFor={`scenario-end-${scenario.id}`}>{t('scenarios.endUtc')}</Label><Input id={`scenario-end-${scenario.id}`} type="datetime-local" value={scenario.end} aria-invalid={Boolean(row.end)} onChange={(event) => updateScenario(scenario.id, { end: event.target.value })} /><FieldError>{errorText(row.end)}</FieldError></div>
                      <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={t('scenarios.removeScenario', { n: index + 1 })} disabled={scenarios.length <= 2} onClick={() => setScenarios((items) => items.filter((item) => item.id !== scenario.id))}><Trash2 /></Button>
                    </div>
                  </fieldset>
                )
              })}
              <p className="text-xs text-fg-3">{t('scenarios.presetDisclaimer')}</p>
              {validation.form && <FieldError>{errorText(validation.form)}</FieldError>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>{t('scenarios.scienceSettings')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label htmlFor="scenario-step">{t('planner.resolution')}</Label><Select value={String(timeStepMinutes)} onValueChange={(value) => setTimeStepMinutes(Number(value))}><SelectTrigger id="scenario-step"><SelectValue /></SelectTrigger><SelectContent>{SCENARIO_TIME_STEPS.map((step) => <SelectItem key={step} value={String(step)}>{t('planner.minutes', { n: step })}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="scenario-horizon">{t('planner.horizonModel')}</Label><Select value={horizonModel} onValueChange={(value) => setHorizonModel(value === 'TERRAIN' ? 'TERRAIN' : 'GEOMETRIC')}><SelectTrigger id="scenario-horizon"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="GEOMETRIC">{t('planner.horizonGeometric')}</SelectItem><SelectItem value="TERRAIN">{t('planner.horizonTerrain')}</SelectItem></SelectContent></Select></div>
              <div className="rounded-xl border border-line bg-bg/35 p-3 text-xs text-fg-2">{t('scenarios.requestSummary', { scenarios: scenarios.length, samples: totalSamples })}</div>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-5"><WeightsEditor value={weights} onChange={setWeights} error={validation.form === 'weights' ? errorText('weights') : undefined} /></CardContent></Card>
          <Card className="xl:sticky xl:top-24">
            <CardContent className="space-y-3 pt-5">
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="animate-spin" /> : <CalendarClock />}{mutation.isPending ? t('scenarios.running') : t('scenarios.run')}</Button>
              <p className="text-xs leading-relaxed text-fg-3">{t('scenarios.realDataNotice')}</p>
              {mutation.error && <ErrorState error={mutation.error} />}
            </CardContent>
          </Card>
        </div>
      </form>
    </PageTransition>
  )
}

export default function DateScenariosPage() {
  const { comparisonId } = useParams<{ comparisonId?: string }>()
  return comparisonId ? <StoredScenarioResults id={comparisonId} /> : <ScenarioPlanner />
}
