/**
 * Client-side re-weighting of STORED metrics — an exact mirror of
 * backend/app/science/scoring.py (score_site + dense rank, 3-decimal rounding).
 * It never touches visibility values; it only re-combines the percentages the
 * backend already computed. Results are exploratory and never persisted.
 */
import type { DecisionWeights, SiteResult, WeightKey } from '@/types/api'

const KEYS: { weight: WeightKey; metric: 'sun_visibility_pct' | 'earth_visibility_pct' | 'joint_visibility_pct' }[] = [
  { weight: 'sun_visibility', metric: 'sun_visibility_pct' },
  { weight: 'earth_visibility', metric: 'earth_visibility_pct' },
  { weight: 'joint_visibility', metric: 'joint_visibility_pct' },
]

const r3 = (v: number) => Math.round(v * 1000) / 1000

export interface Rescored {
  label: string
  index: number
  storedScore: number | null
  storedRank: number | null
  score: number
  rank: number
  contributions: Record<WeightKey, number>
}

export function weightsValid(w: DecisionWeights): boolean {
  const vals = [w.sun_visibility, w.earth_visibility, w.joint_visibility]
  return vals.every((v) => v >= 0) && Math.abs(vals.reduce((a, b) => a + b, 0) - 100) <= 0.01
}

export function scoreMetrics(metrics: SiteResult['metrics'], w: DecisionWeights) {
  const contributions = {} as Record<WeightKey, number>
  for (const k of KEYS) contributions[k.weight] = r3((w[k.weight] / 100) * metrics[k.metric])
  const score = r3(KEYS.reduce((acc, k) => acc + contributions[k.weight], 0))
  return { score, contributions }
}

export function denseRank(scores: number[]): number[] {
  const distinct = [...new Set(scores)].sort((a, b) => b - a)
  return scores.map((s) => distinct.indexOf(s) + 1)
}

export function rescore(sites: SiteResult[], w: DecisionWeights): Rescored[] {
  const scored = sites.map((s) => scoreMetrics(s.metrics, w))
  const ranks = denseRank(scored.map((x) => x.score))
  return sites.map((s, i) => ({
    label: s.label,
    index: i,
    storedScore: s.score,
    storedRank: s.rank,
    score: scored[i]!.score,
    rank: ranks[i]!,
    contributions: scored[i]!.contributions,
  }))
}

export type ChangeExplanation =
  | { kind: 'unchanged' }
  | { kind: 'tie'; labels: string[] }
  | { kind: 'leader'; leader: string; previous: string | null; margin: number; driver: WeightKey; driverDelta: number }

/** Why the outcome changed (or not) relative to the stored weights. */
export function explainChange(sites: SiteResult[], stored: DecisionWeights, next: DecisionWeights): ChangeExplanation {
  const after = rescore(sites, next)
  const before = rescore(sites, stored)
  const leaders = after.filter((s) => s.rank === 1)
  if (leaders.length > 1) return { kind: 'tie', labels: leaders.map((l) => l.label) }
  const leader = leaders[0]!
  const prevLeaders = before.filter((s) => s.rank === 1)
  const previous = prevLeaders.length === 1 ? prevLeaders[0]!.label : null
  const runnerUp = after.filter((s) => s.index !== leader.index).sort((a, b) => b.score - a.score)[0]
  if (!runnerUp) return { kind: 'unchanged' }
  const margin = r3(leader.score - runnerUp.score)
  let driver: WeightKey = 'sun_visibility'
  let best = -Infinity
  for (const k of KEYS) {
    const d = leader.contributions[k.weight] - runnerUp.contributions[k.weight]
    if (d > best) {
      best = d
      driver = k.weight
    }
  }
  if (previous === leader.label && JSON.stringify(stored) === JSON.stringify(next)) return { kind: 'unchanged' }
  return { kind: 'leader', leader: leader.label, previous, margin, driver, driverDelta: r3(best) }
}
