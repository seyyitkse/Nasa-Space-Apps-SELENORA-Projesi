import { api } from '@/services/apiClient'
import type {
  AnalysisCreate,
  AnalysisStatus,
  DataSourceList,
  DemoAnalysisResponse,
  HealthResponse,
  LandingSiteList,
} from '@/types/api'

export const selenoraApi = {
  health: () => api.get<HealthResponse>('/health').then((r) => r.data),
  sites: () => api.get<LandingSiteList>('/api/v1/sites').then((r) => r.data),
  dataSources: () => api.get<DataSourceList>('/api/v1/data-sources').then((r) => r.data),
  analyses: () => api.get<AnalysisStatus[]>('/api/v1/analyses').then((r) => r.data),
  /** Phase 2 endpoint — currently validates and returns 501 NOT_IMPLEMENTED. */
  createAnalysis: (body: AnalysisCreate) =>
    api.post<AnalysisStatus>('/api/v1/analyses', body).then((r) => r.data),
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
}
