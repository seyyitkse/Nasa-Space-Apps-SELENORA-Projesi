/** Phase 7E — Lunar Missions layer (global 3D Moon). */
const phase7eEn = {
  missions7e: {
    eyebrow: 'Phase 7E · History',
    title: 'Lunar Missions',
    lede: 'Optional Apollo and CLPS history layer on the global 3D Moon. Verified coordinates only — not research-site scoring.',
    layer: 'Show on globe',
    loading: 'Loading mission catalog…',
    error: 'Could not load the mission catalog.',
    unavailable: 'This backend does not expose the lunar missions catalog yet.',
    listOnly: 'list only (no pin)',
    plannedRegion: 'planned/failed target region',
    source: 'NASA / primary source',
    lroc: 'LROC imagery',
    filters: {
      program: 'Program filter',
      outcome: 'Outcome filter',
      all: 'All',
    },
    outcome: {
      successful: 'Successful',
      partial: 'Partial',
      unsuccessful: 'Unsuccessful',
      aborted: 'Aborted',
      planned: 'Planned',
    },
    fields: {
      operator: 'Operator',
      status: 'Mission status',
      landingOutcome: 'Landing outcome',
      launch: 'Launch',
      landing: 'Landing',
      actualSite: 'Actual landing',
      plannedTarget: 'Planned target',
      frame: 'Source frame',
      uncertainty: 'Coordinate uncertainty',
      confidence: 'Confidence',
    },
  },
}

export default phase7eEn
