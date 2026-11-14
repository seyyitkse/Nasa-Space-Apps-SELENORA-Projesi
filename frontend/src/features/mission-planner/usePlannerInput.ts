import { useMemo } from 'react'

import { useSites } from '@/hooks/useApi'
import { resolveSite, useMissionStore } from '@/stores/missionStore'

import type { PlannerInput } from './validation'

/** Resolves the persisted draft (site refs) into concrete planner input. */
export function usePlannerInput(): PlannerInput & { referenceLoaded: boolean } {
  const draft = useMissionStore((s) => s.draft)
  const custom = useMissionStore((s) => s.customSites)
  const { data } = useSites()
  return useMemo(
    () => ({
      missionName: draft.missionName,
      siteA: resolveSite(draft.siteA, data?.items, custom),
      siteB: resolveSite(draft.siteB, data?.items, custom),
      startDate: draft.startDate,
      endDate: draft.endDate,
      timeStepMinutes: draft.timeStepMinutes,
      horizonModel: draft.horizonModel,
      weights: draft.weights,
      referenceLoaded: !!data,
    }),
    [draft, custom, data],
  )
}
