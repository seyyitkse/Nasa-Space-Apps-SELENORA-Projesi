import { Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BODY_COLORS, siteColor } from '@/components/shared/siteColors'
import { Badge } from '@/components/ui/badge'
import type { SiteResult, WeightKey } from '@/types/api'

import { explainRanking } from './derive'

const METRIC_COLOR: Record<WeightKey, string> = {
  sun_visibility: BODY_COLORS.sun,
  earth_visibility: BODY_COLORS.earth,
  joint_visibility: BODY_COLORS.joint,
}

export function ScoreBreakdown({ sites }: { sites: SiteResult[] }) {
  const { t } = useTranslation()
  const metricLabel: Record<WeightKey, string> = {
    sun_visibility: t('comparison.sunVisibility'),
    earth_visibility: t('comparison.earthVisibility'),
    joint_visibility: t('comparison.jointVisibility'),
  }
  const exp = explainRanking(sites)
  const ordered = [...sites].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))

  return (
    <div className="space-y-5">
      <ul className="space-y-4">
        {ordered.map((s) => {
          const idx = sites.indexOf(s)
          return (
            <li key={s.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: siteColor(idx) }} aria-hidden />
                  <span className="truncate">{s.label}</span>
                  {s.rank === 1 && <Trophy className="size-3.5 shrink-0 text-gold" aria-hidden />}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={s.rank === 1 ? 'gold' : 'neutral'}>
                    {s.rank ? t('comparison.rank', { n: s.rank }) : t('comparison.unranked')}
                  </Badge>
                  <span className="font-mono text-sm font-semibold text-fg">{s.score?.toFixed(2) ?? '—'}</span>
                </span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-white/5" role="img" aria-label={`${s.label} score ${s.score ?? 'n/a'} of 100`}>
                {s.contributions.map((c) => (
                  <div
                    key={c.metric}
                    style={{ width: `${c.contribution}%`, background: METRIC_COLOR[c.metric] }}
                    title={`${metricLabel[c.metric]}: ${c.weight_pct}% × ${c.value_pct.toFixed(1)}% = ${c.contribution.toFixed(2)}`}
                  />
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono text-[10.5px] text-fg-3">
                {s.contributions.map((c) => (
                  <span key={c.metric} className="truncate">
                    {c.weight_pct}%×{c.value_pct.toFixed(1)}% = <span className="text-fg-2">{c.contribution.toFixed(1)}</span>
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      {exp && exp.runnerUp && (
        <div className="rounded-xl border border-line bg-bg-2/60 p-3.5 text-[13px] leading-relaxed text-fg-2">
          {exp.tie ? (
            t('comparison.rankingTie')
          ) : (
            <>
              <p>
                {t('comparison.rankingLead', { leader: exp.leader.label, delta: exp.delta.toFixed(2) })}
              </p>
              {exp.driver && (
                <p className="mt-1">
                  {t('comparison.rankingDriver', {
                    metric: metricLabel[exp.driver.metric],
                    sign: exp.driver.diff >= 0 ? '+' : '−',
                    value: Math.abs(exp.driver.diff).toFixed(2),
                  })}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-3">
        {(Object.keys(METRIC_COLOR) as WeightKey[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: METRIC_COLOR[k] }} aria-hidden /> {metricLabel[k]}
          </span>
        ))}
      </div>
    </div>
  )
}
