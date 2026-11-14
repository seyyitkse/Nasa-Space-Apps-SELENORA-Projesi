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
  mapMesh: '/api/v1/maps/mesh', // Phase 5B / 5E schema
  artemisRegions: '/api/v1/artemis/regions', // Phase 5B / 5E provenance
  analysisEpochs: '/api/v1/analyses/{analysis_id}/epochs', // Phase 5E R1
  imagerySources: '/api/v1/maps/imagery/sources', // Phase 5E allow-list
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
  /** Distance (m) to the terrain point that sets the horizon in each bin (null if none). */
  blocker_m: (number | null)[]
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
    blocker_m: p.bins.map((b) => (b.has_any_data ? b.distance_to_blocker_m : null)),
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
  blob: Blob
  /** Stable slot for a startup overview or a viewport image of the same layer. */
  renderKey?: string
  renderOrder?: number
  /** Bounds actually rendered by the backend (X-SELENORA-Bounds-M). */
  extent: [number, number, number, number]
  sizePx: string
  /** Actual decoded PNG dimensions; OpenLayers reads the native image geometry. */
  imageSize?: [number, number]
  role: string
  attribution: string
  cacheStatus?: string
  requestMs?: number
  cacheKey?: string
}

export function parseSizePxHeader(v: string | undefined | null): [number, number] | undefined {
  if (!v) return undefined
  const m = /^(\d+)x(\d+)$/i.exec(v.trim())
  if (!m) return undefined
  const w = Number(m[1])
  const h = Number(m[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return undefined
  return [w, h]
}

/** Read width/height from PNG IHDR when response headers are unavailable. */
export async function readPngSize(blob: Blob): Promise<[number, number] | undefined> {
  const buf = new Uint8Array(await blob.slice(0, 24).arrayBuffer())
  // 8-byte signature + IHDR length(4) + 'IHDR'(4) + width(4) + height(4)
  if (buf.length < 24) return undefined
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return undefined
  const w = (buf[16]! << 24) | (buf[17]! << 16) | (buf[18]! << 8) | buf[19]!
  const h = (buf[20]! << 24) | (buf[21]! << 16) | (buf[22]! << 8) | buf[23]!
  if (w < 1 || h < 1) return undefined
  return [w, h]
}

/** Backend cap for preview windows (MAP_SERVICE_ERROR above this). Phase 5F raised to 400 km for polar overview. */
export const PREVIEW_PROCESSING_VERSION = 'phase5f1-polar-direct-v1'
export const PREVIEW_MAX_HALF_EXTENT_M = 400_000
/** Snap preview BBOX edges to this grid (metres) so React Query keys stay stable while panning. */
export const PREVIEW_BOUNDS_SNAP_M = 2_000

export function parseBoundsHeader(v: string | undefined | null): [number, number, number, number] | null {
  if (!v) return null
  const parts = v.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  if (parts[2]! <= parts[0]! || parts[3]! <= parts[1]!) return null
  return parts as [number, number, number, number]
}

export interface MeshResponse {
  layer_id: string
  role: string
  kind?: string
  crs_summary: string
  crs_proj4?: string
  attribution: string
  source_url?: string | null
  access_mode?: string
  origin_lonlat_deg?: [number, number]
  origin_stereo_m: [number, number]
  extent_m?: { left: number; bottom: number; right: number; top: number }
  grid?: { nx: number; ny: number; n_cells: number }
  x_m: number[]
  y_m: number[]
  z_m: (number | null)[][]
  nodata_mask?: boolean[][]
  nodata_fraction?: number
  elevation_units?: string
  reference_elevation_m?: number | null
  z_min_m?: number | null
  z_max_m?: number | null
  sampling_resolution_m?: number
  step_m: number
  half_extent_m: number
  warning: string
}

/** Authoritative per-epoch states from GET /analyses/{id}/epochs (Phase 5E). */
export type AuthoritativeBodyState = 'VISIBLE' | 'BLOCKED' | 'UNKNOWN'
export type AuthoritativeJointState = 'VISIBLE' | 'NOT_VISIBLE' | 'UNKNOWN'

export interface AuthoritativeEpochSample {
  t: string
  sun_azimuth_deg: number | null
  sun_elevation_deg: number | null
  earth_azimuth_deg: number | null
  earth_elevation_deg: number | null
  sun_state: AuthoritativeBodyState
  earth_state: AuthoritativeBodyState
  joint_state: AuthoritativeJointState
  sun_terrain_horizon_deg?: number | null
  earth_terrain_horizon_deg?: number | null
  sun_geometric_state?: AuthoritativeBodyState | null
  earth_geometric_state?: AuthoritativeBodyState | null
  hold_hours: number
  contributes_duration: boolean
}

export interface AuthoritativeSiteEpochs {
  label: string
  latitude_deg: number
  longitude_deg: number
  landing_site_id?: string | null
  dem_site_id?: string | null
  terrain_complete_coverage_fraction?: number | null
  true_north_grid_azimuth_deg?: number | null
  samples: AuthoritativeEpochSample[]
}

export interface EpochsResponse {
  analysis_id: string
  mission_name: string
  horizon_model: string
  data_quality: string
  algorithm_version: string
  start_utc: string
  end_utc: string
  time_step_minutes: number
  sample_count_per_site: number
  duration_semantics: string
  sites: AuthoritativeSiteEpochs[]
  provenance: { source_id: string; description: string; version?: string | null }[]
  limitations: string[]
}

export interface ImagerySource {
  layer_id: string
  title: string
  provider: string
  protocol: string
  endpoint: string
  remote_layer_name: string | null
  crs_native: string
  tile_format: string
  attribution: string
  product_page: string
  alignment_status: string
  preview_enabled: boolean
  notes: string
  polar_coverage: string
}

/** Index of the horizon-profile bin nearest to a true azimuth (bins are evenly spaced from 0°). */
export function nearestBin(p: Pick<HorizonProfile, 'azimuth_deg'>, azDeg: number): number {
  const n = p.azimuth_deg.length
  if (n === 0) return -1
  const step = 360 / n
  return ((Math.round((((azDeg % 360) + 360) % 360) / step) % n) + n) % n
}

export interface ArtemisRegionMeta {
  id: string
  name: string
  notes?: string
  classification?: string
  source_date?: string
  polygon?: null
}

export interface ArtemisRegions {
  title: string
  disclaimer: string
  geometry: null
  geometry_status: string
  official_sources: { id: string; url: string }[]
  regions: ArtemisRegionMeta[]
  historical_2022_regions?: ArtemisRegionMeta[]
  current_2024_shortlist?: ArtemisRegionMeta[]
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
  mapPreview: async (layerId: string, bounds: [number, number, number, number], maxEdgePx = 768, signal?: AbortSignal): Promise<RasterPreview> => {
    const started = performance.now()
    const [left_m, bottom_m, right_m, top_m] = bounds
    // Coarser max_edge for very wide polar windows keeps payload bounded.
    const span = Math.max(right_m - left_m, top_m - bottom_m)
    const edge = span > 200_000 ? Math.min(maxEdgePx, 512) : maxEdgePx
    const r = await api.get<Blob>(ROUTES.mapPreview, {
      params: { layer_id: layerId, left_m, bottom_m, right_m, top_m, max_edge_px: edge, preview_version: PREVIEW_PROCESSING_VERSION },
      responseType: 'blob',
      signal,
      timeout: 90_000,
    })
    if (!(r.data instanceof Blob) || r.data.size < 32 || !String(r.headers['content-type'] ?? r.data.type).includes('image')) {
      throw new Error('Preview response was not an image PNG.')
    }
    // Only direct LROC is guaranteed to return the full requested BBOX. A local
    // raster may be clipped; never stretch a clipped image over the requested window.
    const extent = parseBoundsHeader(r.headers['x-selenora-bounds-m'] as string | undefined)
      ?? (layerId === 'lroc-wac-south-summer' ? bounds : null)
    if (!extent) throw new Error('Raster geographic placement headers are missing or invalid.')
    const crs = r.headers['x-selenora-crs'] as string | undefined
    if (crs && crs !== 'IAU2000:30120') throw new Error('Raster CRS does not match the lunar map.')
    const sizePx = String(r.headers['x-selenora-size-px'] ?? '')
    let imageSize = parseSizePxHeader(sizePx)
    if (!imageSize) {
      // Decode PNG IHDR when the Size-Px header is stripped by a proxy.
      imageSize = await readPngSize(r.data)
    }
    return {
      layerId,
      blob: r.data,
      requestMs: performance.now() - started,
      extent,
      sizePx: sizePx || (imageSize ? `${imageSize[0]}x${imageSize[1]}` : ''),
      imageSize,
      role: String(r.headers['x-selenora-layer-role'] ?? ''),
      attribution: String(r.headers['x-selenora-attribution'] ?? ''),
      cacheStatus: String(r.headers['x-selenora-cache'] ?? ''),
      cacheKey: String(r.headers['x-selenora-cache-key'] ?? ''),
    }
  },
  artemisRegions: () => api.get<ArtemisRegions>(ROUTES.artemisRegions).then((r) => r.data),
  mapMesh: (p: { lat: number; lon: number; halfExtentM: number; stepM: number; layerId: string }) =>
    api
      .get<MeshResponse>(ROUTES.mapMesh, {
        params: { latitude_deg: p.lat, longitude_deg: p.lon, half_extent_m: p.halfExtentM, step_m: p.stepM, layer_id: p.layerId },
        timeout: 120_000,
      })
      .then((r) => r.data),
  analysisEpochs: (analysisId: string) =>
    api.get<EpochsResponse>(`/api/v1/analyses/${analysisId}/epochs`, { timeout: 60_000 }).then((r) => r.data),
  imagerySources: () =>
    api.get<{ items: ImagerySource[]; scientific_note: string }>(ROUTES.imagerySources).then((r) => r.data),
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
    queryFn: ({ signal }) => contractApi.mapPreview(layerId, bounds!, 768, signal),
    enabled: enabled && bounds !== null,
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
    retry: 0,
  })
}

export function useMapMesh(p: { lat: number; lon: number; halfExtentM: number; stepM: number; layerId: string } | null, enabled: boolean) {
  return useQuery({
    queryKey: ['map-mesh', p],
    queryFn: () => contractApi.mapMesh(p!),
    enabled: enabled && p !== null,
    staleTime: 30 * 60_000,
    retry: 0,
  })
}

export function useAnalysisEpochs(analysisId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['analysis-epochs', analysisId],
    queryFn: () => contractApi.analysisEpochs(analysisId!),
    enabled: enabled && Boolean(analysisId),
    staleTime: 5 * 60_000,
    retry: 0,
  })
}

export function useImagerySources(enabled: boolean) {
  return useQuery({
    queryKey: ['imagery-sources'],
    queryFn: contractApi.imagerySources,
    enabled,
    staleTime: 30 * 60_000,
    retry: 0,
  })
}
