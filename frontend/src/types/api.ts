/**
 * TypeScript mirror of the backend Pydantic contract (backend/app/schemas).
 * Keep in sync with docs/API_CONTRACT.md.
 */

export type DataQuality =
  | 'EPHEMERIS_GEOMETRIC'
  | 'EPHEMERIS_TERRAIN'
  | 'LOCAL_TERRAIN_PARTIAL'
  | 'SYNTHETIC_DEMO'
  | 'PARTIAL'
  | 'UNAVAILABLE'

export type HorizonModel = 'GEOMETRIC' | 'TERRAIN'

export type ComponentState =
  | 'OK'
  | 'DEGRADED'
  | 'DOWN'
  | 'NOT_CONFIGURED'
  | 'NOT_IMPLEMENTED'
  | 'READY'

export interface ComponentStatus {
  name: string
  status: ComponentState
  detail: string
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  service: string
  version: string
  api_version: string
  algorithm_version: string
  environment: string
  server_time_utc: string
  uptime_seconds: number
  components: ComponentStatus[]
}

export interface LandingSite {
  id: string
  name: string
  latitude_deg: number
  longitude_deg: number
  region: string
  description: string
  coordinate_source: string
  coordinate_status: string
}

export interface LandingSiteList {
  items: LandingSite[]
  total: number
  coordinate_frame: string
  longitude_convention: string
  disclaimer: string
}

/** Phase 6B globe marker — same seed IDs as LandingSite, plus ME Cartesian and LOLA flags. */
export interface CartesianME {
  x_m: number
  y_m: number
  z_m: number
  radius_m: number
  frame: string
}

export interface GlobeSiteMarker extends LandingSite {
  longitude_normalized_deg: number
  south_polar: boolean
  local_lola_coverage: boolean
  local_lola_tile: string | null
  geometric_analysis_supported: boolean
  cartesian_me: CartesianME
  not_nasa_landing_recommendation: boolean
}

export interface GlobeSiteCatalog {
  title: string
  coordinate_frame: string
  longitude_convention: string
  sphere_radius_m: number
  south_polar_threshold_deg: number
  cartesian_convention: string
  svs_glb_orientation_status: string
  svs_glb_note: string
  disclaimer: string
  sites_disclaimer: string
  related_endpoints: Record<string, string>
  total: number
  items: GlobeSiteMarker[]
}

export type IntegrationStatus = 'CLIENT_READY' | 'INTEGRATED' | 'PLANNED' | 'NOT_CONFIGURED'

export interface DataSource {
  id: string
  name: string
  provider: string
  category: 'EPHEMERIS' | 'TOPOGRAPHY' | 'AI_EXPLANATION'
  description: string
  url: string
  documentation_url: string
  integration_status: IntegrationStatus
  used_for: string[]
  phase: number
  notes: string
}

export interface DataSourceList {
  items: DataSource[]
}

export interface SiteInput {
  label: string
  latitude_deg: number
  longitude_deg: number
  landing_site_id?: string | null
}

export interface DecisionWeights {
  sun_visibility: number
  earth_visibility: number
  joint_visibility: number
}

export interface AnalysisCreate {
  mission_name: string
  sites: SiteInput[]
  start_utc: string
  end_utc: string
  time_step_minutes: number
  horizon_model: HorizonModel
  weights: DecisionWeights
}

export interface Interval {
  start_utc: string
  end_utc: string
  duration_hours: number
}

export interface VisibilityMetrics {
  /** Null when no scientifically valid samples exist for that body. */
  sun_visibility_pct: number | null
  earth_visibility_pct: number | null
  joint_visibility_pct: number | null
  longest_sunlight_hours: number
  longest_darkness_hours: number
  longest_earth_visibility_hours: number
  longest_communication_gap_hours: number
  longest_joint_visibility_hours: number
}

export type WeightKey = keyof DecisionWeights

export interface ScoreContribution {
  metric: WeightKey
  weight_pct: number
  value_pct: number
  contribution: number
}

export interface TerrainSiteMeta {
  dem_file: string | null
  dem_site_id: string | null
  resolution_m: number | null
  horizon_coverage_fraction: number | null
  any_data_fraction?: number | null
  complete_coverage_fraction?: number | null
  median_valid_range_m?: number | null
  min_valid_range_m?: number | null
  max_range_m?: number | null
  true_north_grid_azimuth_deg?: number | null
  observer_height_m: number | null
  surface_z_m: number | null
  dataset_version: string | null
  sun_unknown_fraction: number | null
  earth_unknown_fraction: number | null
  unknown_hours?: number | null
  known_sample_fraction?: number | null
}

export interface GeometricVsTerrain {
  geometric: VisibilityMetrics
  longest_darkness_hours_delta: number
  longest_communication_gap_hours_delta: number
  sun_visibility_pct_delta: number | null
  earth_visibility_pct_delta: number | null
  joint_visibility_pct_delta: number | null
}

export interface SiteResult {
  label: string
  latitude_deg: number
  longitude_deg: number
  landing_site_id: string | null
  metrics: VisibilityMetrics
  score: number | null
  rank: number | null
  contributions: ScoreContribution[]
  darkness_windows: Interval[]
  communication_gaps: Interval[]
  joint_windows: Interval[]
  terrain?: TerrainSiteMeta | null
  geometric_comparison?: GeometricVsTerrain | null
}

export interface TerrainCoverage {
  covered: boolean
  latitude_deg: number
  longitude_deg: number
  stereo_x_m: number
  stereo_y_m: number
  surface_z_m: number | null
  dem_site_id: string | null
  dem_file: string | null
  message: string
  dataset_version: string
  citation: string
}

export interface Provenance {
  source_id: string
  description: string
  retrieved_at: string | null
  version: string | null
}

export type AnalysisLifecycle = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export interface AnalysisStatus {
  id: string
  status: AnalysisLifecycle
  data_quality: DataQuality
}

export interface ScenarioSiteInput {
  site_id: string
  label: string
  latitude_deg: number
  longitude_deg: number
  landing_site_id?: string | null
}

export interface ScenarioWindowInput {
  scenario_id: string
  label: string
  start_utc: string
  end_utc: string
}

export interface ScenarioComparisonCreate {
  name: string
  site: ScenarioSiteInput
  scenarios: ScenarioWindowInput[]
  time_step_minutes: number
  horizon_model: HorizonModel
  weights: DecisionWeights
}

export interface ScenarioEvidence {
  scenario_id: string
  label: string
  start_utc: string
  end_utc: string
  sample_count: number
  data_quality: DataQuality
  algorithm_version: string
  site: SiteResult
  assumptions: string[]
  limitations: string[]
  provenance: Provenance[]
}

export interface ScenarioComparisonResult {
  id: string
  name: string
  status: 'COMPLETED'
  cache_status: 'MISS' | 'HIT' | 'STORED'
  site: ScenarioSiteInput
  time_step_minutes: number
  horizon_model: HorizonModel
  weights: DecisionWeights
  window_duration_hours: number
  scenarios: ScenarioEvidence[]
  recommended_scenario_id: string | null
  recommendation_available: boolean
  recommendation_note: string
  created_at: string
}

export interface ScenarioComparisonStatus {
  id: string
  name: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  site_id: string
  scenario_count: number
  horizon_model: HorizonModel
  created_at: string
  error_message: string | null
}

export interface AnalysisResult {
  id: string
  mission_name: string
  status: AnalysisLifecycle
  data_quality: DataQuality
  algorithm_version: string
  start_utc: string
  end_utc: string
  time_step_minutes: number
  horizon_model: HorizonModel
  weights: DecisionWeights
  sites: SiteResult[]
  recommended_site_label: string | null
  assumptions: string[]
  limitations: string[]
  provenance: Provenance[]
  created_at: string
}

export interface TimelinePoint {
  t: string
  sun_elevation_deg: number | null
  earth_elevation_deg: number | null
}

export interface SiteTimeline {
  label: string
  points: TimelinePoint[]
}

export interface TimelineResponse {
  analysis_id: string
  data_quality: DataQuality
  downsampled: boolean
  step_minutes: number
  sites: SiteTimeline[]
}

export interface DemoAnalysisResponse {
  result: AnalysisResult
  timeline: TimelineResponse
}

export interface ExplainRequest {
  language: 'en' | 'tr'
  regenerate?: boolean
}

export interface AIMissionReport {
  summary: string
  key_findings: string[]
  site_advantages: Record<string, string[]>
  site_disadvantages: Record<string, string[]>
  comparison_explanation: string
  mission_tradeoffs: string[]
  scientific_limitations: string[]
  data_quality_notes: string[]
}

export interface ExplainResponse {
  analysis_id: string
  language: 'en' | 'tr'
  model: string
  prompt_version: string
  recommended_site_label: string | null
  report: AIMissionReport
  unsupported_numbers: string[]
  cached: boolean
  generated_at: string
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
  request_id?: string | null
}
