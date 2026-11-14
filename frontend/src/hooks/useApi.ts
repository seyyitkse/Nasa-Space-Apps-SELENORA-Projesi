import { useQuery } from '@tanstack/react-query'

import { queryKeys, selenoraApi } from '@/services/selenoraApi'

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
