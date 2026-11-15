import { useQuery } from '@tanstack/react-query'

import { api } from '@/services/apiClient'
import { useCapabilities } from '@/services/contracts'

import { SOLAR_ROUTE, type SolarParams, type SolarPotentialResponse } from './types'

export function solarQueryParams(p: SolarParams): Record<string, number> {
  const out: Record<string, number> = {}
  if (p.azimuthDeg !== undefined) out.azimuth_deg = p.azimuthDeg
  if (p.tiltDeg !== undefined) out.tilt_deg = p.tiltDeg
  if (p.trackingTiltDeg !== undefined) out.tracking_tilt_deg = p.trackingTiltDeg
  return out
}

export function fetchSolarPotential(analysisId: string, params: SolarParams): Promise<SolarPotentialResponse> {
  return api
    .get<SolarPotentialResponse>(SOLAR_ROUTE.replace('{analysis_id}', analysisId), {
      params: solarQueryParams(params),
      timeout: 60_000,
    })
    .then((r) => r.data)
}

/** True / false once the live OpenAPI schema is known; undefined while it loads. */
export function useSolarCapability(): { available: boolean | undefined; failed: boolean } {
  const caps = useCapabilities()
  return { available: caps.data ? caps.data.has(SOLAR_ROUTE) : undefined, failed: caps.isError }
}

export function useSolarPotential(analysisId: string | undefined, params: SolarParams, enabled: boolean) {
  return useQuery({
    queryKey: ['solar-potential', analysisId ?? '', params.azimuthDeg ?? 'auto', params.tiltDeg ?? 'default', params.trackingTiltDeg ?? 'default'],
    queryFn: () => fetchSolarPotential(analysisId!, params),
    enabled: Boolean(analysisId) && enabled,
    // Keep the previous payload only while parameters change within the SAME analysis.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === (analysisId ?? '') ? previous : undefined),
    staleTime: 60_000,
    retry: 1,
  })
}
