import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { api } from '@/services/apiClient'

import { MissionPanel } from './MissionPanel'
import { missionToGlobeMarker, outcomeVisual, type MissionItem } from './types'

const sample: MissionItem = {
  id: 'apollo-11',
  name: 'Apollo 11',
  program: 'APOLLO',
  operator: 'NASA',
  status: 'COMPLETED_SUCCESS',
  landing_outcome: 'SUCCESSFUL_LANDING',
  launch_date: '1969-07-16',
  landing_date: '1969-07-20',
  latitude_deg: 0.67416,
  longitude_deg: 23.47314,
  source_longitude_deg: 23.47314,
  source_longitude_convention: '0-360 east-positive',
  coordinate_frame: 'MOON_ME',
  source_coordinate_system: 'MOON_ME_PA',
  source_frame_label: 'Mean Earth/Polar Axis (ME/PA), DE421',
  coordinate_uncertainty_m: 0.3,
  coordinate_precision_note: 'LM',
  confidence: 'EXACT_VERIFIED',
  approximate_region: false,
  region_representation: 'POINT_LANDING',
  planned_target: null,
  source_url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html',
  lroc_source_url: 'https://lroc.im-ldi.com/images/938',
  source_access_date: '2026-11-15',
  notes: 'First landing',
  longitude_normalized_deg: 23.47314,
  cartesian_me: { x_m: 1, y_m: 1, z_m: 1, radius_m: 1737400, frame: 'MOON_ME_SPHERE_SCIENTIFIC' },
  marker_kind: 'ACTUAL_LANDING',
  south_polar: false,
  explorer_coverage: false,
  terrain_scoring_supported: false,
  not_nasa_landing_recommendation: true,
}

const aborted: MissionItem = {
  ...sample,
  id: 'apollo-13',
  name: 'Apollo 13',
  status: 'ABORTED',
  landing_outcome: 'NO_LANDING_ABORTED',
  landing_date: null,
  latitude_deg: null,
  longitude_deg: null,
  source_longitude_deg: null,
  coordinate_uncertainty_m: null,
  approximate_region: true,
  region_representation: 'NONE',
  confidence: 'APPROXIMATE_REGION',
  source_coordinate_system: 'NONE_NO_TOUCHDOWN',
  planned_target: {
    name: 'Fra Mauro',
    latitude_deg: null,
    longitude_deg: null,
    note: 'Named region only',
    coordinate_system: null,
    coordinate_system_note: null,
  },
  marker_kind: 'LIST_ONLY',
  cartesian_me: null,
  longitude_normalized_deg: null,
}

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: 'en',
      resources: {
        en: {
          translation: {
            common: { retry: 'Retry' },
            missions7e: {
              eyebrow: 'Phase 7E',
              title: 'Lunar Missions',
              lede: 'History layer',
              layer: 'Show on globe',
              loading: 'Loading…',
              error: 'Error',
              unavailable: 'Unavailable',
              listOnly: 'list only',
              plannedRegion: 'region',
              source: 'Source',
              lroc: 'LROC',
              filters: { program: 'Program', outcome: 'Outcome', all: 'All' },
              outcome: {
                successful: 'Successful',
                partial: 'Partial',
                unsuccessful: 'Unsuccessful',
                aborted: 'Aborted',
                planned: 'Planned',
              },
              fields: {
                operator: 'Operator',
                status: 'Status',
                landingOutcome: 'Outcome',
                launch: 'Launch',
                landing: 'Landing',
                actualSite: 'Actual',
                plannedTarget: 'Planned',
                frame: 'Frame',
                uncertainty: 'Uncertainty',
                confidence: 'Confidence',
              },
            },
          },
        },
      },
    })
  }
})

describe('mission marker helpers', () => {
  it('maps verified landings to actual markers and aborts to none', () => {
    expect(missionToGlobeMarker(sample)?.marker_kind).toBe('ACTUAL_LANDING')
    expect(missionToGlobeMarker(aborted)).toBeNull()
    expect(outcomeVisual('NO_LANDING_ABORTED')).toBe('aborted')
    expect(outcomeVisual('PARTIAL_SUCCESS_LANDING')).toBe('partial')
  })

  it('maps planned-target regions without inventing landings', () => {
    const peregrine: MissionItem = {
      ...aborted,
      id: 'peregrine-m1',
      name: 'Peregrine Mission One',
      landing_outcome: 'NO_LANDING_FAILED',
      status: 'UNSUCCESSFUL',
      region_representation: 'FEATURE_CENTROID_APPROXIMATE',
      marker_kind: 'PLANNED_TARGET_REGION',
      planned_target: {
        name: 'Sinus Viscositatis',
        latitude_deg: 35.25,
        longitude_deg: -40.99,
        note: 'centroid',
        coordinate_system: 'IAU_GAZETTEER_PLANETOGRAPHIC',
        coordinate_system_note: 'region only',
      },
    }
    const m = missionToGlobeMarker(peregrine)
    expect(m?.marker_kind).toBe('PLANNED_TARGET_REGION')
    expect(m?.lat).toBe(35.25)
    expect(m?.landing_outcome).toBe('NO_LANDING_FAILED')
  })
})

describe('MissionPanel', () => {
  it('toggles the layer and lists missions from the API', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/openapi.json') {
        return { data: { paths: { '/api/v1/missions': {} } } }
      }
      if (url === '/api/v1/missions') {
        return {
          data: {
            title: 'catalog',
            catalog_version: '1.1.0',
            generated_date: '2026-11-15',
            coordinate_frame: 'MOON_ME',
            coordinate_convention: 'c',
            me_pa_policy: 'ME/PA',
            longitude_convention: 'e',
            sphere_radius_m: 1737400,
            south_polar_threshold_deg: -80,
            disclaimer: 'NOT a NASA recommendation',
            filters: {},
            related_endpoints: {},
            total: 2,
            items: [sample, aborted],
          },
        }
      }
      throw new Error(`unexpected ${url}`)
    })

    const onToggle = vi.fn()
    const onSelect = vi.fn()
    const onMarkers = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MissionPanel enabled={false} selectedId={null} onSelect={onSelect} onToggleLayer={onToggle} onMarkersChange={onMarkers} />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('missions-panel')).toBeInTheDocument()
    await user.click(screen.getByTestId('missions-layer-toggle'))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('shows list when enabled and selects a mission detail', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/openapi.json') return { data: { paths: { '/api/v1/missions': {} } } }
      if (url === '/api/v1/missions') {
        return {
          data: {
            title: 'catalog',
            catalog_version: '1.1.0',
            generated_date: '2026-11-15',
            coordinate_frame: 'MOON_ME',
            coordinate_convention: 'c',
            me_pa_policy: 'ME/PA',
            longitude_convention: 'e',
            sphere_radius_m: 1737400,
            south_polar_threshold_deg: -80,
            disclaimer: 'NOT a NASA recommendation',
            filters: {},
            related_endpoints: {},
            total: 2,
            items: [sample, aborted],
          },
        }
      }
      throw new Error(`unexpected ${url}`)
    })

    const onSelect = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MissionPanel enabled selectedId={null} onSelect={onSelect} onToggleLayer={() => undefined} />
      </QueryClientProvider>,
    )

    expect(await screen.findByTestId('mission-row-apollo-11')).toBeInTheDocument()
    expect(screen.getByTestId('mission-row-apollo-13')).toHaveTextContent(/list only/i)
    await user.click(screen.getByTestId('mission-row-apollo-11'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'apollo-11' }))
  })
})
