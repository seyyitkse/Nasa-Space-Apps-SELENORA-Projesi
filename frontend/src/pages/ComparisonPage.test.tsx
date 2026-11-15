import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnalyses, useAnalysis, useTimeline } from '@/hooks/useApi'
import { ApiError } from '@/services/apiClient'
import { useMissionStore } from '@/stores/missionStore'
import { useModeStore } from '@/stores/modeStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

import ComparisonPage from './ComparisonPage'

vi.mock('@/hooks/useApi', () => ({
  useAnalysis: vi.fn(),
  useTimeline: vi.fn(),
  useAnalyses: vi.fn(() => ({ data: [], isPending: false, error: null })),
}))
vi.mock('@/services/contracts', () => ({
  useCapabilities: vi.fn(() => ({ has: () => false })),
  useAnalysisEpochs: vi.fn(() => ({ data: undefined, isPending: false, error: null })),
}))
vi.mock('@/features/mission-planner/usePlannerInput', () => ({
  usePlannerInput: vi.fn(() => ({ referenceLoaded: false })),
}))
vi.mock('@/features/mission-planner/useSyntheticDemo', () => ({
  useSyntheticDemo: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
}))
vi.mock('@/features/solar-potential/SolarPotentialPanel', () => ({
  SolarPotentialPanel: ({ analysisId }: { analysisId?: string }) => (
    <section data-testid="solar-panel-review">{analysisId}</section>
  ),
}))

function renderComparison(path = '/comparison') {
  const router = createMemoryRouter([
    { path: '/comparison', element: <ComparisonPage /> },
    { path: '/comparison/:analysisId', element: <ComparisonPage /> },
  ], {
    initialEntries: [path],
  })
  return render(<RouterProvider router={router} />)
}

describe('Comparison analysis selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkspaceStore.setState({ analysisId: 'saved-analysis-123' })
    useMissionStore.setState({ demo: null })
    useModeStore.setState({ mode: 'explorer' })
    vi.mocked(useAnalysis).mockReturnValue({
      data: undefined, isPending: true, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalysis>)
    vi.mocked(useTimeline).mockReturnValue({
      data: undefined, isPending: false, error: null,
    } as unknown as ReturnType<typeof useTimeline>)
  })

  it('loads the active saved workspace analysis on the unparameterized route', () => {
    renderComparison()
    expect(useAnalysis).toHaveBeenCalledWith('saved-analysis-123')
    expect(screen.getByText('Loading stored analysis…')).toBeInTheDocument()
    expect(screen.queryByText('No analysis results yet')).not.toBeInTheDocument()
  })

  it('gives an explicit route ID priority over the workspace selection', () => {
    renderComparison('/comparison/route-analysis-456')
    expect(useAnalysis).toHaveBeenCalledWith('route-analysis-456')
  })

  it('opens synthetic preview only when it is explicitly requested', () => {
    renderComparison('/comparison?source=demo')
    expect(useAnalysis).not.toHaveBeenCalled()
    expect(screen.getByText('No analysis results yet')).toBeInTheDocument()
  })

  it('reports a stale saved ID without substituting synthetic results', () => {
    vi.mocked(useAnalysis).mockReturnValue({
      data: undefined,
      isPending: false,
      error: new ApiError({ message: 'Not found', status: 404, code: 'NOT_FOUND' }),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalysis>)
    vi.mocked(useAnalyses).mockReturnValue({
      data: [], isPending: false, error: null,
    } as unknown as ReturnType<typeof useAnalyses>)

    renderComparison()

    expect(screen.getByRole('alert')).toHaveTextContent('Saved analysis is no longer available')
    expect(screen.getByRole('alert')).toHaveTextContent('No synthetic result has been substituted.')
    expect(screen.getByRole('alert')).toHaveTextContent('saved-analysis-123')
    expect(screen.queryByText('SYNTHETIC_DEMO')).not.toBeInTheDocument()
  })

  it('keeps the Phase 7B result visible while Explorer scientific details stay collapsed', () => {
    const site = (label: string) => ({
      label,
      latitude_deg: -89.68,
      longitude_deg: -166,
      landing_site_id: null,
      metrics: {
        sun_visibility_pct: 80,
        earth_visibility_pct: 50,
        joint_visibility_pct: 40,
        longest_sunlight_hours: 10,
        longest_darkness_hours: 2,
        longest_earth_visibility_hours: 8,
        longest_communication_gap_hours: 4,
        longest_joint_visibility_hours: 3,
      },
      score: 60,
      rank: 1,
      contributions: [],
      darkness_windows: [],
      communication_gaps: [],
      joint_windows: [],
    })
    vi.mocked(useAnalysis).mockReturnValue({
      data: {
        id: 'real-analysis',
        mission_name: 'Real analysis',
        status: 'COMPLETED',
        data_quality: 'EPHEMERIS_GEOMETRIC',
        algorithm_version: 'test',
        start_utc: '2026-12-01T00:00:00Z',
        end_utc: '2026-12-02T00:00:00Z',
        time_step_minutes: 60,
        horizon_model: 'GEOMETRIC',
        weights: { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 },
        sites: [site('A'), site('B')],
        recommended_site_label: null,
        assumptions: [],
        limitations: [],
        provenance: [],
        created_at: '2026-11-15T00:00:00Z',
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalysis>)
    vi.mocked(useTimeline).mockReturnValue({
      data: {
        analysis_id: 'real-analysis',
        data_quality: 'EPHEMERIS_GEOMETRIC',
        downsampled: false,
        step_minutes: 60,
        sites: [
          { label: 'A', points: [] },
          { label: 'B', points: [] },
        ],
      },
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useTimeline>)

    renderComparison('/comparison/real-analysis')

    expect(screen.getByTestId('solar-panel-review')).toHaveTextContent('real-analysis')
    expect(screen.getByRole('button', { name: /Scientific details/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
