/**
 * Frontend adapters for backend data services (Phase 4 terrain + Phase 5B NASA
 * data services). See docs/FRONTEND_DATA_REQUIREMENTS.md.
 *
 * The UI never assumes a route exists: it reads the live `/openapi.json` and only
 * calls routes the running backend actually exposes. Otherwise views show a
 * labelled UNAVAILABLE state. Fixtures are used only in unit tests.
 */
import { useQuery } from '@tanstack/react-query'

import { api } from '@/services/apiClient'

export const ROUTES = {
  terrainCatalog: '/api/v1/terrain/catalog', // Phase 4
  terrainCoverage: '/api/v1/terrain/coverage', // Phase 4
  horizonProfile: '/api/v1/terrain/horizon-profile', // Phase 5B
  observerSeries: '/api/v1/ephemeris/observer-series', // Phase 5B (live Horizons, ≤ 72 h)
  mapLayers: '/api/v1/maps/layers', // Phase 5B
  mapPreview: '/api/v1/maps/preview', // Phase 5B (PNG + X-SELENORA-Bounds-M)
  mapMesh: '/api/v1/maps/mesh', // Phase 5B (3D, not yet consumed)
  artemisRegions: '/api/v1/artemis/regions', // Phase 5B
  analysisEpochs: '/api/v1/analyses/{analysis_id}/epochs', // still REQUESTED (R1)
} as const

export type RouteKey = keyof typeof ROUTES

/* -------------------------------------------------------------- terrain */

export interface DemTileInfo {
  site_id: string
  file_name: string
  resolution_m: number
  /** [left, bottom, right, top] in south-polar stereographic metres (R = 1737.4 km). */
  bounds_m: [number, number, number, number]
  width: number
  height: number
}

export interface TerrainCatalog {
  available: boolean
  dataset_version: string
  citation: string
  tiles: DemTileInfo[]
}

interface HorizonProfileApi {
  latitude_deg: number
  longitude_deg: number
  quality_label: string
  observer_height_m: number
  observer_z_m?: number
  max_range_m: number
  complete_coverage_fraction: number
  any_data_fraction?: number
  dem_site_id?: string | null
  resolution_m?: number | null
  dataset_version: string
  attribution: string
  bins: {
    azimuth_deg: number
    horizon_elevation_deg: number | null
    has_any_data: boolean
    complete_coverage: boolean
    valid_range_m: number
    distance_to_blocker_m: number | null
  }[]
}

/** Normalised 360° terrain horizon (azimuth clockwise from true north). */
export interface HorizonProfile {
  latitude_deg: number
  longitude_deg: number
  observer_height_m: number
  azimuth_deg: number[]
  /** null where the ray had no DEM data (rendered UNKNOWN, never 0°). */
  horizon_elevation_deg: (number | null)[]
  /** false where the ray did not reach max_range_m (partial: a far ridge could be missed). */
  complete: boolean[]
  max_range_m: number
  complete_coverage_fraction: number
  quality_label: string
  dem_site_id: string | null
  resolution_m: number | null
  dataset_version: string
  citation: string
}

export function normalizeHorizonProfile(p: HorizonProfileApi): HorizonProfile {
  return {
    latitude_deg: p.latitude_deg,
    longitude_deg: p.longitude_deg,
    observer_height_m: p.observer_height_m,
    azimuth_deg: p.bins.map((b) => b.azimuth_deg),
    horizon_elevation_deg: p.bins.map((b) => (b.has_any_data ? b.horizon_elevation_deg : null)),
    complete: p.bins.map((b) => b.complete_coverage),
    max_range_m: p.max_range_m,
    complete_coverage_fraction: p.complete_coverage_fraction,
    quality_label: p.quality_label,
    dem_site_id: p.dem_site_id ?? null,
    resolution_m: p.resolution_m ?? null,
    dataset_version: p.dataset_version,
    citation: p.attribution,
  }
}

/* ------------------------------------------------------- observer series */

export type LiveBodyState = 'VISIBLE' | 'BLOCKED' | 'UNKNOWN'

export interface ObserverPoint {
  t: string
  sun_azimuth_deg: number | null
  sun_elevation_deg: number | null
  earth_azimuth_deg: number | null
  earth_elevation_deg: number | null
  sun_state?: LiveBodyState | null
  earth_state?: LiveBodyState | null
  sun_terrain_horizon_deg?: number | null
  earth_terrain_horizon_deg?: number | null
}

export interface ObserverSeries {
  latitude_deg: number
  longitude_deg: number
  start_utc: string
  end_utc: string
  step_minutes: number
  horizon_mode: 'GEOMETRIC' | 'TERRAIN' | string
  data_quality: string
  terrain_complete_coverage_fraction: number | null
  attribution: string[]
  limitations: string[]
  points: ObserverPoint[]
}

export const OBSERVER_MAX_SPAN_H = 72
export const OBSERVER_MIN_STEP_MIN = 30
const CHUNK_H = 24

/**
 * The 24 h chunk (aligned to the analysis start and sample grid) containing `t`,
 * clipped to the analysis window. Returns null if the analysis step is finer than
 * the endpoint allows — then live directions are not fetched.
 */
export function observerChunk(t: number, startMs: number, endMs: number, stepMin: number) {
  if (stepMin < OBSERVER_MIN_STEP_MIN) return null
  const chunkMs = CHUNK_H * 3_600_000
  const k = Math.max(0, Math.floor((t - startMs) / chunkMs))
  const s = startMs + k * chunkMs
  const e = Math.min(endMs, s + chunkMs)
  if (e <= s) return null
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() }
}

/* ------------------------------------------------------------------ maps */

export type LayerRole = 'SCIENCE_VALIDATED_LOCAL' | 'MAP_VISUALIZATION_ONLY' | 'REFERENCE_DOC' | string

export interface MapLayer {
  id: string
  title: string
  provider: string
  product_page: string
  source_url: string | null
  access_mode: string
  role: LayerRole
  kind: 'elevation' | 'hillshade' | 'slope' | 'psr' | 'imagery' | 'reference' | string
  resolution_m: number | null
  units: string | null
  crs_summary: string
  attribution: string
  notes: string
}

export interface MapLayerList {
  items: MapLayer[]
  scientific_note: string
}

export interface RasterPreview {
  layerId: string
  url: string
  /** Bounds actually rendered by the backend (X-SELENORA-Bounds-M). */
  extent: [number, number, number, number]
  sizePx: string
  role: string
  attribution: string
}

/** Backend cap for preview windows (MAP_SERVICE_ERROR above this). */
export const PREVIEW_MAX_HALF_EXTENT_M = 50_000

export function parseBoundsHeader(v: string | undefined | null): [number, number, number, number] | null {
  if (!v) return null
  const parts = v.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  return parts as [number, number, number, number]
}

export interface ArtemisRegions {
  title: string
  disclaimer: string
  geometry: null
  geometry_status: string
  official_sources: { id: string; url: string }[]
  regions: { id: string; name: string; notes?: string }[]
}

/* ----------------------------------------------------------- capability */

async function fetchOpenApiPaths(): Promise<Set<string>> {
  const r = await api.get<{ paths: Record<string, unknown> }>('/openapi.json')
  return new Set(Object.keys(r.data.paths ?? {}))
}

/** Which routes the running backend actually exposes. */
export function useCapabilities() {
  const q = useQuery({ queryKey: ['openapi-paths'], queryFn: fetchOpenApiPaths, staleTime: 5 * 60_000, retry: 0 })
  const has = (key: RouteKey) => q.data?.has(ROUTES[key]) ?? false
  return { ...q, has }
}

export const contractApi = {
  terrainCatalog: () => api.get<TerrainCatalog>(ROUTES.terrainCatalog).then((r) => r.data),
  horizonProfile: (latitude_deg: number, longitude_deg: number) =>
    api
      .get<HorizonProfileApi>(ROUTES.horizonProfile, { params: { latitude_deg, longitude_deg, n_azimuth: 360 }, timeout: 60_000 })
      .then((r) => normalizeHorizonProfile(r.data)),
  observerSeries: (p: { lat: number; lon: number; start: string; end: string; step: number; terrain: boolean }) =>
    api
      .get<ObserverSeries>(ROUTES.observerSeries, {
        params: {
          latitude_deg: p.lat,
          longitude_deg: p.lon,
          start_utc: p.start,
          end_utc: p.end,
          step_minutes: p.step,
          include_terrain_states: p.terrain,
        },
        timeout: 120_000,
      })
      .then((r) => r.data),
  mapLayers: () => api.get<MapLayerList>(ROUTES.mapLayers).then((r) => r.data),
  mapPreview: async (layerId: string, bounds: [number, number, number, number], maxEdgePx = 768): Promise<RasterPreview> => {
    const [left_m, bottom_m, right_m, top_m] = bounds
    const r = await api.get<Blob>(ROUTES.mapPreview, {
      params: { layer_id: layerId, left_m, bottom_m, right_m, top_m, max_edge_px: maxEdgePx },
      responseType: 'blob',
      timeout: 120_000,
    })
    const extent = parseBoundsHeader(r.headers['x-selenora-bounds-m'] as string | undefined)
    if (!extent) throw new Error('Preview response is missing X-SELENORA-Bounds-M; refusing to place the image.')
    return {
      layerId,
      url: URL.createObjectURL(r.data),
      extent,
      sizePx: String(r.headers['x-selenora-size-px'] ?? ''),
      role: String(r.headers['x-selenora-layer-role'] ?? ''),
      attribution: String(r.headers['x-selenora-attribution'] ?? ''),
    }
  },
  artemisRegions: () => api.get<ArtemisRegions>(ROUTES.artemisRegions).then((r) => r.data),
}

export function useTerrainCatalog(enabled: boolean) {
  return useQuery({ queryKey: ['terrain-catalog'], queryFn: contractApi.terrainCatalog, enabled, staleTime: 10 * 60_000 })
}

export function useMapLayers(enabled: boolean) {
  return useQuery({ queryKey: ['map-layers'], queryFn: contractApi.mapLayers, enabled, staleTime: 10 * 60_000 })
}

export function useArtemisRegions(enabled: boolean) {
  return useQuery({ queryKey: ['artemis-regions'], queryFn: contractApi.artemisRegions, enabled, staleTime: 60 * 60_000 })
}

export function useHorizonProfile(lat: number | undefined, lon: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['horizon-profile', lat, lon],
    queryFn: () => contractApi.horizonProfile(lat!, lon!),
    enabled: enabled && lat !== undefined && lon !== undefined,
    staleTime: 30 * 60_000,
    retry: 0,
  })
}

export function useObserverSeries(
  p: { lat: number; lon: number; start: string; end: string; step: number; terrain: boolean } | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['observer-series', p],
    queryFn: () => contractApi.observerSeries(p!),
    enabled: enabled && p !== null,
    staleTime: 60 * 60_000,
    retry: 0,
  })
}

export function useMapPreview(layerId: string, bounds: [number, number, number, number] | null, enabled: boolean) {
  return useQuery({
    queryKey: ['map-preview', layerId, bounds],
    queryFn: () => contractApi.mapPreview(layerId, bounds!),
    enabled: enabled && bounds !== null,
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
    retry: 0,
  })
}
