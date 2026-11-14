import { useQuery } from '@tanstack/react-query'

import { queryKeys, selenoraApi } from '@/services/selenoraApi'
import type { AnalysisLifecycle } from '@/types/api'

const IN_FLIGHT: AnalysisLifecycle[] = ['PENDING', 'RUNNING']

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: selenoraApi.health,
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useSites() {
  return useQuery({ queryKey: queryKeys.sites, queryFn: selenoraApi.sites, staleTime: 5 * 60_000 })
}

export function useDataSources() {
  return useQuery({
    queryKey: queryKeys.dataSources,
    queryFn: selenoraApi.dataSources,
    staleTime: 5 * 60_000,
  })
}

export function useAnalyses() {
  return useQuery({ queryKey: queryKeys.analyses, queryFn: selenoraApi.analyses })
}

/** Load a stored analysis; poll while PENDING/RUNNING. */
export function useAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.analysis(id ?? ''),
    queryFn: () => selenoraApi.getAnalysis(id!),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      const status = q.state.data?.status
      return status && IN_FLIGHT.includes(status) ? 2_000 : false
    },
  })
}

export function useTimeline(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.timeline(id ?? ''),
    queryFn: () => selenoraApi.getTimeline(id!),
    enabled: Boolean(id) && enabled,
  })
}

export function useExplanation(id: string | undefined, language?: 'en' | 'tr') {
  return useQuery({
    queryKey: queryKeys.explanation(id ?? '', language),
    queryFn: () => selenoraApi.getExplanation(id!, language),
    enabled: Boolean(id),
    retry: false,
  })
}
