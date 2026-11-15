import { useQuery } from '@tanstack/react-query'

import { api } from '@/services/apiClient'
import { useCapabilities } from '@/services/contracts'

import {
  MISSIONS_ROUTE,
  type MissionCatalog,
  type MissionProgram,
  type OutcomeFilter,
} from './types'

export interface MissionQuery {
  program?: MissionProgram | null
  outcome?: OutcomeFilter | null
}

export function fetchMissions(q: MissionQuery = {}): Promise<MissionCatalog> {
  const params: Record<string, string> = {}
  if (q.program) params.program = q.program
  if (q.outcome) params.outcome = q.outcome
  return api.get<MissionCatalog>(MISSIONS_ROUTE, { params }).then((r) => r.data)
}

export function useMissionsCapability(): { available: boolean | undefined; failed: boolean } {
  const caps = useCapabilities()
  return { available: caps.data ? caps.data.has(MISSIONS_ROUTE) : undefined, failed: caps.isError }
}

export function useMissions(q: MissionQuery, enabled: boolean) {
  return useQuery({
    queryKey: ['lunar-missions', q.program ?? 'all', q.outcome ?? 'all'],
    queryFn: () => fetchMissions(q),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
