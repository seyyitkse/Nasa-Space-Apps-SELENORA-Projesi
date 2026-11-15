import { CheckCircle2, CircleHelp, ShieldAlert, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Term } from '@/components/shared/Explain'
import { siteColor } from '@/components/shared/siteColors'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalysisResult, DecisionWeights } from '@/types/api'

import { explainResult, type Statement } from './explain'

function Line({ s, ns }: { s: Statement; ns: 'established' | 'uncertain' | 'general' }) {
  const { t } = useTranslation()
  // Keys come from explain.ts and are covered by the EN/TR dictionaries (see explain.test + i18n test).
  const tx = t as unknown as (key: string, params?: Record<string, string | number>) => string
  return <>{tx(`guided.${ns}.${s.key}`, s.params)}</>
}

/**
 * Plain-language result card. Reads only stored backend numbers (see explain.ts)
 * and always separates what is established from what remains uncertain.
 */
export function PlainSummary({ result, objective }: { result: AnalysisResult; objective?: DecisionWeights }) {
  const { t } = useTranslation()
  const e = explainResult(result, objective)
  const v = e.verdict

  return (
    <div className="space-y-4">
      <div
        role="status"
        className={
          v.kind === 'recommended'
            ? 'flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/[0.07] p-4'
            : 'flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] p-4'
        }
      >
        {v.kind === 'recommended' ? (
          <Trophy className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
        ) : (
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        )}
        <div className="space-y-1 text-[13.5px] leading-relaxed">
          <p className="font-display text-base font-semibold text-fg">
            {v.kind === 'recommended'
              ? t('guided.verdict.recommended', { site: v.site })
              : v.kind === 'tie'
                ? t('guided.verdict.tie')
                : t('guided.verdict.refused')}
          </p>
          <p className="text-fg-2">
            {v.kind === 'recommended'
              ? t(v.source === 'stored' ? 'guided.verdict.storedWhy' : 'guided.verdict.reweightedWhy', { margin: v.margin })
              : v.kind === 'tie'
                ? t('guided.verdict.tieWhy')
                : t(`guided.verdict.refusedWhy.${v.reason}`)}
          </p>
          {v.kind === 'refused' && v.reason === 'partial_terrain' && (
            <p className="text-[12px] text-fg-3">
              <Term k="partialTerrain" /> · <Term k="unknown" />
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {e.sites.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-[14px]">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: siteColor(s.index) }} aria-hidden />
                <span className="min-w-0 truncate">{s.label}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="sel-eyebrow mb-1.5 flex items-center gap-1.5 text-[10px] text-success">
                  <CheckCircle2 className="size-3" aria-hidden /> {t('guided.whatWeKnow')}
                </div>
                <ul className="space-y-1.5 text-[13px] leading-relaxed text-fg-2">
                  {s.established.map((st) => (
                    <li key={st.key}>
                      <Line s={st} ns="established" />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="sel-eyebrow mb-1.5 flex items-center gap-1.5 text-[10px] text-warning">
                  <CircleHelp className="size-3" aria-hidden /> {t('guided.whatIsUncertain')}
                </div>
                <ul className="space-y-1.5 text-[13px] leading-relaxed text-fg-2">
                  {s.uncertain.map((st) => (
                    <li key={st.key}>
                      <Line s={st} ns="uncertain" />
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ul className="space-y-1.5 rounded-xl border border-line bg-bg-2/50 p-3.5 text-[12.5px] leading-relaxed text-fg-3">
        {e.general.map((g) => (
          <li key={g.key}>
            • <Line s={g} ns="general" />
          </li>
        ))}
      </ul>
    </div>
  )
}
