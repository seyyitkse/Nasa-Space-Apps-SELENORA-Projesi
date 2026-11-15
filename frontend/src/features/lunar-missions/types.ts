/** Phase 7E — verified lunar mission catalog (client contract). */

export const MISSIONS_ROUTE = '/api/v1/missions' as const

export type MissionProgram = 'APOLLO' | 'CLPS'

export type MissionStatus =
  | 'COMPLETED_SUCCESS'
  | 'COMPLETED_PARTIAL'
  | 'UNSUCCESSFUL'
  | 'ABORTED'
  | 'PLANNED'

export type LandingOutcome =
  | 'SUCCESSFUL_LANDING'
  | 'PARTIAL_SUCCESS_LANDING'
  | 'NO_LANDING_ABORTED'
  | 'NO_LANDING_FAILED'
  | 'NOT_LANDED_YET'

export type MissionConfidence = 'EXACT_VERIFIED' | 'APPROXIMATE_REGION'

export type RegionRepresentation = 'POINT_LANDING' | 'FEATURE_CENTROID_APPROXIMATE' | 'NONE'

export type MarkerKind = 'ACTUAL_LANDING' | 'PLANNED_TARGET_REGION' | 'LIST_ONLY'

export type OutcomeFilter =
  | 'successful'
  | 'partial'
  | 'unsuccessful'
  | 'aborted'
  | 'planned'
  | 'unsuccessful_or_aborted'

export interface PlannedTarget {
  name: string
  latitude_deg: number | null
  longitude_deg: number | null
  note: string
  coordinate_system: string | null
  coordinate_system_note: string | null
}

export interface MissionItem {
  id: string
  name: string
  program: MissionProgram
  operator: string
  status: MissionStatus
  landing_outcome: LandingOutcome
  launch_date: string | null
  landing_date: string | null
  latitude_deg: number | null
  longitude_deg: number | null
  source_longitude_deg: number | null
  source_longitude_convention: string | null
  coordinate_frame: string
  source_coordinate_system: string
  source_frame_label: string
  coordinate_uncertainty_m: number | null
  coordinate_precision_note: string | null
  confidence: MissionConfidence
  approximate_region: boolean
  region_representation: RegionRepresentation
  planned_target: PlannedTarget | null
  source_url: string
  lroc_source_url: string | null
  source_access_date: string
  notes: string
  longitude_normalized_deg: number | null
  cartesian_me: Record<string, number | string> | null
  marker_kind: MarkerKind
  south_polar: boolean
  explorer_coverage: boolean
  terrain_scoring_supported: boolean
  not_nasa_landing_recommendation: boolean
}

export interface MissionCatalog {
  title: string
  catalog_version: string
  generated_date: string
  coordinate_frame: string
  coordinate_convention: string
  me_pa_policy: string
  longitude_convention: string
  sphere_radius_m: number
  south_polar_threshold_deg: number
  disclaimer: string
  filters: Record<string, string[]>
  related_endpoints: Record<string, string>
  total: number
  items: MissionItem[]
}

/** Globe overlay marker derived from a catalog row (verified coords only). */
export interface MissionGlobeMarker {
  id: string
  name: string
  lat: number
  lon: number
  program: MissionProgram
  landing_outcome: LandingOutcome
  marker_kind: Exclude<MarkerKind, 'LIST_ONLY'>
  status: MissionStatus
}

export function outcomeVisual(outcome: LandingOutcome): 'successful' | 'partial' | 'unsuccessful' | 'aborted' | 'planned' {
  switch (outcome) {
    case 'SUCCESSFUL_LANDING':
      return 'successful'
    case 'PARTIAL_SUCCESS_LANDING':
      return 'partial'
    case 'NO_LANDING_FAILED':
      return 'unsuccessful'
    case 'NO_LANDING_ABORTED':
      return 'aborted'
    case 'NOT_LANDED_YET':
      return 'planned'
  }
}

/** Map pin colour by outcome (distinct successful / partial / failed / aborted / planned). */
export const MISSION_COLORS = {
  successful: '#3DDC97',
  partial: '#F5C674',
  unsuccessful: '#F07178',
  aborted: '#9585FF',
  planned: '#56D9E9',
} as const

export function missionToGlobeMarker(m: MissionItem): MissionGlobeMarker | null {
  if (m.marker_kind === 'ACTUAL_LANDING' && m.latitude_deg != null && m.longitude_deg != null) {
    return {
      id: m.id,
      name: m.name,
      lat: m.latitude_deg,
      lon: m.longitude_deg,
      program: m.program,
      landing_outcome: m.landing_outcome,
      marker_kind: 'ACTUAL_LANDING',
      status: m.status,
    }
  }
  const t = m.planned_target
  if (
    m.marker_kind === 'PLANNED_TARGET_REGION' &&
    t?.latitude_deg != null &&
    t.longitude_deg != null
  ) {
    return {
      id: m.id,
      name: m.name,
      lat: t.latitude_deg,
      lon: t.longitude_deg,
      program: m.program,
      landing_outcome: m.landing_outcome,
      marker_kind: 'PLANNED_TARGET_REGION',
      status: m.status,
    }
  }
  return null
}
