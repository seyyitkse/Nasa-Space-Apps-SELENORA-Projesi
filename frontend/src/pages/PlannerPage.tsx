import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarRange, CheckCircle2, Clock4, FlaskConical, Loader2, MapPin, Play, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError, Input, Label, NativeSelect } from '@/components/ui/input'
import { useSites } from '@/hooks/useApi'
import { formatCoord } from '@/lib/format'
import { usePlannerInput } from '@/features/mission-planner/usePlannerInput'
import { useSyntheticDemo } from '@/features/mission-planner/useSyntheticDemo'
import {
  MAX_ANALYSIS_DAYS,
  type PlannerErrors,
  sampleCount,
  TIME_STEPS,
  toAnalysisRequest,
  validatePlanner,
} from '@/features/mission-planner/validation'
import { WeightsEditor } from '@/features/mission-planner/WeightsEditor'
import { ApiError } from '@/services/apiClient'
import { selenoraApi } from '@/services/selenoraApi'
import { type SiteRef, useMissionStore } from '@/stores/missionStore'

function encodeRef(ref: SiteRef | null) {
  return ref ? `${ref.kind}:${ref.id}` : ''
}
function decodeRef(v: string): SiteRef | null {
  const [kind, ...rest] = v.split(':')
  if ((kind !== 'reference' && kind !== 'custom') || rest.length === 0) return null
  return { kind, id: rest.join(':') }
}

export default function PlannerPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const draft = useMissionStore((s) => s.draft)
  const update = useMissionStore((s) => s.updateDraft)
  const reset = useMissionStore((s) => s.resetDraft)
  const custom = useMissionStore((s) => s.customSites)
  const { data: sites } = useSites()
  const input = usePlannerInput()
  const [touched, setTouched] = useState(false)
  const errors: PlannerErrors = touched ? validatePlanner(input) : {}

  const analysis = useMutation({
    mutationFn: selenoraApi.createAnalysis,
    onSuccess: (status) => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] })
      if (status.status === 'COMPLETED' || status.status === 'PENDING' || status.status === 'RUNNING') {
        void navigate(`/comparison/${status.id}`)
      }
    },
  })
  const demo = useSyntheticDemo()

  const errText = (key?: string) =>
    key ? t(`planner.errors.${key as 'missionName'}`, { n: MAX_ANALYSIS_DAYS, total: input.weights.sun_visibility + input.weights.earth_visibility + input.weights.joint_visibility }) : undefined

  const runIfValid = (fn: () => void) => {
    setTouched(true)
    if (Object.keys(validatePlanner(input)).length > 0) return
    fn()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    runIfValid(() => {
      demo.reset()
      analysis.mutate(toAnalysisRequest(input))
    })
  }
  const onDemo = () =>
    runIfValid(() => {
      analysis.reset()
      demo.mutate(toAnalysisRequest(input))
    })

  const samples = sampleCount(input)
  const apiErr = analysis.error instanceof ApiError ? analysis.error : null

  const siteOptions = (
    <>
      <option value="">{t('planner.selectSite')}</option>
      <optgroup label={t('explorer.reference')}>
        {sites?.items.map((s) => (
          <option key={s.id} value={`reference:${s.id}`}>
            {s.name}
          </option>
        ))}
      </optgroup>
      {custom.length > 0 && (
        <optgroup label={t('explorer.custom')}>
          {custom.map((s) => (
            <option key={s.id} value={`custom:${s.id}`}>
              {s.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('common.phase', { n: 2 })}
        title={t('planner.title')}
        description={t('planner.description')}
        actions={
          <Button variant="ghost" size="sm" onClick={() => { reset(); setTouched(false); analysis.reset(); demo.reset() }}>
            <RotateCcw /> {t('common.reset')}
          </Button>
        }
      />
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4 text-cyan" aria-hidden /> {t('nav.mission')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="mission-name">{t('planner.missionName')}</Label>
                <Input
                  id="mission-name"
                  value={draft.missionName}
                  maxLength={160}
                  aria-invalid={!!errors.missionName}
                  aria-describedby={errors.missionName ? 'mission-name-err' : undefined}
                  onChange={(e) => update({ missionName: e.target.value })}
                />
                <FieldError id="mission-name-err">{errText(errors.missionName)}</FieldError>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(['siteA', 'siteB'] as const).map((slot) => {
                  const resolved = slot === 'siteA' ? input.siteA : input.siteB
                  return (
                    <div key={slot}>
                      <Label htmlFor={`site-${slot}`} className="flex items-center gap-2">
                        <span className={slot === 'siteA' ? 'size-2 rounded-full bg-cyan' : 'size-2 rounded-full bg-violet'} aria-hidden />
                        {t(`planner.${slot}`)}
                      </Label>
                      <NativeSelect
                        id={`site-${slot}`}
                        value={encodeRef(draft[slot])}
                        aria-invalid={!!errors[slot]}
                        aria-describedby={errors[slot] ? `site-${slot}-err` : undefined}
                        onChange={(e) => update({ [slot]: decodeRef(e.target.value) })}
                      >
                        {siteOptions}
                      </NativeSelect>
                      <p className="mt-1 h-4 font-mono text-[11px] text-fg-3">
                        {resolved ? formatCoord(resolved.latitude_deg, resolved.longitude_deg, 3) : ''}
                      </p>
                      <FieldError id={`site-${slot}-err`}>{errText(errors[slot])}</FieldError>
                    </div>
                  )
                })}
              </div>
              <Link to="/explorer" className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">
                {t('overview.ctaExplore')} <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="size-4 text-cyan" aria-hidden /> {t('overview.window')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="start-date">{t('planner.startDate')}</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={draft.startDate}
                  aria-invalid={!!errors.startDate}
                  onChange={(e) => update({ startDate: e.target.value })}
                />
                <FieldError>{errText(errors.startDate)}</FieldError>
              </div>
              <div>
                <Label htmlFor="end-date">{t('planner.endDate')}</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={draft.endDate}
                  aria-invalid={!!errors.endDate}
                  onChange={(e) => update({ endDate: e.target.value })}
                />
                <FieldError>{errText(errors.endDate)}</FieldError>
              </div>
              <div>
                <Label htmlFor="time-step" className="flex items-center gap-1.5">
                  <Clock4 className="size-3.5" aria-hidden /> {t('planner.resolution')}
                </Label>
                <NativeSelect
                  id="time-step"
                  value={draft.timeStepMinutes}
                  onChange={(e) => update({ timeStepMinutes: Number(e.target.value) })}
                >
                  {TIME_STEPS.map((m) => (
                    <option key={m} value={m}>
                      {t('planner.minutes', { n: m })}
                    </option>
                  ))}
                </NativeSelect>
                {samples !== null && (
                  <p className="mt-1.5 font-mono text-[11px] text-fg-3">{t('planner.samples', { n: samples })}</p>
                )}
              </div>
              <div>
                <Label htmlFor="horizon">{t('planner.horizonModel')}</Label>
                <NativeSelect
                  id="horizon"
                  value={draft.horizonModel}
                  onChange={(e) => update({ horizonModel: e.target.value === 'TERRAIN' ? 'TERRAIN' : 'GEOMETRIC' })}
                >
                  <option value="GEOMETRIC">{t('planner.horizonGeometric')}</option>
                  <option value="TERRAIN" disabled>
                    {t('planner.horizonTerrain')}
                  </option>
                </NativeSelect>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardContent className="pt-5">
              <WeightsEditor
                value={draft.weights}
                onChange={(weights) => update({ weights })}
                error={errText(errors.weights)}
              />
            </CardContent>
          </Card>

          <Card className="lg:sticky lg:top-24">
            <CardContent className="space-y-3 pt-5">
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={analysis.isPending}>
                {analysis.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                {analysis.isPending ? t('planner.running') : t('planner.runAnalysis')}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={onDemo} disabled={demo.isPending}>
                {demo.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                {t('planner.runDemo')}
              </Button>

              <AnimatePresence mode="wait">
                {analysis.isPending && (
                  <motion.div
                    key="running"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    role="status"
                    className="rounded-xl border border-cyan/30 bg-cyan/[0.07] p-4 text-sm"
                  >
                    <div className="flex items-center gap-2 font-medium text-fg">
                      <Loader2 className="size-4 animate-spin text-cyan" aria-hidden />
                      {t('planner.fetchingHorizons')}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{t('planner.fetchingHorizonsBody')}</p>
                    {samples !== null && (
                      <div className="mt-2">
                        <Badge tone="neutral">{t('planner.samples', { n: samples })}</Badge>
                      </div>
                    )}
                  </motion.div>
                )}
                {analysis.error && (
                  <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ErrorState error={apiErr ?? analysis.error} />
                  </motion.div>
                )}
                {demo.isSuccess && (
                  <motion.div
                    key="demo"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    role="status"
                    className="rounded-xl border border-gold/30 bg-gold/[0.07] p-4 text-sm"
                  >
                    <div className="flex items-center gap-2 font-medium text-fg">
                      <CheckCircle2 className="size-4 text-gold" aria-hidden />
                      {t('planner.demoReady')}
                    </div>
                    <p className="mt-1 text-xs text-fg-2">{t('quality.syntheticWarning')}</p>
                    <Button asChild size="sm" variant="secondary" className="mt-3">
                      <Link to="/comparison">
                        {t('planner.openComparison')} <ArrowRight />
                      </Link>
                    </Button>
                  </motion.div>
                )}
                {demo.error && (
                  <motion.div key="demo-err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ErrorState error={demo.error} />
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </form>
    </PageTransition>
  )
}
