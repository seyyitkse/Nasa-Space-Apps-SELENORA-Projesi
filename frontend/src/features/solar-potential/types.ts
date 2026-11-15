/** Contract of GET /api/v1/analyses/{analysis_id}/solar-potential (Phase 7B, contract 7b.1). */

export const SOLAR_ROUTE = '/api/v1/analyses/{analysis_id}/solar-potential'

export type PanelKind = 'HORIZONTAL' | 'FIXED' | 'AZIMUTH_TRACKING' | 'DUAL_AXIS'
export type HorizonType = 'GEOMETRIC' | 'TERRAIN'
export type IndexStatus = 'DETERMINED' | 'RANGE' | 'UNAVAILABLE'
export type AzimuthSource = 'REQUESTED' | 'OPTIMISED_HINDSIGHT_GEOMETRIC'
export type IndexUnavailableReason = 'NO_DURATION' | 'NO_EPHEMERIS' | 'NO_KNOWN_VISIBILITY'
export type PanelUnavailableReason = 'AZIMUTH_UNDEFINED_AT_POLE' | 'NO_SUNLIT_SAMPLE_TO_OPTIMISE_AZIMUTH'
export type ComparisonStatus = 'DISTINGUISHABLE' | 'NOT_DISTINGUISHABLE' | 'UNAVAILABLE'

/** Relative index in percent of an ideal dual-axis panel in continuous sunlight. Never watts. */
export interface IndexEstimate {
  horizon: HorizonType
  status: IndexStatus
  /** Only when the bounds coincide; never a midpoint. */
  index_pct: number | null
  index_min_pct: number | null
  index_max_pct: number | null
  unavailable_reason: IndexUnavailableReason | null
  window_hours: number
  known_hours: number
  unknown_hours: number
  unknown_fraction: number | null
  edge_uncertain_hours: number
}

export interface PanelResult {
  panel: PanelKind
  tilt_deg: number | null
  azimuth_deg: number | null
  azimuth_source: AzimuthSource | null
  available: boolean
  unavailable_reason: PanelUnavailableReason | null
  geometric: IndexEstimate | null
  terrain: IndexEstimate | null
}

export interface GeometricSunSummary {
  above_horizon_hours: number
  below_horizon_hours: number
  missing_ephemeris_hours: number
  above_horizon_fraction_min: number | null
  above_horizon_fraction_max: number | null
}

export interface TerrainSunSummary {
  visible_hours: number
  blocked_hours: number
  unknown_hours: number
  visible_fraction_min: number | null
  visible_fraction_max: number | null
  unknown_fraction: number | null
}

export interface SiteSolarPotential {
  site_index: number
  label: string
  latitude_deg: number
  longitude_deg: number
  landing_site_id: string | null
  dem_site_id: string | null
  terrain_complete_coverage_fraction: number | null
  window_hours: number
  sample_count: number
  sun_above_geometric_horizon: GeometricSunSummary
  sun_terrain_visibility: TerrainSunSummary | null
  configurations: PanelResult[]
}

export interface SiteComparison {
  panel: PanelKind
  horizon: HorizonType
  status: ComparisonStatus
  leading_site_index: number | null
}

export interface SolarPotentialResponse {
  analysis_id: string
  mission_name: string
  horizon_model: HorizonType
  data_quality: string
  algorithm_version: string
  terrain_engine_version: string | null
  solar_contract_version: string
  start_utc: string
  end_utc: string
  time_step_minutes: number
  generated_at_utc: string
  headline_horizon: HorizonType
  index_definition: string
  sun_angular_radius_deg: number
  sites: SiteSolarPotential[]
  comparisons: SiteComparison[]
  electrical_energy: { available: false; reason: string; missing_inputs: string[] }
  assumptions: string[]
  provenance: { source_id: string; description: string; version: string | null }[]
  limitations: string[]
}

/** Panel parameters the user can set. `undefined` lets the backend use its default. */
export interface SolarParams {
  /** Fixed panel azimuth, degrees clockwise from true north. Undefined → per-site hindsight optimum. */
  azimuthDeg?: number
  /** Fixed panel tilt from horizontal (0–90). */
  tiltDeg?: number
  /** Azimuth-tracking panel tilt (0–90). */
  trackingTiltDeg?: number
}
