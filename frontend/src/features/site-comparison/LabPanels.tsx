import { AlertTriangle, Gauge, Scale, ShieldAlert, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { siteColor } from '@/components/shared/siteColors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WeightsEditor } from '@/features/mission-planner/WeightsEditor'
import { formatHours, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AnalysisResult, WeightKey } from '@/types/api'

import { canRescore, recommendationStatus } from '../analysis-data/adapter'
import type { SiteEpochs } from '../analysis-data/useWorkspaceAnalysis'
import { explainChange, rescore, weightsValid } from './rescore'

export function RecommendationBanner({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation()
  const st = recommendationStatus(result)
  if (st.kind === 'recommended')
    return (
      <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm" role="status">
        <Trophy className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
        <p className="text-fg-2">
          <span className="font-medium text-fg">{t('lab.recommended', { site: st.label })}</span> {t('lab.recommendedNote')}
        </p>
      </div>
    )
  const msg = st.kind === 'tie' ? t('lab.tie') : t(`lab.refused.${st.reason}`)
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.06] px-4 py-3 text-sm" role="status">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p className="text-fg-2">
        <span className="font-medium text-fg">{t('lab.noRecommendation')}</span> {msg}
      </p>
    </div>
  )
}

/** Confidence: unknown time, terrain coverage, geometric sample completeness. */
export function ConfidencePanel({ result, sites }: { result: AnalysisResult; sites: SiteEpochs[] }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="size-4 text-cyan" aria-hidden /> {t('lab.confidence')}
        </CardTitle>
        <CardDescription>{t('lab.confidenceHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {result.sites.map((s, i) => {
            const ep = sites[i]?.epochs ?? []
            const missing = ep.filter((e) => e.sunGeometric === 'UNKNOWN' || e.earthGeometric === 'UNKNOWN').length
            const tr = s.terrain
            const unresolved = ep.filter((e) => e.sun === 'UNRESOLVED' || e.earth === 'UNRESOLVED').length
            const rows: [string, string, boolean][] = [
              [t('lab.ephemerisSamples'), `${ep.length - missing} / ${ep.length}`, missing > 0],
            ]
            if (tr) {
              rows.push(
                [t('lab.knownFraction'), tr.known_sample_fraction != null ? formatPct(tr.known_sample_fraction * 100) : '—', (tr.known_sample_fraction ?? 1) < 1],
                [t('lab.unknownTime'), tr.unknown_hours != null ? formatHours(tr.unknown_hours) : '—', (tr.unknown_hours ?? 0) > 0],
                [t('lab.terrainCoverage'), tr.horizon_coverage_fraction != null ? formatPct(tr.horizon_coverage_fraction * 100) : '—', (tr.horizon_coverage_fraction ?? 1) < 1],
                [t('lab.validRange'), tr.median_valid_range_m != null ? `${(tr.median_valid_range_m / 1000).toFixed(1)} / ${((tr.max_range_m ?? 0) / 1000).toFixed(0)} km` : '—', false],
                [t('lab.dem'), `${tr.dem_site_id ?? '—'} · ${tr.resolution_m ?? '—'} m/px`, false],
              )
              if (unresolved > 0) rows.push([t('lab.unresolvedSamples'), `${unresolved}`, true])
            }
            return (
              <div key={s.label} className="rounded-xl border border-line bg-bg-2/50 p-3">
                <div className="mb-2 flex items-center gap-2 text-[13px] font-medium">
                  <span className="size-2 rounded-full" style={{ background: siteColor(i) }} aria-hidden />
                  <span className="truncate">{s.label}</span>
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 font-mono text-[11px]">
                  {rows.map(([k, v, warn]) => (
                    <div key={k} className="contents">
                      <dt className="text-fg-3">{k}</dt>
                      <dd className={cn('text-right', warn ? 'text-warning' : 'text-fg')}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          })}
        </div>
        {result.horizon_model !== 'TERRAIN' && <p className="mt-3 text-[11.5px] text-fg-3">{t('lab.geometricOnly')}</p>}
      </CardContent>
    </Card>
  )
}

export function WeightLab({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation()
  const [weights, setWeights] = useState(result.weights)
  const allowed = canRescore(result)
  const valid = weightsValid(weights)
  const rows = useMemo(() => (valid ? rescore(result.sites, weights) : []), [result.sites, weights, valid])
  const change = useMemo(() => (allowed && valid ? explainChange(result.sites, result.weights, weights) : null), [allowed, valid, result, weights])
  const metricName: Record<WeightKey, string> = {
    sun_visibility: t('comparison.sunVisibility'),
    earth_visibility: t('comparison.earthVisibility'),
    joint_visibility: t('comparison.jointVisibility'),
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Scale className="size-4 text-cyan" aria-hidden /> {t('lab.weightLab')}
          </CardTitle>
          <CardDescription>{t('lab.weightLabHint')}</CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setWeights(result.weights)} disabled={JSON.stringify(weights) === JSON.stringify(result.weights)}>
          {t('lab.resetWeights')}
        </Button>
      </CardHeader>
      <CardContent>
        {!allowed ? (
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.05] p-3 text-[12.5px] text-fg-2" role="note">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {t('lab.rescoreDisabled')}
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <WeightsEditor value={weights} onChange={setWeights} compact />
            <div className="space-y-3">
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[420px] text-left text-[12.5px]">
                  <thead className="text-[11px] text-fg-3">
                    <tr className="border-b border-line">
                      <th className="py-1.5 pr-2 font-medium">{t('lab.site')}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">{t('lab.storedScore')}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">{t('lab.newScore')}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Δ</th>
                      <th className="py-1.5 text-right font-medium">{t('lab.rank')}</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {rows.map((r) => {
                      const delta = r.storedScore === null ? null : r.score - r.storedScore
                      return (
                        <tr key={r.label} className="border-b border-line/60">
                          <td className="py-1.5 pr-2 font-sans">
                            <span className="flex items-center gap-1.5">
                              <span className="size-2 rounded-full" style={{ background: siteColor(r.index) }} aria-hidden />
                              <span className="truncate">{r.label}</span>
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 text-right text-fg-2">{r.storedScore?.toFixed(2) ?? '—'}</td>
                          <td className="py-1.5 pr-2 text-right text-fg">{r.score.toFixed(2)}</td>
                          <td className={cn('py-1.5 pr-2 text-right', delta && delta > 0 ? 'text-success' : delta && delta < 0 ? 'text-danger' : 'text-fg-3')}>
                            {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`}
                          </td>
                          <td className="py-1.5 text-right">
                            <Badge tone={r.rank === 1 ? 'gold' : 'neutral'}>#{r.rank}</Badge>
                            {r.storedRank !== null && r.storedRank !== r.rank && <span className="ml-1 text-[10px] text-fg-3">(#{r.storedRank})</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl border border-line bg-bg-2/60 p-3 text-[12.5px] leading-relaxed text-fg-2" aria-live="polite">
                {!valid
                  ? t('planner.prioritiesHint')
                  : change?.kind === 'tie'
                    ? t('lab.changeTie', { sites: change.labels.join(', ') })
                    : change?.kind === 'leader'
                      ? (
                          <>
                            {change.previous && change.previous !== change.leader
                              ? t('lab.changeFlip', { leader: change.leader, previous: change.previous })
                              : t('lab.changeSame', { leader: change.leader })}{' '}
                            {t('lab.changeDriver', { margin: change.margin.toFixed(2), metric: metricName[change.driver], delta: change.driverDelta.toFixed(2) })}
                          </>
                        )
                      : t('lab.changeNone')}
              </div>
              <p className="text-[11px] text-fg-3">{t('lab.rescoreNote')}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
