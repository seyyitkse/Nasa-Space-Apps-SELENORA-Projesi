import { useQuery } from '@tanstack/react-query'
import { Box, Info, Loader2, Mountain, TriangleAlert } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HelpTip, Term } from '@/components/shared/Explain'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label, NativeSelect } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/misc'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { type HorizonProfile, nearestBin, type ObserverPoint, useCapabilities, useMapMesh } from '@/services/contracts'
import { selenoraApi } from '@/services/selenoraApi'

import { STATE_TONE } from '../analysis-data/stateStyle'
import { gridBearingDeg, MESH_PRESETS, meshLayerForRequest, meshSourceLabel, OBSERVER_HEIGHT_M, rayProfile, trueNorthGridAzimuthDeg } from './mesh'
import type { BodyDir } from './TerrainScene'

const TerrainScene = lazy(() => import('./TerrainScene'))
const EXAGGERATIONS = [1, 2, 3, 5] as const

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

export interface Terrain3DPanelProps {
  latitude: number
  longitude: number
  siteLabel: string
  /** Live per-epoch observer-series sample (authoritative backend state), if any. */
  sample?: ObserverPoint
  /** 360° horizon profile (for the backend blocker distance), if any. */
  profile?: HorizonProfile
  autoOpen?: boolean
}

export function Terrain3DPanel({ latitude, longitude, siteLabel, sample, profile, autoOpen = false }: Terrain3DPanelProps) {
  const { t } = useTranslation()
  const reduce = useReducedMotion() ?? false
  const caps = useCapabilities()
  const [open, setOpen] = useState(autoOpen)
  const [preset, setPreset] = useState(1)
  const [k, setK] = useState<number>(1)
  const [webgl] = useState(() => (typeof document === 'undefined' ? false : webglAvailable()))

  const coverage = useQuery({
    queryKey: ['terrain-coverage', latitude, longitude],
    queryFn: () => selenoraApi.terrainCoverage(latitude, longitude),
    enabled: open,
    staleTime: 10 * 60_000,
    retry: 0,
  })
  // Phase 7D: local 5 m when covered; otherwise backend auto-selects Product 90 elevation COG.
  const layerId = meshLayerForRequest(coverage.data?.dem_site_id)
  const p = MESH_PRESETS[preset]!
  const mesh = useMapMesh(
    open && coverage.data ? { lat: latitude, lon: longitude, halfExtentM: p.halfExtentM, stepM: p.stepM, layerId } : null,
    caps.has('mapMesh'),
  )

  const gamma = trueNorthGridAzimuthDeg(longitude)
  const surfaceZ = mesh.data?.surface_z_m ?? coverage.data?.surface_z_m ?? null
  const eyeZ = surfaceZ !== null ? surfaceZ + OBSERVER_HEIGHT_M : null
  const meshUnavailable =
    Boolean(coverage.data) &&
    !mesh.isPending &&
    Boolean(mesh.error) &&
    !coverage.data?.covered

  // Memoised: a new array each render would re-mount the 3D labels.
  const bodies: BodyDir[] = useMemo(() => {
    const out: BodyDir[] = []
    if (sample?.sun_azimuth_deg != null && sample.sun_elevation_deg != null)
      out.push({ body: 'sun', azimuthDeg: sample.sun_azimuth_deg, elevationDeg: sample.sun_elevation_deg, label: `☉ ${sample.sun_elevation_deg.toFixed(2)}°` })
    if (sample?.earth_azimuth_deg != null && sample.earth_elevation_deg != null)
      out.push({ body: 'earth', azimuthDeg: sample.earth_azimuth_deg, elevationDeg: sample.earth_elevation_deg, label: `⊕ ${sample.earth_elevation_deg.toFixed(2)}°` })
    return out
  }, [sample?.sun_azimuth_deg, sample?.sun_elevation_deg, sample?.earth_azimuth_deg, sample?.earth_elevation_deg])

  const sunRay = useMemo(() => {
    if (!mesh.data || eyeZ === null || sample?.sun_azimuth_deg == null) return null
    return rayProfile(mesh.data, gridBearingDeg(sample.sun_azimuth_deg, gamma), eyeZ)
  }, [mesh.data, eyeZ, sample?.sun_azimuth_deg, gamma])
  const bin = profile && sample?.sun_azimuth_deg != null ? nearestBin(profile, sample.sun_azimuth_deg) : -1
  const backendBlocker = bin >= 0 ? profile!.blocker_m[bin] : null
  const zMinMax = useMemo(() => {
    if (!mesh.data) return null
    const vals = mesh.data.z_m.flat().filter((v): v is number => v != null)
    const nulls = mesh.data.z_m.flat().length - vals.length
    return { min: Math.min(...vals), max: Math.max(...vals), nulls }
  }, [mesh.data])

  if (!open)
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-relaxed text-fg-2">{t('terrain3d.loadHint')}</p>
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={!caps.has('mapMesh')}>
          <Box /> {t('terrain3d.load')}
        </Button>
      </div>
    )

  if (!caps.has('mapMesh')) return <p className="text-[12.5px] text-fg-3">{t('terrain3d.noEndpoint')}</p>
  if (!webgl)
    return (
      <p role="note" className="flex gap-2 text-[12.5px] text-warning">
        <TriangleAlert className="size-4 shrink-0" aria-hidden /> {t('terrain3d.webglMissing')}
      </p>
    )
  if (coverage.isPending) return <Skeleton className="h-[420px]" />
  if (coverage.error) return <ErrorState error={coverage.error} compact />
  if (meshUnavailable)
    return (
      <div role="note" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.06] p-4 text-[12.5px] text-fg-2">
        <Mountain className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <span>{t('terrain3d.notCovered', { site: siteLabel })}</span>
      </div>
    )

  const sunState = sample?.sun_state ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="t3d-extent">{t('terrain3d.extent')}</Label>
          <NativeSelect id="t3d-extent" value={preset} onChange={(e) => setPreset(Number(e.target.value))} className="w-[220px]">
            {MESH_PRESETS.map((m, i) => (
              <option key={i} value={i}>
                {t('terrain3d.extentOption', { km: (m.halfExtentM * 2) / 1000, step: m.stepM })}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="min-w-[200px] flex-1">
          <Label className="flex items-center gap-1">
            <Term k="exaggeration">{t('terrain3d.exaggeration')}</Term>: ×{k}
          </Label>
          <Slider
            aria-label={t('terrain3d.exaggeration')}
            min={0}
            max={EXAGGERATIONS.length - 1}
            step={1}
            value={[EXAGGERATIONS.indexOf(k as (typeof EXAGGERATIONS)[number])]}
            onValueChange={([v]) => setK(EXAGGERATIONS[v ?? 0] ?? 1)}
          />
          <p className="mt-1 text-[11px] text-fg-3">{k === 1 ? t('terrain3d.trueScale') : t('terrain3d.exaggerated', { k })}</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative h-[360px] overflow-hidden rounded-xl border border-line sm:h-[440px]" aria-label={t('terrain3d.aria', { site: siteLabel })} role="img">
          {mesh.isPending || eyeZ === null ? (
            <div className="grid h-full place-items-center text-[12.5px] text-fg-3" role="status">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {t('terrain3d.loading')}
              </span>
            </div>
          ) : mesh.error ? (
            <div className="p-4">
              <ErrorState error={mesh.error} compact onRetry={() => void mesh.refetch()} />
            </div>
          ) : (
            <Suspense fallback={<Skeleton className="h-full" />}>
              <TerrainScene
                mesh={mesh.data}
                eyeZ={eyeZ}
                exaggeration={k}
                gammaDeg={gamma}
                bodies={bodies}
                northLabel={t('terrain3d.trueNorth')}
                observerLabel={t('terrain3d.observer', { site: siteLabel })}
                reducedMotion={reduce}
              />
            </Suspense>
          )}
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-bg/85 px-2 py-1 text-[10.5px] text-fg-3">{t('terrain3d.controlsHint')}</div>
        </div>

        <aside className="space-y-3 text-[12px]">
          {zMinMax && mesh.data && (
            <div className="rounded-xl border border-line bg-bg-2/50 p-3">
              <div className="sel-eyebrow mb-2 text-[10px]">{t('terrain3d.heightScale')}</div>
              <div className="flex items-stretch gap-2">
                <div className="w-3 rounded-sm bg-gradient-to-t from-[#1b2335] to-[#cfd8e6]" aria-hidden />
                <div className="flex flex-col justify-between font-mono text-[11px] text-fg-2">
                  <span>{zMinMax.max.toFixed(0)} m</span>
                  <span className="text-violet">{t('terrain3d.observerZ', { z: surfaceZ?.toFixed(1) })}</span>
                  <span>{zMinMax.min.toFixed(0)} m</span>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 font-mono text-[10.5px]">
                <dt className="text-fg-3">{t('terrain3d.resolution')}</dt>
                <dd className="text-right text-fg">{mesh.data.step_m} m</dd>
                <dt className="text-fg-3">{t('terrain3d.nativeRes')}</dt>
                <dd className="text-right text-fg">
                  {mesh.data.native_resolution_m != null ? `${mesh.data.native_resolution_m} m` : '—'}
                </dd>
                <dt className="text-fg-3">{t('terrain3d.source')}</dt>
                <dd className="text-right text-fg">{meshSourceLabel(mesh.data)}</dd>
                <dt className="text-fg-3">{t('terrain3d.tier')}</dt>
                <dd className="text-right text-fg">{mesh.data.coverage_tier ?? '—'}</dd>
                <dt className="text-fg-3">{t('terrain3d.extentShort')}</dt>
                <dd className="text-right text-fg">{(mesh.data.half_extent_m * 2) / 1000} km</dd>
                <dt className="text-fg-3">{t('terrain3d.noData')}</dt>
                <dd className={cn('text-right', zMinMax.nulls ? 'text-warning' : 'text-fg')}>{zMinMax.nulls}</dd>
                <dt className="text-fg-3">γ</dt>
                <dd className="text-right text-fg">{gamma.toFixed(1)}°</dd>
              </dl>
              <p className="mt-2 text-[10.5px] leading-relaxed text-fg-3">
                {mesh.data.coverage_tier === 'REMOTE_PGDA90' ? t('terrain3d.heightRefRemote') : t('terrain3d.heightRef')}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-line bg-bg-2/50 p-3">
            <div className="sel-eyebrow mb-2 flex items-center gap-1 text-[10px]">
              {t('terrain3d.sunTitle')} <HelpTip label={t('terrain3d.sunTitle')} text={t('terrain3d.directionNote')} />
            </div>
            {!sample ? (
              <p className="text-fg-3">{t('terrain3d.noSample')}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {sunState ? (
                    <Badge tone={STATE_TONE[sunState]}>☉ {t(`lab.state.${sunState}`)} · {t('terrain3d.liveSource')}</Badge>
                  ) : (
                    <Badge tone="warning">☉ {t('lab.state.UNKNOWN')} · {t('terrain3d.notProvided')}</Badge>
                  )}
                </div>
                {sample.sun_terrain_horizon_deg != null && sample.sun_elevation_deg != null && (
                  <p className="leading-relaxed text-fg-2">
                    {sample.sun_terrain_horizon_deg > sample.sun_elevation_deg
                      ? t('terrain3d.explainBlocked', {
                          h: sample.sun_terrain_horizon_deg.toFixed(2),
                          e: sample.sun_elevation_deg.toFixed(2),
                          d: backendBlocker != null ? backendBlocker.toFixed(0) : '—',
                        })
                      : t('terrain3d.explainClear', { h: sample.sun_terrain_horizon_deg.toFixed(2), e: sample.sun_elevation_deg.toFixed(2) })}
                  </p>
                )}
                {sunRay?.maxDeg != null && (
                  <p className="text-[11px] leading-relaxed text-fg-3">
                    {t('terrain3d.meshCheck', { deg: sunRay.maxDeg.toFixed(2), d: sunRay.atM?.toFixed(0), r: sunRay.rangeM.toFixed(0) })}
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="flex gap-1.5 text-[10.5px] leading-relaxed text-fg-3">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>
              {mesh.data?.attribution ?? coverage.data.citation} · {mesh.data?.warning}
            </span>
          </p>
        </aside>
      </div>
    </div>
  )
}
