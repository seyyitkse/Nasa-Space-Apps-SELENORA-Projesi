import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { siteColor } from '@/components/shared/siteColors'
import { formatHours, formatPct } from '@/lib/format'
import type { AnalysisResult } from '@/types/api'

const NUMBER = /-?\d+(?:[.,]\d+)?/g

/** All numeric values in the deterministic result that an AI sentence may legitimately cite. */
export function evidenceValues(result: AnalysisResult): number[] {
  const out: number[] = []
  for (const s of result.sites) {
    out.push(...Object.values(s.metrics))
    if (s.score !== null) out.push(s.score)
    for (const c of s.contributions) out.push(c.contribution, c.weight_pct, c.value_pct)
    if (s.terrain?.unknown_hours != null) out.push(s.terrain.unknown_hours)
    if (s.terrain?.horizon_coverage_fraction != null) out.push(s.terrain.horizon_coverage_fraction * 100)
    if (s.terrain?.resolution_m != null) out.push(s.terrain.resolution_m)
  }
  out.push(result.weights.sun_visibility, result.weights.earth_visibility, result.weights.joint_visibility)
  return out
}

export type NumberMark = 'evidence' | 'unsupported' | 'plain'

/** Classify a number token: matches evidence (at its own precision), flagged by the backend guard, or neither. */
export function classifyNumber(token: string, evidence: number[], unsupported: string[]): NumberMark {
  if (unsupported.includes(token)) return 'unsupported'
  const norm = token.replace(',', '.')
  const value = Number(norm)
  if (!Number.isFinite(value)) return 'plain'
  const decimals = norm.includes('.') ? norm.split('.')[1]!.length : 0
  if (Number.isInteger(value) && Math.abs(value) <= 10) return 'plain'
  const hit = evidence.some((e) => Math.abs(Number(e.toFixed(decimals)) - Math.abs(value)) < 1e-9 || Number(e.toFixed(decimals)) === value)
  return hit ? 'evidence' : 'plain'
}

/** AI text with numbers linked to evidence (cyan) or flagged (amber). Purely presentational. */
export function EvidenceText({ text, evidence, unsupported }: { text: string; evidence: number[]; unsupported: string[] }) {
  const { t } = useTranslation()
  const parts: (string | { n: string; mark: NumberMark })[] = []
  let last = 0
  for (const m of text.matchAll(NUMBER)) {
    const i = m.index ?? 0
    if (i > last) parts.push(text.slice(last, i))
    parts.push({ n: m[0], mark: classifyNumber(m[0], evidence, unsupported) })
    last = i + m[0].length
  }
  parts.push(text.slice(last))
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <Fragment key={i}>{p}</Fragment>
        ) : p.mark === 'evidence' ? (
          <mark key={i} className="rounded bg-cyan/10 px-0.5 text-cyan underline decoration-cyan/40 decoration-dotted underline-offset-2" title={t('analystP5.numberEvidence')}>
            {p.n}
          </mark>
        ) : p.mark === 'unsupported' ? (
          <mark key={i} className="rounded bg-warning/15 px-0.5 text-warning" title={t('analystP5.numberUnsupported')}>
            {p.n}
          </mark>
        ) : (
          <Fragment key={i}>{p.n}</Fragment>
        ),
      )}
    </>
  )
}

/** Deterministic metric cards that AI statements can be checked against. */
export function EvidenceGrid({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation()
  const rows: { key: keyof AnalysisResult['sites'][number]['metrics']; label: string; fmt: (v: number) => string }[] = [
    { key: 'sun_visibility_pct', label: t('comparison.sunVisibility'), fmt: (v) => formatPct(v, 2) },
    { key: 'earth_visibility_pct', label: t('comparison.earthVisibility'), fmt: (v) => formatPct(v, 2) },
    { key: 'joint_visibility_pct', label: t('comparison.jointVisibility'), fmt: (v) => formatPct(v, 2) },
    { key: 'longest_darkness_hours', label: t('comparison.longestDarkness'), fmt: formatHours },
    { key: 'longest_communication_gap_hours', label: t('comparison.commGap'), fmt: formatHours },
  ]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
      {result.sites.map((s, i) => (
        <div key={s.label} className="rounded-xl border border-line bg-bg-2/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
              <span className="size-2 shrink-0 rounded-full" style={{ background: siteColor(i) }} aria-hidden />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="font-mono text-[10px] text-fg-3">E{i + 1}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
            {rows.map((r) => (
              <div key={r.key} className="contents">
                <dt className="truncate text-fg-3">{r.label}</dt>
                <dd className="text-right text-fg">{r.fmt(s.metrics[r.key])}</dd>
              </div>
            ))}
            <dt className="text-fg-3">{t('comparison.score')}</dt>
            <dd className="text-right text-fg">{s.score === null ? t('analystP5.notScored') : s.score.toFixed(2)}</dd>
            {s.terrain?.unknown_hours != null && (
              <>
                <dt className="text-fg-3">{t('lab.unknownTime')}</dt>
                <dd className="text-right text-warning">{formatHours(s.terrain.unknown_hours)}</dd>
              </>
            )}
          </dl>
        </div>
      ))}
    </div>
  )
}
