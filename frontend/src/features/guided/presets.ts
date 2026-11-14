import type { DecisionWeights } from '@/types/api'

/**
 * SELENORA educational presets — NOT NASA-approved mission profiles.
 * They only set the weights of the same deterministic score the backend uses.
 */
export type Objective = 'sunlight' | 'earth' | 'balanced'

export const OBJECTIVE_WEIGHTS: Record<Objective, DecisionWeights> = {
  sunlight: { sun_visibility: 60, earth_visibility: 20, joint_visibility: 20 },
  earth: { sun_visibility: 20, earth_visibility: 60, joint_visibility: 20 },
  balanced: { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 },
}

export function sameWeights(a: DecisionWeights, b: DecisionWeights): boolean {
  return (
    Math.abs(a.sun_visibility - b.sun_visibility) < 0.01 &&
    Math.abs(a.earth_visibility - b.earth_visibility) < 0.01 &&
    Math.abs(a.joint_visibility - b.joint_visibility) < 0.01
  )
}

export function objectiveForWeights(w: DecisionWeights): Objective | null {
  return (Object.keys(OBJECTIVE_WEIGHTS) as Objective[]).find((k) => sameWeights(OBJECTIVE_WEIGHTS[k], w)) ?? null
}
