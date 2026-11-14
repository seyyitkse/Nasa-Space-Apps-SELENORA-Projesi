/**
 * Component tests for Phase 5A interactions. All data here are deterministic
 * test fixtures — never live NASA results.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders, makeQueryClient } from '@/app/providers'
import { useWorkspaceStore } from '@/stores/workspaceStore'

import type { EpochState } from './analysis-data/adapter'
import { StateLanes } from './analysis-data/StateLanes'
import { HorizonPanorama, profileRuns } from './horizon-sim/HorizonPanorama'
import { TimeControls } from './horizon-sim/TimeControls'
import { LayerDock } from './lunar-explorer/LayerDock'
import { DEFAULT_LAYERS } from './lunar-explorer/LunarMap'

const H = 3_600_000
const T0 = Date.UTC(2026, 11, 1)
const epoch = (i: number, sun: EpochState['sun']): EpochState => ({
  t: T0 + i * H,
  iso: new Date(T0 + i * H).toISOString(),
  sunElevation: sun === 'UNKNOWN' ? null : 1,
  earthElevation: -1,
  sun,
  earth: 'BELOW_HORIZON',
  sunGeometric: sun === 'UNKNOWN' ? 'UNKNOWN' : 'VISIBLE',
  earthGeometric: 'BELOW_HORIZON',
  joint: sun === 'UNKNOWN' ? 'UNKNOWN' : 'NOT_VISIBLE',
})
const epochs = [epoch(0, 'VISIBLE'), epoch(1, 'BLOCKED'), epoch(2, 'UNKNOWN'), epoch(3, 'UNRESOLVED')]

function wrap(ui: React.ReactNode) {
  return render(<AppProviders client={makeQueryClient()}>{ui}</AppProviders>)
}

describe('StateLanes', () => {
  it('renders BLOCKED, UNKNOWN and UNRESOLVED distinctly (never as visible)', () => {
    const { container } = wrap(
      <StateLanes sites={[{ label: 'A', index: 0, epochs }]} bodies={['sun']} stepMinutes={60} endUtc={new Date(T0 + 4 * H).toISOString()} cursorT={null} />,
    )
    const fills = [...container.querySelectorAll('svg rect')].map((r) => r.getAttribute('fill'))
    expect(fills).toContain('#F5C674') // visible Sun
    expect(fills).toContain('rgba(248,113,113,0.55)') // terrain-blocked
    expect(fills).toContain('url(#sel-unknown-hatch)')
    expect(fills).toContain('url(#sel-unresolved-hatch)')
  })

  it('moves the shared cursor between sampled epochs with the keyboard', () => {
    const onCursor = vi.fn()
    wrap(
      <StateLanes sites={[{ label: 'A', index: 0, epochs }]} stepMinutes={60} endUtc={new Date(T0 + 4 * H).toISOString()} cursorT={T0 + H} onCursor={onCursor} />,
    )
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onCursor).toHaveBeenCalledWith(T0 + 2 * H)
  })
})

describe('TimeControls', () => {
  it('steps through samples and never beyond the last one', () => {
    useWorkspaceStore.setState({ playing: false })
    const onIndex = vi.fn()
    wrap(<TimeControls epochs={epochs} index={3} onIndex={onIndex} />)
    expect(screen.getByRole('button', { name: 'Next sample' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous sample' }))
    expect(onIndex).toHaveBeenCalledWith(2)
    expect(screen.getByText('Sample 4 of 4')).toBeInTheDocument()
  })
})

describe('LayerDock', () => {
  const layer = (id: string, kind: string, role: string, access = 'vsicurl_window') => ({
    id, title: id, provider: 'NASA PGDA', product_page: 'https://pgda.gsfc.nasa.gov/products/90', source_url: null,
    access_mode: access, role, kind, resolution_m: 80, units: null, crs_summary: 'stere', attribution: 'fixture', notes: '',
  })
  it('enables only catalogued renderable layers and marks missing kinds unavailable', () => {
    wrap(
      <LayerDock
        layers={DEFAULT_LAYERS}
        onChange={() => undefined}
        catalog={{ available: true, dataset_version: 'v', citation: 'c', tiles: [{ site_id: 'Site04', file_name: 'f', resolution_m: 5, bounds_m: [-9000, -15000, 7000, 1000], width: 3200, height: 3200 }] }}
        catalogLoading={false}
        mapLayers={[layer('hill', 'hillshade', 'MAP_VISUALIZATION_ONLY'), layer('trek', 'imagery', 'REFERENCE_DOC', 'documentation_only')]}
        mapLayersLoading={false}
        previewStatus={{}}
        onFitPolar={() => undefined}
        onFitTiles={() => undefined}
      />,
    )
    expect(screen.getByRole('switch', { name: 'hill' })).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Permanently shadowed regions' })).toBeDisabled()
    // imagery exists only as a REFERENCE_DOC link -> the basemap switch stays unavailable
    expect(screen.getByRole('switch', { name: 'Lunar image basemap' })).toBeDisabled()
    expect(screen.getByRole('link', { name: /trek/ })).toHaveAttribute('href', 'https://pgda.gsfc.nasa.gov/products/90')
    expect(screen.getByRole('switch', { name: 'Local LOLA terrain coverage (1 tiles)' })).toBeEnabled()
  })
})

describe('HorizonPanorama', () => {
  it('breaks the terrain silhouette at incomplete (null) azimuths instead of drawing 0°', () => {
    expect(profileRuns([0, 1, 2, 3, 4], [1, 2, null, 3, 4]).map((r) => r.length)).toEqual([2, 2])
    const { container } = wrap(
      <HorizonPanorama
        profile={{ latitude_deg: -89.68, longitude_deg: -166, observer_height_m: 2, azimuth_deg: [0, 90, 180, 270], horizon_elevation_deg: [1, null, 2, 1.5], complete: [true, false, false, true], max_range_m: 12000, complete_coverage_fraction: 0.5, quality_label: 'LOCAL_TERRAIN_PARTIAL', dem_site_id: 'Site04', resolution_m: 5, dataset_version: 'fixture', citation: 'fixture' }}
        bodies={[{ body: 'sun', azimuthDeg: 86, elevationDeg: 1.49 }]}
      />,
    )
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })
})
