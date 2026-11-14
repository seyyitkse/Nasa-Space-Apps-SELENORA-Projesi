import type { ResolvedSite } from '@/stores/missionStore'
import type { AnalysisCreate, DecisionWeights, HorizonModel } from '@/types/api'

/** Mirrors backend limits in app/schemas/analysis.py. */
export const MAX_ANALYSIS_DAYS = 30
export const TIME_STEPS = [10, 30, 60, 120, 360] as const

export type PlannerErrorKey =
  | 'missionName'
  | 'siteRequired'
  | 'sameSite'
  | 'dateRequired'
  | 'dateOrder'
  | 'dateSpan'
  | 'weightsSum'
  | 'weightRange'

export type PlannerErrors = Partial<
  Record<'missionName' | 'siteA' | 'siteB' | 'startDate' | 'endDate' | 'weights', PlannerErrorKey>
>

export interface PlannerInput {
  missionName: string
  siteA: ResolvedSite | null
  siteB: ResolvedSite | null
  startDate: string
  endDate: string
  timeStepMinutes: number
  horizonModel: HorizonModel
  weights: DecisionWeights
}

const DAY_MS = 86_400_000

export function parseUtcDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms
}

export function weightsTotal(w: DecisionWeights): number {
  return Math.round((w.sun_visibility + w.earth_visibility + w.joint_visibility) * 100) / 100
}

/** Scale weights proportionally so they total exactly 100 (integers). */
export function normalizeWeights(w: DecisionWeights): DecisionWeights {
  const total = w.sun_visibility + w.earth_visibility + w.joint_visibility
  if (total <= 0) return { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 }
  const sun = Math.round((w.sun_visibility / total) * 100)
  const earth = Math.round((w.earth_visibility / total) * 100)
  return { sun_visibility: sun, earth_visibility: earth, joint_visibility: Math.max(0, 100 - sun - earth) }
}

export function validatePlanner(input: PlannerInput): PlannerErrors {
  const errors: PlannerErrors = {}
  const name = input.missionName.trim()
  if (name.length < 2 || name.length > 160) errors.missionName = 'missionName'

  if (!input.siteA) errors.siteA = 'siteRequired'
  if (!input.siteB) errors.siteB = 'siteRequired'
  if (
    input.siteA &&
    input.siteB &&
    input.siteA.latitude_deg === input.siteB.latitude_deg &&
    input.siteA.longitude_deg === input.siteB.longitude_deg
  ) {
    errors.siteB = 'sameSite'
  }

  const start = parseUtcDate(input.startDate)
  const end = parseUtcDate(input.endDate)
  if (start === null) errors.startDate = 'dateRequired'
  if (end === null) errors.endDate = 'dateRequired'
  if (start !== null && end !== null) {
    if (end <= start) errors.endDate = 'dateOrder'
    else if (end - start > MAX_ANALYSIS_DAYS * DAY_MS) errors.endDate = 'dateSpan'
  }

  const w = input.weights
  if ([w.sun_visibility, w.earth_visibility, w.joint_visibility].some((v) => v < 0 || v > 100 || !Number.isFinite(v))) {
    errors.weights = 'weightRange'
  } else if (Math.abs(weightsTotal(w) - 100) > 0.01) {
    errors.weights = 'weightsSum'
  }
  return errors
}

export function sampleCount(input: Pick<PlannerInput, 'startDate' | 'endDate' | 'timeStepMinutes'>): number | null {
  const start = parseUtcDate(input.startDate)
  const end = parseUtcDate(input.endDate)
  if (start === null || end === null || end <= start) return null
  return Math.floor((end - start) / 60_000 / input.timeStepMinutes) + 1
}

export function toAnalysisRequest(input: PlannerInput): AnalysisCreate {
  if (!input.siteA || !input.siteB) throw new Error('Both sites are required')
  const site = (s: ResolvedSite) => ({
    label: s.name,
    latitude_deg: s.latitude_deg,
    longitude_deg: s.longitude_deg,
    landing_site_id: s.source === 'reference' ? s.ref.id : null,
  })
  return {
    mission_name: input.missionName.trim(),
    sites: [site(input.siteA), site(input.siteB)],
    start_utc: `${input.startDate}T00:00:00Z`,
    end_utc: `${input.endDate}T00:00:00Z`,
    time_step_minutes: input.timeStepMinutes,
    horizon_model: input.horizonModel,
    weights: input.weights,
  }
}
