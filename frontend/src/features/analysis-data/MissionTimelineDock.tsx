import { ArrowRight, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { DataQualityBadge } from '@/components/shared/badges'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { formatUtc } from '@/lib/format'
import { useWorkspaceStore } from '@/stores/workspaceStore'

import { nearestSampleIndex } from './adapter'
import { AnalysisPicker } from './AnalysisPicker'
import { StateLanes, StateLegend } from './StateLanes'
import { STATE_TONE } from './stateStyle'
import { useWorkspaceAnalysis } from './useWorkspaceAnalysis'

/** Bottom dock: the shared analysis timeline, synchronised with the Simulator cursor. */
export function MissionTimelineDock() {
  const { t } = useTranslation()
  const ws = useWorkspaceAnalysis()
  const cursorT = useWorkspaceStore((s) => s.cursorT)
  const setCursor = useWorkspaceStore((s) => s.setCursor)
  const siteIndex = useWorkspaceStore((s) => s.siteIndex)

  const first = ws.sites[0]?.epochs ?? []
  const effectiveCursor = cursorT ?? first[0]?.t ?? null

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-4 text-cyan" aria-hidden /> {t('explorer2.timeline')}
        </CardTitle>
        <div className="flex items-center gap-2">
          {ws.result && <DataQualityBadge quality={ws.result.data_quality} />}
          <Button asChild size="sm" variant="ghost">
            <Link to="/simulator">
              {t('nav.simulator')} <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ws.noAnalyses ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-fg-2">{t('lab.noAnalysesBody')}</p>
            <Button asChild size="sm" variant="primary">
              <Link to="/planner">{t('overview.openPlanner')}</Link>
            </Button>
          </div>
        ) : (
          <>
            <AnalysisPicker current={ws.result} />
            {ws.error ? (
              <ErrorState error={ws.error} onRetry={ws.refetch} compact />
            ) : ws.isPending || !ws.result ? (
              <Skeleton className="h-24" />
            ) : (
              <>
                <StateLanes
                  sites={ws.sites}
                  stepMinutes={ws.timeline?.step_minutes ?? ws.result.time_step_minutes}
                  endUtc={ws.result.end_utc}
                  cursorT={effectiveCursor}
                  onCursor={setCursor}
                  focusIndex={siteIndex}
                />
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <StateLegend terrain={ws.result.horizon_model === 'TERRAIN'} />
                  {effectiveCursor !== null && (
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-2" aria-live="polite">
                      <span className="text-fg">{formatUtc(effectiveCursor)}</span>
                      {ws.sites.map((s) => {
                        const e = s.epochs[nearestSampleIndex(s.epochs, effectiveCursor)]
                        if (!e) return null
                        return (
                          <span key={s.label} className="flex items-center gap-1">
                            {String.fromCharCode(65 + s.index)}:
                            <Badge tone={STATE_TONE[e.sun]}>☉ {t(`lab.state.${e.sun}`)}</Badge>
                            <Badge tone={STATE_TONE[e.earth]}>⊕ {t(`lab.state.${e.earth}`)}</Badge>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
                {ws.timeline?.downsampled && (
                  <p className="text-[11px] text-fg-3">{t('comparison.downsampled', { n: ws.timeline.step_minutes })}</p>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
