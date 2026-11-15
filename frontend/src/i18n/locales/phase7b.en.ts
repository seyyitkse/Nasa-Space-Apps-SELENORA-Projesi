/** Phase 7B strings (relative solar potential). */
const phase7bEn = {
  solar7b: {
    title: 'Relative solar potential',
    description:
      'How well each panel type would face the Sun at each site over this analysis window. A relative comparison, not a power forecast.',
    notPower:
      'This is illumination geometry, not electrical power. Watts or kWh would need panel hardware and solar irradiance, which are not modelled here.',
    scale: '100% = a panel that always faces the Sun, in unobstructed sunlight for the whole window.',
    loading: 'Loading solar potential…',
    updating: 'Updating for the new panel settings…',
    unavailable: 'This backend does not provide solar potential yet.',
    capabilityUnknown: 'Could not check whether this backend provides solar potential.',
    synthetic: 'Not calculated for the synthetic demo. Solar potential uses JPL Horizons Sun geometry, which the demo does not have.',
    step: 'Samples every {{n}} min',
    site: 'Site',
    horizon: {
      GEOMETRIC: 'Geometric horizon',
      TERRAIN: 'Terrain-aware',
      hint: {
        GEOMETRIC: 'Horizon is the smooth lunar sphere. Terrain shadows are not considered, so real sunlight can be much lower.',
        TERRAIN: 'Uses local NASA LOLA 5 m terrain. Where the terrain data cannot decide, a range is shown instead of one number.',
      },
    },
    panel: {
      HORIZONTAL: 'Horizontal panel',
      FIXED: 'Fixed panel',
      AZIMUTH_TRACKING: 'Azimuth-tracking panel',
      DUAL_AXIS: 'Dual-axis tracking panel',
      hint: {
        HORIZONTAL: 'Lies flat, facing straight up.',
        FIXED: 'One tilt and one compass direction for the whole window.',
        AZIMUTH_TRACKING: 'Turns around a vertical mast to follow the Sun; the tilt stays constant.',
        DUAL_AXIS: 'Always points straight at the Sun. The best any panel can do.',
      },
    },
    config: {
      tilt: 'tilt {{tilt}}°',
      azimuth: 'facing {{azimuth}}° ({{compass}})',
      OPTIMISED_HINDSIGHT_GEOMETRIC: 'direction chosen with hindsight for this window, ignoring terrain',
      REQUESTED: 'direction you set',
    },
    compass: { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SW: 'SW', W: 'W', NW: 'NW' },
    controls: {
      title: 'Panel settings',
      azimuth: 'Fixed panel direction (°)',
      azimuthHelp: 'Clockwise from true north, 0 to 359.9. Leave empty and the best direction per site is chosen with hindsight.',
      azimuthPlaceholder: 'auto',
      tilt: 'Fixed panel tilt (°)',
      trackingTilt: 'Tracking panel tilt (°)',
      tiltHelp: '0 = flat, 90 = upright. Empty = 90.',
      errors: {
        azimuthRange: 'Enter a direction from 0 up to, but not including, 360.',
        tiltRange: 'Enter a tilt from 0 to 90.',
      },
    },
    legend: {
      title: 'Legend',
      known: 'Proven by known samples',
      possible: 'Possible: the data cannot rule it out',
    },
    value: {
      range: 'Range',
      rangeAria: '{{min}} to {{max}}',
      unavailable: 'Not available',
    },
    bar: '{{site}}, {{panel}}: {{value}}',
    unavailableReason: {
      NO_DURATION: 'The analysis window has no duration.',
      NO_EPHEMERIS: 'No Sun position data for this site.',
      NO_KNOWN_VISIBILITY: 'The terrain data cannot decide Sun visibility at any sample, so no terrain-aware value exists.',
      NOT_COMPUTED: 'Not computed for this configuration.',
    },
    panelUnavailable: {
      AZIMUTH_UNDEFINED_AT_POLE: 'A compass direction has no meaning exactly at the pole.',
      NO_SUNLIT_SAMPLE_TO_OPTIMISE_AZIMUTH: 'The Sun never rises in this window, so no best direction can be chosen. Set a direction to see a value.',
    },
    unknownShare: 'Unknown for {{pct}} of the window',
    mostlyUnknown: 'A large part is unknown. Read the range as wide open, not as an estimate.',
    edge: '{{hours}} near a terrain edge counted only in the maximum',
    geometricContext: 'Ignoring terrain (context only): {{value}}',
    compare: {
      DISTINGUISHABLE: '{{site}} is ahead: its minimum is above every other site’s maximum.',
      NOT_DISTINGUISHABLE: 'These sites cannot be ranked: their values overlap or are equal.',
      UNAVAILABLE: 'No ranking: at least one site has no value.',
    },
    layers: {
      title: 'Sunlight availability',
      geometric: 'Sun above the geometric horizon',
      terrain: 'Sun visible over known terrain',
      terrainRange: '{{min}} to {{max}} of the window',
      missing: 'No Sun position data',
      ofWindow: '{{hours}} of {{total}}',
      split: '{{visible}} visible · {{blocked}} behind terrain · {{unknown}} unknown',
      noTerrain: 'Terrain visibility is not part of a geometric analysis.',
    },
    notes: {
      title: 'Assumptions, limits and data sources',
      plain: {
        relative: 'Values compare sites and panel types within this analysis only. They are not hours of power and not energy.',
        unknown: 'Unknown is neither sunlit nor shadowed. It adds nothing to the minimum and everything it could be to the maximum.',
        range: 'A range is not a probability. No value inside it is more likely than another.',
        photo: 'The map photo is a fixed summer mosaic. Sunlight for your dates comes only from the Sun positions, never from the photo.',
      },
      definition: 'Index definition',
      assumptions: 'Assumptions',
      limitations: 'Limitations',
      energy: 'Electrical energy',
      energyMissing: 'Not available. Missing inputs:',
      provenance: 'Data sources',
      api: 'From the API (English)',
    },
  },
}

export default phase7bEn
