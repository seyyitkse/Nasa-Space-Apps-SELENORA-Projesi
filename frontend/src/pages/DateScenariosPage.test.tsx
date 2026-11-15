import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useScenarioComparison } from '@/hooks/useApi'
import type { ScenarioComparisonResult, ScenarioEvidence } from '@/types/api'

import DateScenariosPage from './DateScenariosPage'

vi.mock('@/hooks/useApi', () => ({
  useScenarioComparison: vi.fn(),
  useSites: vi.fn(() => ({ data: { items: [] } })),
}))

const siteResult: ScenarioEvidence['site'] = {
  label: 'Custom ridge 42', latitude_deg: -87.25, longitude_deg: 42.5, landing_site_id: null,
  metrics: {
    sun_visibility_pct: 80, earth_visibility_pct: 60, joint_visibility_pct: 50,
    longest_sunlight_hours: 12, longest_darkness_hours: 4,
    longest_earth_visibility_hours: 8, longest_communication_gap_hours: 6,
    longest_joint_visibility_hours: 5,
  },
  score: 68, rank: 1,
  contributions: [], darkness_windows: [], communication_gaps: [], joint_windows: [],
}

function evidence(id: string, label: string, rank: number, score: number): ScenarioEvidence {
  return {
    scenario_id: id, label,
    start_utc: id === 'dec' ? '2026-12-01T00:00:00Z' : '2027-01-01T00:00:00Z',
    end_utc: id === 'dec' ? '2026-12-15T00:00:00Z' : '2027-01-15T00:00:00Z',
    sample_count: 337, data_quality: 'EPHEMERIS_GEOMETRIC', algorithm_version: 'test-algo',
    site: { ...siteResult, score, rank },
    assumptions: [], limitations: ['Research use only.'],
    provenance: [{ source_id: 'jpl-horizons', description: 'Fixture', retrieved_at: null, version: '1.2' }],
  }
}

function result(): ScenarioComparisonResult {
  return {
    id: 'scenario-comparison-1', name: 'Seasonal comparison', status: 'COMPLETED', cache_status: 'STORED',
    site: { site_id: 'custom-ridge-42', label: 'Custom ridge 42', latitude_deg: -87.25, longitude_deg: 42.5, landing_site_id: null },
    time_step_minutes: 60, horizon_model: 'GEOMETRIC',
    weights: { sun_visibility: 40, earth_visibility: 40, joint_visibility: 20 },
    window_duration_hours: 336,
    scenarios: [evidence('dec', 'December 2026', 1, 68), evidence('jan', 'January 2027', 2, 55)],
    recommended_scenario_id: 'dec', recommendation_available: true,
    recommendation_note: 'Deterministic planning recommendation.', created_at: '2026-11-15T00:00:00Z',
  }
}

function renderResult() {
  const router = createMemoryRouter([
    { path: '/scenarios/:comparisonId', element: <DateScenariosPage /> },
  ], { initialEntries: ['/scenarios/scenario-comparison-1'] })
  return render(<RouterProvider router={router} />)
}

describe('DateScenariosPage results', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useScenarioComparison).mockReturnValue({
      data: result(), isPending: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useScenarioComparison>)
  })

  it('shows independent date evidence and returns to the stable custom site', () => {
    renderResult()
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    expect(screen.getByText('January 2027')).toBeInTheDocument()
    expect(screen.getByText('Deterministic planning lead: December 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Return to selected location/ })).toHaveAttribute(
      'href', '/explorer?site=custom-ridge-42',
    )
  })

  it('surfaces incomplete terrain evidence without a recommendation', () => {
    const incomplete = result()
    incomplete.recommended_scenario_id = null
    incomplete.recommendation_available = false
    incomplete.scenarios[1] = {
      ...incomplete.scenarios[1]!, data_quality: 'LOCAL_TERRAIN_PARTIAL',
      site: { ...incomplete.scenarios[1]!.site, score: null, rank: null },
    }
    vi.mocked(useScenarioComparison).mockReturnValue({
      data: incomplete, isPending: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useScenarioComparison>)
    renderResult()
    expect(screen.getByText('No defensible single recommendation')).toBeInTheDocument()
    expect(screen.getByText(/LOLA terrain coverage is incomplete/)).toBeInTheDocument()
  })
})
