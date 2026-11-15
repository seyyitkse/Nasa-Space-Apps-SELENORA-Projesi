import type { ResolvedSite } from '@/stores/missionStore'
import type {
  DecisionWeights,
  HorizonModel,
  ScenarioComparisonCreate,
} from '@/types/api'

export const MIN_SCENARIOS = 2
export const MAX_SCENARIOS = 10
export const MAX_SCENARIO_DAYS = 30
export const MAX_TOTAL_SCENARIO_SAMPLES = 30_000
export const SCENARIO_TIME_STEPS = [10, 30, 60, 120, 360] as const

export interface ScenarioWindowDraft {
  id: string
  label: string
  start: string // YYYY-MM-DDTHH:mm interpreted explicitly as UTC
  end: string
}

export interface ScenarioPlannerInput {
  name: string
  site: ResolvedSite | null
  scenarios: ScenarioWindowDraft[]
  timeStepMinutes: number
  horizonModel: HorizonModel
  weights: DecisionWeights
}

export type ScenarioErrorKey =
  | 'name'
  | 'site'
  | 'count'
  | 'label'
  | 'date'
  | 'dateOrder'
  | 'dateSpan'
  | 'durationMismatch'
  | 'duplicate'
  | 'sampleLimit'
  | 'weights'

export interface ScenarioErrors {
  name?: ScenarioErrorKey
  site?: ScenarioErrorKey
  form?: ScenarioErrorKey
  rows: Record<string, Partial<Record<'label' | 'start' | 'end', ScenarioErrorKey>>>
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

export function parseUtcDateTime(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const parsed = Date.parse(`${value}:00Z`)
  return Number.isNaN(parsed) ? null : parsed
}

export function utcIso(value: string): string {
  const parsed = parseUtcDateTime(value)
  if (parsed === null) throw new Error('Invalid UTC scenario date')
  return new Date(parsed).toISOString()
}

export function scenarioSampleCount(
  scenario: Pick<ScenarioWindowDraft, 'start' | 'end'>,
  stepMinutes: number,
): number | null {
  const start = parseUtcDateTime(scenario.start)
  const end = parseUtcDateTime(scenario.end)
  if (start === null || end === null || end <= start) return null
  return Math.floor((end - start) / MINUTE_MS / stepMinutes) + 1
}

export function validateScenarioPlanner(input: ScenarioPlannerInput): ScenarioErrors {
  const errors: ScenarioErrors = { rows: {} }
  if (input.name.trim().length < 2 || input.name.trim().length > 160) errors.name = 'name'
  if (!input.site) errors.site = 'site'
  if (input.scenarios.length < MIN_SCENARIOS || input.scenarios.length > MAX_SCENARIOS) {
    errors.form = 'count'
  }

  const ranges = new Map<string, string>()
  const labels = new Set<string>()
  let expectedDuration: number | null = null
  let totalSamples = 0
  for (const scenario of input.scenarios) {
    const row: ScenarioErrors['rows'][string] = {}
    const label = scenario.label.trim().toLocaleLowerCase('en')
    if (!label || scenario.label.length > 120 || labels.has(label)) row.label = 'label'
    labels.add(label)
    const start = parseUtcDateTime(scenario.start)
    const end = parseUtcDateTime(scenario.end)
    if (start === null) row.start = 'date'
    if (end === null) row.end = 'date'
    if (start !== null && end !== null) {
      if (end <= start) row.end = 'dateOrder'
      else {
        const duration = end - start
        if (duration > MAX_SCENARIO_DAYS * DAY_MS) row.end = 'dateSpan'
        if (expectedDuration === null) expectedDuration = duration
        else if (duration !== expectedDuration) row.end = 'durationMismatch'
        const rangeKey = `${start}:${end}`
        const duplicateId = ranges.get(rangeKey)
        if (duplicateId) {
          row.end = 'duplicate'
          errors.rows[duplicateId] = { ...errors.rows[duplicateId], end: 'duplicate' }
        }
        ranges.set(rangeKey, scenario.id)
        totalSamples += Math.floor(duration / MINUTE_MS / input.timeStepMinutes) + 1
      }
    }
    if (Object.keys(row).length > 0) errors.rows[scenario.id] = row
  }
  if (totalSamples > MAX_TOTAL_SCENARIO_SAMPLES) errors.form = 'sampleLimit'
  const weightValues = Object.values(input.weights)
  if (
    weightValues.some((value) => !Number.isFinite(value) || value < 0 || value > 100) ||
    Math.abs(weightValues.reduce((sum, value) => sum + value, 0) - 100) > 0.01
  ) {
    errors.form = 'weights'
  }
  return errors
}

export function hasScenarioErrors(errors: ScenarioErrors): boolean {
  return Boolean(
    errors.name ||
      errors.site ||
      errors.form ||
      Object.values(errors.rows).some((row) => Object.keys(row).length > 0),
  )
}

export function toScenarioRequest(input: ScenarioPlannerInput): ScenarioComparisonCreate {
  if (!input.site) throw new Error('A scenario site is required')
  return {
    name: input.name.trim(),
    site: {
      site_id: input.site.ref.id,
      label: input.site.name,
      latitude_deg: input.site.latitude_deg,
      longitude_deg: input.site.longitude_deg,
      landing_site_id: input.site.source === 'reference' ? input.site.ref.id : null,
    },
    scenarios: input.scenarios.map((scenario) => ({
      scenario_id: scenario.id,
      label: scenario.label.trim(),
      start_utc: utcIso(scenario.start),
      end_utc: utcIso(scenario.end),
    })),
    time_step_minutes: input.timeStepMinutes,
    horizon_model: input.horizonModel,
    weights: input.weights,
  }
}
