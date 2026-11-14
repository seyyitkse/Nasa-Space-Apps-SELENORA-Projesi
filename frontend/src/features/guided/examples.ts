import type { AnalysisResult, LandingSite } from '@/types/api'

const key2 = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`

/** Stored analyses that compare exactly the two chosen sites (any order). */
export function matchingExamples(items: AnalysisResult[], a: LandingSite, b: LandingSite) {
  const want = new Set([key2(a.latitude_deg, a.longitude_deg), key2(b.latitude_deg, b.longitude_deg)])
  return items.filter(
    (r) => r.status === 'COMPLETED' && r.sites.length === 2 && r.sites.every((s) => want.has(key2(s.latitude_deg, s.longitude_deg))),
  )
}
