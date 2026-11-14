/**
 * Plain-language explanation of a STORED analysis result.
 *
 * Every statement is derived from numbers the backend returned — nothing is
 * estimated, smoothed or simplified. Statements are split into what the data
 * establishes and what remains uncertain. Rendering (EN/TR) happens in the UI
 * via i18n keys; this module only decides which statements apply.
 */
import type { AnalysisResult, DecisionWeights, SiteResult } from '@/types/api'

import { canRescore, MAX_WINDOWS, recommendationStatus } from '../analysis-data/adapter'
import { rescore } from '../site-comparison/rescore'
import { sameWeights } from './presets'

export interface Statement {
  key: string
  params?: Record<string, string | number>
}

export interface SiteFacts {
  label: string
  index: number
  established: Statement[]
  uncertain: Statement[]
}

export type Verdict =
  | { kind: 'recommended'; site: string; source: 'stored' | 'reweighted'; margin: number }
  | { kind: 'tie' }
  | { kind: 'refused'; reason: 'partial_terrain' | 'partial' | 'unavailable' | 'unscored' }

export interface Explanation {
  verdict: Verdict
  sites: SiteFacts[]
  general: Statement[]
}

const r1 = (v: number) => Math.round(v * 10) / 10

function siteFacts(result: AnalysisResult, s: SiteResult, index: number): SiteFacts {
  const terrain = result.horizon_model === 'TERRAIN'
  const m = s.metrics
  const established: Statement[] = [
    { key: 'sun', params: { pct: r1(m.sun_visibility_pct) } },
    { key: 'earth', params: { pct: r1(m.earth_visibility_pct) } },
    { key: 'joint', params: { pct: r1(m.joint_visibility_pct) } },
    { key: 'darkness', params: { hours: r1(m.longest_darkness_hours) } },
    { key: 'gap', params: { hours: r1(m.longest_communication_gap_hours) } },
  ]
  const uncertain: Statement[] = []

  if (terrain && s.terrain) {
    const geo = s.geometric_comparison?.geometric
    if (geo && geo.sun_visibility_pct > 0 && m.sun_visibility_pct === 0)
      established.push({ key: 'terrainBlocksSunAll', params: { geo: r1(geo.sun_visibility_pct) } })
    else if (geo && geo.sun_visibility_pct - m.sun_visibility_pct >= 1)
      established.push({ key: 'terrainReducesSun', params: { geo: r1(geo.sun_visibility_pct), terrain: r1(m.sun_visibility_pct) } })
    const unknownH = s.terrain.unknown_hours ?? 0
    if (unknownH > 0) uncertain.push({ key: 'unknownHours', params: { hours: r1(unknownH) } })
    const cov = s.terrain.horizon_coverage_fraction
    if (cov !== null && cov !== undefined && cov < 0.99)
      uncertain.push({ key: 'partialCoverage', params: { pct: r1(cov * 100), km: r1((s.terrain.max_range_m ?? 12000) / 1000) } })
    const sunU = s.terrain.sun_unknown_fraction ?? 0
    if (sunU > 0 || s.darkness_windows.length >= MAX_WINDOWS) uncertain.push({ key: 'perEpochDerived' })
  } else {
    uncertain.push({ key: 'noTerrain' })
  }
  return { label: s.label, index, established, uncertain }
}

/**
 * @param objective Weights of the chosen educational preset. If they differ from
 *   the stored analysis weights, the ranking is re-weighted in the browser with the
 *   exact backend formula — only when the backend itself produced scores.
 */
export function explainResult(result: AnalysisResult, objective?: DecisionWeights): Explanation {
  const status = recommendationStatus(result)
  let verdict: Verdict
  if (status.kind === 'refused') verdict = { kind: 'refused', reason: status.reason }
  else if (objective && !sameWeights(objective, result.weights) && canRescore(result)) {
    const rows = rescore(result.sites, objective)
    const leaders = rows.filter((r) => r.rank === 1)
    if (leaders.length !== 1) verdict = { kind: 'tie' }
    else {
      const second = rows.filter((r) => r.rank !== 1).sort((a, b) => b.score - a.score)[0]
      verdict = { kind: 'recommended', site: leaders[0]!.label, source: 'reweighted', margin: r1(leaders[0]!.score - (second?.score ?? 0)) }
    }
  } else if (status.kind === 'recommended') {
    const scores = result.sites.map((s) => s.score ?? 0).sort((a, b) => b - a)
    verdict = { kind: 'recommended', site: status.label, source: 'stored', margin: r1((scores[0] ?? 0) - (scores[1] ?? 0)) }
  } else verdict = { kind: 'tie' }

  const general: Statement[] = [{ key: 'earthLink' }, { key: 'heuristic' }]
  if (result.data_quality === 'SYNTHETIC_DEMO') general.unshift({ key: 'synthetic' })
  // All SELENORA seed coordinates are APPROXIMATE_REFERENCE; terrain results are sensitive to small shifts.
  general.push({ key: 'approxCoords' })

  return { verdict, sites: result.sites.map((s, i) => siteFacts(result, s, i)), general }
}
