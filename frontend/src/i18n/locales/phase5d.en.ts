/** Phase 5D strings (Explorer/Scientist modes, guided mission, 3D terrain, LROC). */
const phase5dEn = {
  imageryQuality: {
    sampled: 'Display: {{resolution}} m/px',
    overview: 'Polar overview ready.', starting: 'Preparing the NASA basemap.',
    detailLoading: 'Preparing higher-resolution imagery.', detailReady: 'Viewport detail ready',
    detailFailed: 'Detail could not be acquired. Available overview imagery is retained.',
    outside: 'This viewport is outside loaded imagery. Available coverage is being requested.',
    unavailable: 'No valid imagery is available in this viewport. Retry or return to Polar Overview.',
    fallback: 'Genuine LOLA hillshade is filling areas without loaded photography.',
    nacOption: 'NAC 2 m · optional close-up', 'nac_zoom-in': 'Zoom in to request NAC detail.',
    nac_loading: 'Preparing NAC detail; WAC remains visible.', nac_ready: 'Preliminary NAC mosaic · native 2 m/px. NASA/GSFC/ASU.',
    'nac_no-coverage': 'No NAC coverage here; WAC remains visible.', nac_failed: 'NAC service unavailable; WAC remains visible.', nac_off: '',
  },
  mode: {
    label: 'Interface mode',
    explorer: 'Explorer',
    scientist: 'Scientist',
    explorerHint: 'Explorer Mode: guided, plain-language results first. Same verified data.',
    scientistHint: 'Scientist Mode: all controls, metrics and provenance expanded.',
    advancedHint: 'Same verified numbers. Expand for metrics, charts and scientific limitations.',
    scientificDetails: 'Scientific details',
  },
  home5d: {
    startGuided: 'Start a guided mission',
    tenSecTitle: 'SELENORA in 10 seconds',
    s1: { title: 'Pick two landing sites', body: 'Choose candidate spots near the Moon’s south pole. No coordinates needed.' },
    s2: {
      title: 'See the Sun and Earth over the horizon',
      body: 'Real NASA/JPL positions and NASA LOLA terrain show when each site gets sunlight and a line of sight to Earth.',
    },
    s3: {
      title: 'Know what is certain',
      body: 'Every result separates what the data shows from what is still unknown, and says why a site might not be recommended.',
    },
    modeNote: 'Explorer Mode is on: explanations first, details on demand. Switch to Scientist Mode (top bar) for every control.',
  },
  glossary: {
    aria: 'What does “{{term}}” mean?',
    ephemeris: {
      term: 'ephemeris',
      def: 'A table of where the Sun and Earth appear in the sky at given times. SELENORA requests it from NASA/JPL Horizons for each site.',
    },
    horizon: {
      term: '0° horizon',
      def: 'The flat, geometric horizon of a smooth Moon. Real hills can sit above it and block the view.',
    },
    elevation: {
      term: 'elevation angle',
      def: 'How high an object is above the horizon, in degrees. 0° is the horizon line; negative means below it.',
    },
    azimuth: {
      term: 'azimuth',
      def: 'Compass direction, clockwise from true north (0° north, 90° east, 180° south, 270° west).',
    },
    dem: {
      term: 'LOLA terrain (DEM)',
      def: 'A digital elevation model: a grid of ground heights measured by NASA’s Lunar Orbiter Laser Altimeter. SELENORA uses 5-metre tiles near the south pole.',
    },
    terrainBlocked: {
      term: 'terrain-blocked',
      def: 'The Sun or Earth is above the 0° horizon, but nearby hills or crater walls are higher and hide it.',
    },
    unknown: {
      term: 'UNKNOWN',
      def: 'The data cannot decide for that moment (for example, the terrain map does not reach far enough). Unknown is never counted as visible.',
    },
    partialTerrain: {
      term: 'partial terrain',
      def: 'The 5 m terrain tiles cover only part of the surroundings out to 12 km, so a distant ridge could be missed. SELENORA then refuses to recommend a site.',
    },
    directToEarth: {
      term: 'direct-to-Earth',
      def: 'Earth is above the local horizon, so a straight line of sight exists. That alone does not guarantee a working radio link.',
    },
    joint: {
      term: 'joint visibility',
      def: 'Moments when the Sun AND Earth are both visible: power and direct communication at the same time.',
    },
    score: {
      term: 'mission score',
      def: 'A weighted average of the Sun, Earth and joint visibility percentages. It is a comparison aid, not a NASA safety score.',
    },
    sampledEpoch: {
      term: 'sampled moment',
      def: 'A time at which positions were actually computed (for example every 60 minutes). SELENORA never invents values in between.',
    },
    exaggeration: {
      term: 'vertical exaggeration',
      def: 'Heights are stretched to make relief easier to see. ×1 is true scale. Sight lines are stretched the same way, so what blocks what does not change.',
    },
  },
  guided: {
    eyebrow: 'Explorer Mode · guided',
    title: 'Guided mission',
    description: 'Four short steps to a real analysis computed from NASA/JPL data. No coordinates or formulas needed.',
    stepsAria: 'Guided mission steps',
    step: { objective: 'Objective', sites: 'Sites', date: 'Date', run: 'Run' },
    objectiveQ: 'What matters most for your mission?',
    presetNote: 'These are SELENORA educational presets, not NASA-approved mission profiles. They only change how the same verified results are weighted.',
    objective: {
      sunlight: { title: 'Sunlight', body: 'Solar power and warmth: favour sites where the Sun is above the horizon most often.' },
      earth: { title: 'Direct-to-Earth', body: 'Communication: favour sites with a line of sight to Earth most often.' },
      balanced: { title: 'Balanced', body: 'Weigh sunlight and Earth visibility equally, plus time when both are visible.' },
    },
    sitesQ: 'Choose two research sites to compare',
    sitesNote: 'Tap two cards. Coordinates are approximate reference points from published studies. “5 m terrain” means local NASA LOLA hills can be included.',
    siteNotes: {
      'shackleton-rim-a': 'Literature point on the rim of Shackleton crater. Our 5 m terrain check finds higher ground nearby that can hide the Sun.',
      'connecting-ridge-b': 'Ridge between Shackleton and de Gerlache craters, often cited for long sunlight.',
      'shackleton-floor': 'Floor of Shackleton crater: a contrast case, expected to be dark.',
      'bussey-2010-point-c': 'Literature point on the de Gerlache rim.',
      'bussey-2010-point-d': 'Literature point on the Shackleton ridge, reported among the most illuminated in a 2020 map.',
      'de-gerlache': 'Centre of de Gerlache crater.',
      'malapert-massif': 'Mountain on the Earth-facing side of the south pole.',
      nobile: 'Centre of the large Nobile crater.',
    },
    has5m: '5 m terrain',
    dateQ: 'When should the mission take place?',
    dateMode: {
      example: { title: 'Use a validated example', body: 'Load a stored analysis of these two sites that was already computed from real NASA/JPL data. Instant.' },
      custom: { title: 'Choose my own dates', body: 'Compute a new analysis from live NASA/JPL Horizons data (up to 7 days, hourly). Takes up to a minute.' },
    },
    noExample: 'No stored analysis compares exactly these two sites yet. Choose “my own dates” to compute one.',
    exampleLabel: 'Example: analysis stored {{date}}',
    startDate: 'Start date (UTC)',
    days: 'Days (1–{{max}})',
    includeTerrain: 'Include 5 m terrain',
    terrainHelp:
      'Adds nearby hills from NASA LOLA tiles. Only possible when both sites lie inside the local 5 m tiles. Results may then be PARTIAL, and no site is recommended in that case.',
    terrainAvailable: 'Both sites have 5 m terrain.',
    terrainUnavailable: 'Needs 5 m terrain at both sites.',
    reviewTitle: 'Ready to go',
    reviewExample: 'Stored, validated example',
    reviewCustom: '{{start}} for {{days}} day(s), hourly, {{model}}',
    reviewNote: 'Sun and Earth positions come from NASA/JPL',
    loadExample: 'Show the example results',
    runReal: 'Run real analysis',
    running: 'Computing with NASA/JPL data…',
    back: 'Back',
    next: 'Next',
    missionName: 'Guided: {{a}} vs {{b}}',
    resultsTitle: 'Your mission results',
    resultsDesc: 'Plain-language summary first. Every number below comes from the stored backend analysis.',
    startOver: 'New guided mission',
    sourceHelpLabel: 'Where do these results come from?',
    sourceHelp:
      'Sun and Earth positions: NASA/JPL Horizons, one value per hour. Terrain (if included): NASA LOLA 5 m tiles. Calculations run on the SELENORA server. The text here only explains them.',
    timelineTitle: 'When were the Sun and Earth visible?',
    timelineHelp1: 'Each row is one site. Coloured = visible. Red =',
    timelineHelpStriped: 'Striped =',
    timelineHelp2: 'Grey = below the horizon.',
    openSimulator: 'Watch Sun & Earth move',
    open3d: 'View 3D terrain',
    openDetails: 'Scientific details',
    whatWeKnow: 'What the data shows',
    whatIsUncertain: 'What remains uncertain',
    verdict: {
      recommended: 'Best match for your objective: {{site}}',
      tie: 'No single winner: the sites score the same.',
      refused: 'No site is recommended for this analysis',
      storedWhy: 'It leads by {{margin}} points on SELENORA’s comparison score. That score is a planning aid, not a NASA safety rating.',
      reweightedWhy:
        'It leads by {{margin}} points when the stored percentages are weighted for your objective (same formula as the server). That score is a planning aid, not a safety rating.',
      tieWhy: 'Because the scores are equal, SELENORA does not pick one.',
      refusedWhy: {
        partial_terrain:
          'The 5 m terrain tiles cover only part of each site’s surroundings, so a distant ridge could change the answer. Recommending a site would claim more certainty than the data supports.',
        partial: 'Some NASA/JPL samples are missing, so a ranking would be unreliable.',
        unavailable: 'The required data is unavailable.',
        unscored: 'At least one site could not be scored, so a fair comparison is not possible.',
      },
    },
    established: {
      sun: 'The Sun was above the horizon in {{pct}}% of the moments we could check.',
      earth: 'Earth was above the horizon (direct line of sight) in {{pct}}% of them.',
      joint: 'Both were visible at the same time in {{pct}}%.',
      darkness: 'Longest stretch without sunlight: {{hours}} hours.',
      gap: 'Longest stretch without Earth in view: {{hours}} hours.',
      terrainBlocksSunAll:
        'On a smooth Moon the Sun would be up {{geo}}% of the time here, but nearby terrain is higher and hides it the whole time at this exact spot.',
      terrainReducesSun: 'Nearby terrain reduces sunlight from {{geo}}% (smooth Moon) to {{terrain}}%.',
    },
    uncertain: {
      unknownHours: 'For {{hours}} hours the terrain data could not decide. Those hours are UNKNOWN and are not counted as visible.',
      partialCoverage:
        'The 5 m terrain reaches the full {{km}} km in only {{pct}}% of directions, so a farther ridge could be missed.',
      perEpochDerived:
        'Moment-by-moment terrain states are not yet provided by the server. Some timeline moments are shown as “visible or unknown”.',
      noTerrain: 'Local hills were not included (smooth-Moon horizon). Real terrain could block the Sun or Earth at some moments.',
    },
    general: {
      earthLink: 'Earth above the horizon means a line of sight, not a guaranteed radio link.',
      heuristic: 'SELENORA is a research and education tool, not a certified landing-safety system.',
      synthetic: 'This is SYNTHETIC demo data, not NASA/JPL results.',
      approxCoords: 'Site coordinates are approximate reference points; moving a few hundred metres can change terrain results.',
    },
  },
  sim5d: {
    howTitle: 'How to read this page',
    how1a: 'Each column is the sky above the site. The dashed red line is the',
    how1b: '; the Sun or Earth dot is above it when its number is positive.',
    how2a: 'A green line is the real terrain at that direction. If it is above the dot, the body is',
    how2b: 'even when it is above 0°.',
    how3a: 'Use ▶ or the slider to move between',
    how3b: 'moments. Nothing is drawn between them, so what you see is what NASA/JPL computed.',
  },
  terrain3d: {
    title: '3D terrain & Sun direction',
    description:
      'Real NASA LOLA heights around the selected site, with the Sun and Earth directions for the selected moment. Direction indicators are a visualization, not a lighting simulation.',
    loadHint: 'Loads a NASA LOLA elevation mesh (a few hundred kB) and the 3D engine only when you ask.',
    load: 'Load 3D terrain',
    noEndpoint: 'The server does not provide /maps/mesh, so no 3D terrain is shown.',
    webglMissing: 'Your browser has no WebGL, so the 3D view cannot be shown. All 2D results remain available.',
    notCovered:
      '{{site}} lies outside the local NASA LOLA 5 m tiles. SELENORA does not create artificial terrain, so no 3D view is shown for this site.',
    extent: 'Area',
    extentOption: '{{km}} × {{km}} km · {{step}} m mesh',
    exaggeration: 'Vertical exaggeration',
    trueScale: '×1: true vertical scale.',
    exaggerated: 'Heights ×{{k}} (horizontal true scale). Sight lines are stretched equally, so obstruction relations are unchanged.',
    aria: '3D terrain view around {{site}}',
    loading: 'Loading NASA LOLA mesh…',
    trueNorth: 'True N',
    observer: 'Observer · {{site}}',
    controlsHint: 'Drag: orbit · Right-drag: pan · Wheel/pinch: zoom',
    heightScale: 'Height (LOLA surface)',
    observerZ: 'site {{z}} m',
    resolution: 'Mesh spacing',
    source: 'Source',
    extentShort: 'Extent',
    noData: 'No-data cells',
    heightRef:
      'Point samples of the 5 m DEM. Shown relative to the observer’s eye (+2 m) with the Moon’s curvature removed, the same reference the server uses for horizons.',
    sunTitle: 'Sun at this moment',
    directionNote:
      'The line points to the Sun’s direction from NASA/JPL Horizons (azimuth converted from true north to the map grid). It is a visual indicator: no shadows or illumination are simulated.',
    noSample: 'No per-moment Sun direction is available for this site and time, so no direction line is drawn.',
    liveSource: 'server, this moment',
    notProvided: 'not provided',
    explainBlocked:
      'In the Sun’s direction the terrain rises to {{h}}°, but the Sun is only {{e}}° high, so it is hidden. The highest point along that line is about {{d}} m away.',
    explainClear: 'In the Sun’s direction the terrain rises to {{h}}° and the Sun is at {{e}}°, so it clears the terrain.',
    meshCheck:
      'Visual cross-check from this 3D mesh (within {{r}} m only): terrain reaches {{deg}}° at {{d}} m. The server’s 5 m, 12 km horizon above is authoritative.',
  },
  lroc: {
    label: 'Basemap',
    photo: 'Photo',
    hillshade: 'Hillshade',
    none: 'Off',
    opacity: 'Opacity',
    photoShort: 'Photo: no verified LROC layer yet.',
    photoUnavailable:
      'Photography is unavailable: the server does not yet publish a georeferenced LROC imagery layer. No decorative image is substituted.',
    helpAvailable:
      'Photography: real LROC WAC south-polar mosaic from ASU Lunaserv, warped by the server into SELENORA’s stereographic map. Compare with LOLA hillshade using opacity. Illumination is fixed at image acquisition — not your mission date.',
    helpUnavailable:
      'Hillshade is shaded relief computed from NASA LOLA heights. LROC photography will appear here once the server provides a verified imagery layer.',
    staticShort: 'Static LROC photograph; not illumination at your mission date.',
    staticIllumination:
      'Official LROC WAC South Pole Summer Mosaic (WAC_ROI_SOUTH_SUMMER) — a static summer mosaic. Lighting does not change with the 2026/2027 mission timeline.',
    retry: 'Retry LROC',
    pendingFallback: 'LROC is loading. Genuine NASA LOLA hillshade remains available.',
    failedFallback: 'LROC could not be loaded for this view. Showing available NASA LOLA hillshade / cached overview. Retry or select Hillshade.',
    loading: 'Loading LROC photography for this map window…',
  },
  artemis5e: {
    historical: '2022 historical set (13)',
    current: '2024 Artemis III shortlist (9)',
    note: 'Names and dates only — no polygons. The 2022 list is historical context, not the current landing plan.',
  },
  sim5f: {
    storedTitle: 'Per-epoch directions (stored analysis)',
    storedNote:
      'Authoritative Sun/Earth azimuth, elevation and VISIBLE/BLOCKED/UNKNOWN states from GET /analyses/{id}/epochs — no new Horizons request.',
    authoritativeNote:
      'Terrain and geometric states come from the authoritative /epochs endpoint (VISIBLE / BLOCKED / UNKNOWN). Incomplete DEM coverage stays UNKNOWN; clear sky is never inferred.',
  },
}

export default phase5dEn
