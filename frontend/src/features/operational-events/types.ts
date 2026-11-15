/** Contract of GET /api/v1/analyses/{analysis_id}/events (Phase 7A, contract 7a.2). */

export const EVENTS_ROUTE = '/api/v1/analyses/{analysis_id}/events'

export type EventState = 'VISIBLE' | 'NOT_VISIBLE' | 'UNKNOWN'
export type HorizonType = 'GEOMETRIC' | 'TERRAIN'
export type EventBody = 'SUN' | 'EARTH'
export type EventKind = 'RISE' | 'SET' | 'BECOMES_UNKNOWN' | 'RESOLVES_TO_VISIBLE' | 'RESOLVES_TO_NOT_VISIBLE'
export type TrackStatus =
  | 'EVENT_CONFIRMED'
  | 'UNKNOWN_AHEAD'
  | 'NO_EVENT_IN_WINDOW'
  | 'UNKNOWN_AT_REFERENCE'
  | 'INSUFFICIENT_DATA'
  | 'REFERENCE_OUTSIDE_SAMPLES'
export type NotVisibleReason = 'BELOW_GEOMETRIC_HORIZON' | 'TERRAIN_OCCULTED'
export type UnknownReason = 'MISSING_EPHEMERIS' | 'TERRAIN_COVERAGE_INCOMPLETE' | 'TERRAIN_DATA_UNAVAILABLE'
export type ReferenceMode = 'NOW' | 'WINDOW_START' | 'REQUESTED'

export interface EventSample {
  t: string
  state: EventState
  elevation_deg: number | null
  horizon_deg: number | null
  not_visible_reason: NotVisibleReason | null
  unknown_reason: UnknownReason | null
}

export interface EventCountdown {
  earliest_minutes: number
  latest_minutes: number
  may_have_occurred: boolean
}

/** An event is always the bracket (bracket_start_utc, bracket_end_utc] — there is no exact time. */
export interface VisibilityEvent {
  kind: EventKind
  confirmed: boolean
  from_state: EventState
  to_state: EventState
  bracket_start_utc: string
  bracket_end_utc: string
  bracket_minutes: number
  before: EventSample
  after: EventSample
  last_known_before_unknown: EventSample | null
  differs_from_last_known: boolean | null
  unknown_samples_before: number
  elevation_rate_deg_per_hour: number | null
  approx_disc_crossing_hours: number | null
  countdown: EventCountdown | null
  /** RISE/SET in next_* only: UNKNOWN samples lie between the reference and the bracket. */
  unknown_gap_before: boolean | null
}

export interface EventTrack {
  horizon: HorizonType
  status: TrackStatus
  current: EventSample | null
  next_change: VisibilityEvent | null
  next_confirmed_event: VisibilityEvent | null
  next_known: EventSample | null
  no_change_through_utc: string | null
  sample_count: number
  unknown_sample_count: number
  transitions: VisibilityEvent[]
  transitions_truncated: boolean
}

export interface BodyEvents {
  body: EventBody
  nominal_angular_radius_deg: number
  geometric: EventTrack
  terrain: EventTrack | null
}

export interface SiteEvents {
  site_index: number
  label: string
  latitude_deg: number
  longitude_deg: number
  landing_site_id: string | null
  dem_site_id: string | null
  terrain_complete_coverage_fraction: number | null
  sun: BodyEvents
  earth: BodyEvents
}

export interface EventsResponse {
  analysis_id: string
  mission_name: string
  horizon_model: HorizonType
  data_quality: string
  algorithm_version: string
  terrain_engine_version: string | null
  start_utc: string
  end_utc: string
  first_sample_utc: string
  last_sample_utc: string
  time_step_minutes: number
  reference_utc: string
  reference_mode: ReferenceMode
  generated_at_utc: string
  events_contract_version: string
  event_time_semantics: string
  sites: SiteEvents[]
  provenance: { source_id: string; description: string; version: string | null }[]
  limitations: string[]
}
