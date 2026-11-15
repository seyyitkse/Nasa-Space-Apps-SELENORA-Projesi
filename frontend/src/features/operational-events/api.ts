import { useQuery } from '@tanstack/react-query'

import { api } from '@/services/apiClient'
import { useCapabilities } from '@/services/contracts'

import { EVENTS_ROUTE, type EventsResponse } from './types'

export function fetchEvents(analysisId: string, referenceUtc?: string): Promise<EventsResponse> {
  return api
    .get<EventsResponse>(EVENTS_ROUTE.replace('{analysis_id}', analysisId), {
      params: referenceUtc ? { reference_utc: referenceUtc } : undefined,
      timeout: 60_000,
    })
    .then((r) => r.data)
}

/** True / false once the live OpenAPI schema is known; undefined while it loads. */
export function useEventsCapability(): { available: boolean | undefined; failed: boolean } {
  const caps = useCapabilities()
  return { available: caps.data ? caps.data.has(EVENTS_ROUTE) : undefined, failed: caps.isError }
}

/**
 * `referenceUtc` undefined lets the backend choose: the current time when it is
 * inside the analysis (refetched every minute), otherwise the first sample.
 */
export function useOperationalEvents(analysisId: string | undefined, referenceUtc: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['operational-events', analysisId ?? '', referenceUtc ?? 'auto'],
    queryFn: () => fetchEvents(analysisId!, referenceUtc),
    enabled: Boolean(analysisId) && enabled,
    // Keep the previous payload only while the reference moves within the SAME analysis;
    // never show another analysis's events under the new one.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === (analysisId ?? '') ? previous : undefined),
    refetchInterval: referenceUtc ? false : 60_000,
    retry: 1,
  })
}
