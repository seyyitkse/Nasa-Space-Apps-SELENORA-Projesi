import { Compass, FileSearch, Info, SunMoon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { DataQualityBadge } from '@/components/shared/badges'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { siteColor } from '@/components/shared/siteColors'
import { EmptyState, ErrorState } from '@/components/shared/States'
import { SyntheticBanner } from '@/components/shared/SyntheticBanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { AnalysisPicker } from '@/features/analysis-data/AnalysisPicker'
import { StateLanes, StateLegend } from '@/features/analysis-data/StateLanes'
import { STATE_TONE } from '@/features/analysis-data/stateStyle'
import { useCursorIndex, useWorkspaceAnalysis } from '@/features/analysis-data/useWorkspaceAnalysis'
import { ElevationGauge } from '@/features/horizon-sim/ElevationGauge'
import { type BodyDirection, HorizonPanorama } from '@/features/horizon-sim/HorizonPanorama'
import { SimElevationChart } from '@/features/horizon-sim/SimElevationChart'
import { TimeControls } from '@/features/horizon-sim/TimeControls'
import { LunarMap, type MapSite } from '@/features/lunar-explorer/LunarMap'
import { formatCoord, formatPct, formatUtc } from '@/lib/format'
import { observerChunk, useCapabilities, useHorizonProfile, useObserverSeries, useTerrainCatalog } from '@/services/contracts'
import { useWorkspaceStore } from '@/stores/workspaceStore'

function ProvenanceList({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-2 font-mono text-[11px] sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-line bg-bg-2/50 px-2.5 py-2">
          <dt className="text-[10px] text-fg-3">{k}</dt>
          <dd className="mt-0.5 break-words text-fg-2">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function SimulatorPage() {
  const { t } = useTranslation()
  const ws = useWorkspaceAnalysis()
  const siteIndex = useWorkspaceStore((s) => s.siteIndex)
  const setSiteIndex = useWorkspaceStore((s) => s.setSiteIndex)
  const cursorT = useWorkspaceStore((s) => s.cursorT)
  const setCursor = useWorkspaceStore((s) => s.setCursor)
  const caps = useCapabilities()

  const result = ws.result
  const safeIndex = result ? Math.min(siteIndex, result.sites.length - 1) : 0
  const site = result?.sites[safeIndex]
  const epochs = ws.sites[safeIndex]?.epochs ?? []
  const { index, epoch, setIndex } = useCursorIndex(epochs)
  const terrainMode = result?.horizon_model === 'TERRAIN'

  // 360° LOLA horizon profile (Phase 5B) and live per-epoch Sun/Earth directions
  // from JPL Horizons (observer-series, <= 72 h) fetched in 24 h chunks on the
  // analysis's own sample grid. Matched by exact timestamp only, never interpolated.
  const profile = useHorizonProfile(site?.latitude_deg, site?.longitude_deg, caps.has('horizonProfile'))
  const catalog = useTerrainCatalog(caps.has('terrainCatalog'))
  const chunk =
    result && epoch ? observerChunk(epoch.t, Date.parse(result.start_utc), Date.parse(result.end_utc), result.time_step_minutes) : null
  const series = useObserverSeries(
    chunk && site && result
      ? { lat: site.latitude_deg, lon: site.longitude_deg, start: chunk.start, end: chunk.end, step: result.time_step_minutes, terrain: terrainMode }
      : null,
    caps.has('observerSeries'),
  )
  const sample = useMemo(
    () => (epoch ? series.data?.points.find((p) => Date.parse(p.t) === epoch.t) : undefined),
    [series.data, epoch],
  )
  const delta =
    sample && epoch
      ? {
          sun: sample.sun_elevation_deg != null && epoch.sunElevation != null ? Math.abs(sample.sun_elevation_deg - epoch.sunElevation) : null,
          earth: sample.earth_elevation_deg != null && epoch.earthElevation != null ? Math.abs(sample.earth_elevation_deg - epoch.earthElevation) : null,
        }
      : null
  // Stored timeline elevations are rounded to 4 decimals.
  const mismatch = delta !== null && ((delta.sun ?? 0) > 0.001 || (delta.earth ?? 0) > 0.001)

  const bodies: BodyDirection[] = []
  if (sample?.sun_azimuth_deg != null && sample.sun_elevation_deg != null)
    bodies.push({ body: 'sun', azimuthDeg: sample.sun_azimuth_deg, elevationDeg: sample.sun_elevation_deg })
  if (sample?.earth_azimuth_deg != null && sample.earth_elevation_deg != null)
    bodies.push({ body: 'earth', azimuthDeg: sample.earth_azimuth_deg, elevationDeg: sample.earth_elevation_deg })

  const mapSites: MapSite[] = (result?.sites ?? []).map((s, i) => ({
    id: `analysis-${i}`,
    name: s.label,
    latitude_deg: s.latitude_deg,
    longitude_deg: s.longitude_deg,
    kind: 'analysis',
  }))
  const marks = Object.fromEntries(mapSites.map((s, i) => [s.id, String.fromCharCode(65 + i)]))

  if (ws.noAnalyses)
    return (
      <PageTransition>
        <PageHeader title={t('sim.title')} description={t('sim.description')} />
        <EmptyState
          icon={SunMoon}
          title={t('lab.noAnalyses')}
          body={t('lab.noAnalysesBody')}
          actions={
            <Button asChild variant="primary">
              <Link to="/planner">{t('overview.openPlanner')}</Link>
            </Button>
          }
        />
      </PageTransition>
    )

  return (
    <PageTransition>
      <PageHeader
        eyebrow="JPL Horizons · LOLA"
        title={t('sim.title')}
        description={t('sim.description')}
        actions={result && <DataQualityBadge quality={result.data_quality} />}
      />
      <div className="space-y-5">
        <Card>
          <CardContent className="pt-5">
            <AnalysisPicker current={result} />
          </CardContent>
        </Card>

        {ws.error ? (
          <ErrorState error={ws.error} onRetry={ws.refetch} />
        ) : ws.isPending || !result || !site ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        ) : (
          <>
            {result.data_quality === 'SYNTHETIC_DEMO' && <SyntheticBanner />}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: siteColor(safeIndex) }} aria-hidden />
                      {site.label}
                    </CardTitle>
                    <CardDescription className="font-mono text-[11px]">{formatCoord(site.latitude_deg, site.longitude_deg, 3)}</CardDescription>
                  </div>
                  <Badge tone={terrainMode ? 'success' : 'cyan'}>{terrainMode ? t('sim.modeTerrain') : t('sim.modeGeometric')}</Badge>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <ElevationGauge body="sun" epochs={epochs} index={index} terrainMode={terrainMode} terrainHorizonDeg={sample?.sun_terrain_horizon_deg} liveState={sample?.sun_state} />
                    <ElevationGauge body="earth" epochs={epochs} index={index} terrainMode={terrainMode} terrainHorizonDeg={sample?.earth_terrain_horizon_deg} liveState={sample?.earth_state} />
                  </div>
                  {epoch && (
                    <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                      <span className="text-fg-3">{t('sim.jointAt')}</span>
                      <Badge tone={epoch.joint === 'VISIBLE' ? 'violet' : epoch.joint === 'UNKNOWN' ? 'warning' : 'neutral'}>
                        {t(`lab.jointState.${epoch.joint}`)}
                      </Badge>
                    </div>
                  )}
                  <TimeControls epochs={epochs} index={index} onIndex={setIndex} />
                </CardContent>
              </Card>

              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Compass className="size-4 text-cyan" aria-hidden /> {t('sim.panorama')}
                    </CardTitle>
                    <CardDescription>{t('sim.panoramaHint')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {profile.data ? (
                      <>
                        <HorizonPanorama profile={profile.data} bodies={bodies} />
                        {bodies.length === 0 && <p className="mt-2 text-[11px] text-warning">{t('sim.noAzimuth')}</p>}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-fg-3">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-3 rounded-sm bg-[#6EE7B7]/40" /> {t('sim.legendTerrain')}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-3 rounded-sm bg-warning/10 ring-1 ring-warning/30" /> {t('sim.partialRay')}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-3 rounded-sm bg-warning/30" /> {t('lab.state.UNKNOWN')}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[10.5px] text-fg-3">
                          {profile.data.quality_label} · {profile.data.dem_site_id ?? '—'} ·{' '}
                          {t('sim.coverage', { pct: (profile.data.complete_coverage_fraction * 100).toFixed(1) })} ·{' '}
                          {t('sim.maxRange', { km: (profile.data.max_range_m / 1000).toFixed(1) })} · {profile.data.dataset_version}
                        </p>
                      </>
                    ) : profile.isLoading ? (
                      <Skeleton className="h-44" />
                    ) : (
                      <div className="rounded-xl border border-dashed border-line-strong p-4 text-[12.5px] leading-relaxed text-fg-2" role="note">
                        <div className="mb-2 flex items-center gap-2 font-medium text-fg">
                          <FileSearch className="size-4 text-warning" aria-hidden /> {t('sim.panoramaUnavailable')}
                        </div>
                        <p>{profile.error ? profile.error.message : t('sim.panoramaUnavailableBody')}</p>
                        <p className="mt-2 font-mono text-[10.5px] text-fg-3">docs/FRONTEND_DATA_REQUIREMENTS.md · R1, R2</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[14px]">{t('sim.liveTitle')}</CardTitle>
                    <CardDescription>{t('sim.liveNote')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-[12.5px]">
                    {!caps.has('observerSeries') ? (
                      <p className="text-fg-3">{t('sim.liveUnavailable')}</p>
                    ) : !chunk ? (
                      <p className="text-fg-3">{t('sim.liveStepTooFine')}</p>
                    ) : series.isLoading ? (
                      <Skeleton className="h-14" />
                    ) : series.error ? (
                      <ErrorState error={series.error} compact onRetry={() => void series.refetch()} />
                    ) : !sample ? (
                      <p className="text-warning">{t('sim.liveNoMatch')}</p>
                    ) : (
                      <>
                        <dl className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                          <div className="rounded-lg border border-line bg-bg-2/50 p-2">
                            <dt className="text-fg-3">☉ az / el</dt>
                            <dd className="text-fg">
                              {sample.sun_azimuth_deg?.toFixed(2)}° / {sample.sun_elevation_deg?.toFixed(3)}°
                            </dd>
                            {sample.sun_terrain_horizon_deg != null && (
                              <dd className="text-[#6EE7B7]">
                                {t('sim.terrainHorizon')} {sample.sun_terrain_horizon_deg.toFixed(2)}°
                              </dd>
                            )}
                            {sample.sun_state && (
                              <dd>
                                <Badge tone={STATE_TONE[sample.sun_state]}>{t(`lab.state.${sample.sun_state}`)}</Badge>
                              </dd>
                            )}
                          </div>
                          <div className="rounded-lg border border-line bg-bg-2/50 p-2">
                            <dt className="text-fg-3">⊕ az / el</dt>
                            <dd className="text-fg">
                              {sample.earth_azimuth_deg?.toFixed(2)}° / {sample.earth_elevation_deg?.toFixed(3)}°
                            </dd>
                            {sample.earth_terrain_horizon_deg != null && (
                              <dd className="text-[#6EE7B7]">
                                {t('sim.terrainHorizon')} {sample.earth_terrain_horizon_deg.toFixed(2)}°
                              </dd>
                            )}
                            {sample.earth_state && (
                              <dd>
                                <Badge tone={STATE_TONE[sample.earth_state]}>{t(`lab.state.${sample.earth_state}`)}</Badge>
                              </dd>
                            )}
                          </div>
                        </dl>
                        {delta && (
                          <p className={mismatch ? 'text-warning' : 'text-success'}>
                            {mismatch ? t('sim.liveMismatch') : t('sim.liveMatch')}{' '}
                            <span className="font-mono text-[11px] text-fg-3">
                              Δ☉ {delta.sun?.toFixed(4) ?? '—'}° · Δ⊕ {delta.earth?.toFixed(4) ?? '—'}°
                            </span>
                          </p>
                        )}
                        <p className="font-mono text-[10.5px] text-fg-3">
                          {series.data?.data_quality} · {series.data?.attribution.join(' · ').slice(0, 140)}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
                <Card className="overflow-hidden">
                  <div className="relative h-[260px]">
                    <LunarMap
                      sites={mapSites}
                      selectedId={`analysis-${safeIndex}`}
                      layers={{ graticule: true, reference: true, custom: true, labels: true, coverage: true, rasters: {} }}
                      tiles={catalog.data?.tiles ?? []}
                      marks={marks}
                      onSelect={(id) => setSiteIndex(Number(id.replace('analysis-', '')))}
                      ariaLabel={t('sim.mapAria')}
                      focusLat={-88.5}
                    />
                  </div>
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('sim.chartTitle')}</CardTitle>
                <CardDescription>{t('sim.chartHint')}</CardDescription>
              </CardHeader>
              <CardContent>
                <SimElevationChart epochs={epochs} cursorT={epoch?.t ?? null} onIndex={setIndex} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('lab.sharedLanes')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <StateLanes
                  sites={ws.sites}
                  stepMinutes={ws.timeline?.step_minutes ?? result.time_step_minutes}
                  endUtc={result.end_utc}
                  cursorT={epoch?.t ?? cursorT}
                  onCursor={setCursor}
                  focusIndex={safeIndex}
                />
                <StateLegend terrain={terrainMode} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="size-4 text-cyan" aria-hidden /> {t('sim.provenance')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-fg-2 marker:text-fg-3">
                  <li>{t('sim.noInterpolation')}</li>
                  {terrainMode && <li>{t('sim.terrainDerivation')}</li>}
                  {ws.timeline?.downsampled && <li>{t('comparison.downsampled', { n: ws.timeline.step_minutes })}</li>}
                </ul>
                <ProvenanceList
                  items={[
                    [t('sim.pvQuality'), result.data_quality],
                    [t('sim.pvStep'), `${result.time_step_minutes} min (${t('sim.pvShown')} ${ws.timeline?.step_minutes ?? '—'} min)`],
                    [t('sim.pvWindow'), `${formatUtc(result.start_utc)} → ${formatUtc(result.end_utc)}`],
                    [t('sim.pvAlgorithm'), result.algorithm_version],
                    ...result.provenance.map((p): [string, string] => [p.source_id, `${p.version ?? ''} ${p.retrieved_at ? `· ${formatUtc(p.retrieved_at)}` : ''}`.trim() || p.description]),
                    ...(site.terrain
                      ? ([
                          [t('sim.pvDem'), `${site.terrain.dem_site_id ?? '—'} · ${site.terrain.resolution_m ?? '—'} m/px`],
                          [t('sim.pvCoverage'), site.terrain.horizon_coverage_fraction != null ? formatPct(site.terrain.horizon_coverage_fraction * 100) : '—'],
                          [t('sim.pvUnknown'), `☉ ${formatPct((site.terrain.sun_unknown_fraction ?? 0) * 100)} · ⊕ ${formatPct((site.terrain.earth_unknown_fraction ?? 0) * 100)}`],
                        ] as [string, string][])
                      : []),
                  ]}
                />
                {epoch && (
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={STATE_TONE[epoch.sun]}>☉ {t(`lab.state.${epoch.sun}`)}</Badge>
                    <Badge tone={STATE_TONE[epoch.earth]}>⊕ {t(`lab.state.${epoch.earth}`)}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PageTransition>
  )
}
