import { api } from '@/services/apiClient'
import type {
  AnalysisCreate,
  AnalysisResult,
  AnalysisStatus,
  DataSourceList,
  DemoAnalysisResponse,
  HealthResponse,
  LandingSiteList,
  TimelineResponse,
} from '@/types/api'

export const selenoraApi = {
  health: () => api.get<HealthResponse>('/health').then((r) => r.data),
  sites: () => api.get<LandingSiteList>('/api/v1/sites').then((r) => r.data),
  dataSources: () => api.get<DataSourceList>('/api/v1/data-sources').then((r) => r.data),
  analyses: () => api.get<AnalysisStatus[]>('/api/v1/analyses').then((r) => r.data),
  /** Real JPL Horizons analysis — may take tens of seconds for multi-day windows. */
  createAnalysis: (body: AnalysisCreate) =>
    api
      .post<AnalysisStatus>('/api/v1/analyses', body, { timeout: 180_000 })
      .then((r) => r.data),
  getAnalysis: (id: string) =>
    api.get<AnalysisResult>(`/api/v1/analyses/${id}`).then((r) => r.data),
  getTimeline: (id: string) =>
    api.get<TimelineResponse>(`/api/v1/analyses/${id}/timeline`).then((r) => r.data),
  /** Deterministic pipeline on SYNTHETIC_DEMO data (clearly labelled, not real ephemeris). */
  syntheticAnalysis: (body: AnalysisCreate) =>
    api
      .post<DemoAnalysisResponse>('/api/v1/demo/synthetic-analysis', body, { timeout: 60_000 })
      .then((r) => r.data),
}

export const queryKeys = {
  health: ['health'] as const,
  sites: ['sites'] as const,
  dataSources: ['data-sources'] as const,
  analyses: ['analyses'] as const,
  analysis: (id: string) => ['analysis', id] as const,
  timeline: (id: string) => ['timeline', id] as const,
}
