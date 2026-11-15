import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnalyses, useAnalysis } from '@/hooks/useApi'
import { ApiError } from '@/services/apiClient'
import { useMissionStore } from '@/stores/missionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

import ComparisonPage from './ComparisonPage'

vi.mock('@/hooks/useApi', () => ({
  useAnalysis: vi.fn(),
  useTimeline: vi.fn(() => ({ data: undefined, isPending: false, error: null })),
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
    vi.mocked(useAnalysis).mockReturnValue({
      data: undefined, isPending: true, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalysis>)
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
})
