import { Crosshair, ExternalLink, Flag, Info } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { MissionTimelineDock } from '@/features/analysis-data/MissionTimelineDock'
import { CoordinateForm, SiteList } from '@/features/lunar-explorer/ExplorerPanels'
import { BasemapControl, type BasemapChoice, pickBasemapLayers } from '@/features/lunar-explorer/BasemapControl'
import { LayerDock } from '@/features/lunar-explorer/LayerDock'
import {
  DEFAULT_LAYERS,
  LunarMap,
  type LunarMapHandle,
  type MapLayers,
  type MapSite,
  tilesExtent,
} from '@/features/lunar-explorer/LunarMap'
import { isInMapRegion, lonLatToXY } from '@/features/lunar-explorer/projection'
import { type DetailTarget, SiteInspector } from '@/features/lunar-explorer/SiteInspector'
import { useSites } from '@/hooks/useApi'
import { formatCoord } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PREVIEW_BOUNDS_SNAP_M,
  PREVIEW_MAX_HALF_EXTENT_M,
  useArtemisRegions,
  useCapabilities,
  useMapLayers,
  useTerrainCatalog,
} from '@/services/contracts'

import { useExplorerPreviews } from '@/features/lunar-explorer/useExplorerPreviews'

import { resolveSite, useMissionStore } from '@/stores/missionStore'

type MapViewState = {
  interacted?: boolean
  center: [number, number]
  halfExtent: number
  halfWidthM: number
  halfHeightM: number
}

/** Viewport-matched stereo BBOX ≤ backend cap, snapped for stable cache keys. Never CSS-scaled. */
export function previewBounds(v: MapViewState | null): [number, number, number, number] | null {
  if (!v) return null
  const snap = PREVIEW_BOUNDS_SNAP_M
  const halfW = Math.ceil(Math.min(Math.max(v.halfWidthM, 1_000), PREVIEW_MAX_HALF_EXTENT_M) / snap) * snap
  const halfH = Math.ceil(Math.min(Math.max(v.halfHeightM, 1_000), PREVIEW_MAX_HALF_EXTENT_M) / snap) * snap
  const cx = Math.round(v.center[0] / snap) * snap
  const cy = Math.round(v.center[1] / snap) * snap
  return [cx - halfW, cy - halfH, cx + halfW, cy + halfH]
}

export default function ExplorerPage() {
  const { t } = useTranslation()
  const { data, isPending, error, refetch } = useSites()
  const custom = useMissionStore((s) => s.customSites)
  const addCustom = useMissionStore((s) => s.addCustomSite)
  const removeCustom = useMissionStore((s) => s.removeCustomSite)
  const draft = useMissionStore((s) => s.draft)
  const caps = useCapabilities()
  const catalog = useTerrainCatalog(caps.has('terrainCatalog'))
  const mapLayers = useMapLayers(caps.has('mapLayers'))
  const artemis = useArtemisRegions(caps.has('artemisRegions'))
  const [viewLive, setViewLive] = useState<MapViewState | null>(null)
  // Debounce pan/zoom so we do not hammer /maps/preview on every wheel tick.
  const [view, setView] = useState(viewLive)
  useEffect(() => {
    const t = window.setTimeout(() => setView(viewLive), 280)
    return () => window.clearTimeout(t)
  }, [viewLive])
  const mapRef = useRef<LunarMapHandle>(null)
  const basemapPrimed = useRef(false)

  const [params, setParams] = useSearchParams()
  const selectedId = params.get('site')
  const setSelectedId = useCallback(
    (id: string | null) =>
      setParams(
        (p) => {
          if (id) p.set('site', id)
          else p.delete('site')
          return p
        },
        { replace: true },
      ),
    [setParams],
  )
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null)
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null)
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS)
  const [basemapOpacity, setBasemapOpacity] = useState(0.85)

  const reference = useMemo(() => data?.items ?? [], [data])
  const mapSites: MapSite[] = useMemo(
    () => [
      ...reference.map((s) => ({ ...s, kind: 'reference' as const })),
      ...custom.map((s) => ({ ...s, kind: 'custom' as const })),
    ],
    [reference, custom],
  )
  const marks = useMemo(() => {
    const m: Record<string, string> = {}
    if (draft.siteA) m[draft.siteA.id] = 'A'
    if (draft.siteB) m[draft.siteB.id] = 'B'
    return m
  }, [draft.siteA, draft.siteB])
  const siteA = resolveSite(draft.siteA, reference, custom)
  const siteB = resolveSite(draft.siteB, reference, custom)

  const target: DetailTarget | null = useMemo(() => {
    const ref = reference.find((s) => s.id === selectedId)
    if (ref)
      return {
        kind: 'reference',
        id: ref.id,
        name: ref.name,
        lat: ref.latitude_deg,
        lon: ref.longitude_deg,
        source: ref.coordinate_source,
        status: ref.coordinate_status,
      }
    const c = custom.find((s) => s.id === selectedId)
    if (c) return { kind: 'custom', id: c.id, name: c.name, lat: c.latitude_deg, lon: c.longitude_deg, source: t('explorer2.userInput') }
    if (picked) return { kind: 'picked', id: null, name: formatCoord(picked.lat, picked.lon, 3), lat: picked.lat, lon: picked.lon }
    return null
  }, [reference, custom, selectedId, picked, t])

  const handleAdd = (s: { name: string; lat: number; lon: number }) => {
    const created = addCustom({ name: s.name, latitude_deg: s.lat, longitude_deg: s.lon })
    setPicked(null)
    setSelectedId(created.id)
  }

  const tiles = useMemo(() => catalog.data?.tiles ?? [], [catalog.data])
  const layerList = useMemo(() => mapLayers.data?.items ?? [], [mapLayers.data])
  const basemaps = pickBasemapLayers(layerList)
  const basemapChoice: BasemapChoice =
    basemaps.photo && layers.rasters[basemaps.photo.id] ? 'photo' : basemaps.hillshade && layers.rasters[basemaps.hillshade.id] ? 'hillshade' : 'none'
  const chooseBasemap = (c: BasemapChoice) => {
    const r = { ...layers.rasters }
    if (basemaps.photo) r[basemaps.photo.id] = c === 'photo'
    if (basemaps.hillshade) r[basemaps.hillshade.id] = c === 'hillshade'
    setLayers({ ...layers, rasters: r })
  }
  // Prefer LROC photo when the Phase 5E allow-listed layer is catalogue-live; else hillshade.
  useEffect(() => {
    if (basemapPrimed.current || layerList.length === 0) return
    const pick = pickBasemapLayers(layerList)
    if (!pick.photo && !pick.hillshade) return
    basemapPrimed.current = true
    setLayers((prev) => {
      const r = { ...prev.rasters }
      if (pick.photo) {
        r[pick.photo.id] = true
        if (pick.hillshade) r[pick.hillshade.id] = false
      } else if (pick.hillshade) {
        r[pick.hillshade.id] = true
      }
      return { ...prev, rasters: r }
    })
  }, [layerList])
  const photoId = basemaps.photo?.id
  const hillId = basemaps.hillshade?.id
  // Memoised so the map does not restyle on every render.
  const rasterOpacity = useMemo(() => {
    const o: Record<string, number> = {}
    if (photoId) o[photoId] = basemapOpacity
    if (hillId) o[hillId] = basemapOpacity
    return o
  }, [photoId, hillId, basemapOpacity])
  const bounds = useMemo(() => previewBounds(view), [view])
  const imagery = useExplorerPreviews(layerList, layers, bounds, caps.has('mapPreview'), photoId, hillId, Boolean(view?.interacted))
  const { previews, previewStatus, anyRaster } = imagery
  const enabledIds = Object.keys(layers.rasters).filter((id) => layers.rasters[id])
  // Reflect the real requested stereo BBOX (width×height); not a fixed 100 km caption.
  const shownBounds = imagery.displayedPreviews.at(-1)?.extent
  const previewWindowSize = shownBounds
    ? (() => {
        const w = (shownBounds[2]! - shownBounds[0]!) / 1000
        const h = (shownBounds[3]! - shownBounds[1]!) / 1000
        const rw = Math.round(w)
        const rh = Math.round(h)
        return rw === rh ? String(rw) : `${rw}×${rh}`
      })()
    : null
  const cursorXY = cursor && cursor.lat <= 0 ? lonLatToXY(cursor.lon, cursor.lat) : null

  return (
    <PageTransition>
      <PageHeader
        eyebrow="LRO · LOLA · JPL Horizons"
        title={t('explorer.title')}
        description={t('explorer2.description')}
        actions={
          <Badge tone="neutral" className="whitespace-normal normal-case">
            {t('explorer.projection')}: {t('explorer.projectionValue')}
          </Badge>
        }
      />
      {error && (
        <div className="mb-4">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 2xl:grid-cols-[290px_minmax(0,1fr)_320px]">
        <div className="order-2 space-y-5 2xl:order-1">
          <LayerDock
            layers={layers}
            onChange={setLayers}
            catalog={catalog.data}
            catalogLoading={caps.isPending || catalog.isLoading}
            mapLayers={layerList}
            mapLayersLoading={caps.isPending || mapLayers.isLoading}
            previewStatus={previewStatus}
            onFitPolar={() => mapRef.current?.fitPolar()}
            onFitTiles={() => {
              const ext = tilesExtent(tiles)
              if (ext) mapRef.current?.fitExtent(ext)
            }}
          />
          <SiteList
            reference={reference}
            custom={custom}
            loading={isPending}
            selectedId={selectedId}
            onSelect={(id) => {
              setPicked(null)
              setSelectedId(id)
            }}
            onRemove={(id) => {
              removeCustom(id)
              if (selectedId === id) setSelectedId(null)
            }}
          />
          <CoordinateForm onAdd={handleAdd} />
          {artemis.data && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Flag className="size-4 text-gold" aria-hidden /> {t('explorer2.artemisTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(artemis.data.current_2024_shortlist?.length ?? 0) > 0 && (
                  <div>
                    <div className="sel-eyebrow mb-1.5 text-[10px]">{t('artemis5e.current')}</div>
                    <ul className="flex flex-wrap gap-1.5">
                      {artemis.data.current_2024_shortlist!.map((r) => (
                        <li key={r.id}>
                          <Badge tone="cyan" className="normal-case">
                            {r.name}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(artemis.data.historical_2022_regions?.length ?? 0) > 0 && (
                  <div>
                    <div className="sel-eyebrow mb-1.5 text-[10px]">{t('artemis5e.historical')}</div>
                    <ul className="flex flex-wrap gap-1.5">
                      {artemis.data.historical_2022_regions!.map((r) => (
                        <li key={r.id}>
                          <Badge tone="neutral" className="normal-case">
                            {r.name}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!artemis.data.current_2024_shortlist?.length && !artemis.data.historical_2022_regions?.length && (
                  <ul className="flex flex-wrap gap-1.5">
                    {artemis.data.regions.map((r) => (
                      <li key={r.id}>
                        <Badge tone="neutral" className="normal-case">
                          {r.name}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] leading-relaxed text-fg-3">{t('artemis5e.note')}</p>
                <p className="text-[11px] leading-relaxed text-fg-3">{artemis.data.disclaimer || t('explorer2.artemisNote')}</p>
                {artemis.data.official_sources.map((src) => (
                  <a key={src.id} href={src.url} target="_blank" rel="noreferrer noopener" className="flex items-start gap-1.5 text-[11px] text-fg-2 hover:text-cyan">
                    <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
                    <span className="break-all">{src.url.replace('https://', '')}</span>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <section className="order-1 2xl:order-2" aria-label={t('explorer.title')}>
          <div className="sel-card relative h-[60vh] min-h-[480px] overflow-hidden sm:min-h-[380px] 2xl:h-[calc(100dvh-230px)] 2xl:min-h-[600px]">
            <LunarMap
              ref={mapRef}
              sites={mapSites}
              selectedId={selectedId}
              picked={picked}
              layers={imagery.effectiveLayers}
              tiles={tiles}
              previews={previews}
              onRasterStatus={imagery.onRasterStatus}
              rasterOpacity={rasterOpacity}
              onView={setViewLive}
              marks={marks}
              ariaLabel={t('explorer.projectionValue')}
              onSelect={(id) => {
                setPicked(null)
                setSelectedId(id)
              }}
              onPick={(lat, lon) => {
                setSelectedId(null)
                setPicked({ lat, lon })
              }}
              onCursor={setCursor}
            />
            {anyRaster && previewWindowSize !== null && !imagery.photoFailed && !imagery.fallback && (
              <div className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-4rem)] rounded-lg border border-line-strong bg-bg/85 px-3 py-2 text-[11px] leading-snug text-fg-2 backdrop-blur sm:max-w-sm">
                {t('explorer2.previewNote', { size: previewWindowSize })}
                {basemapChoice === 'photo' && <div className="mt-0.5 text-[10px] text-warning/90"><span className="sm:hidden">{t('lroc.staticShort')}</span><span className="hidden sm:inline">{t('lroc.staticIllumination')}</span></div>}
                <div className="mt-0.5 truncate text-[10px] text-fg-3">{[...new Set(imagery.displayedPreviews.map((p) => p.attribution.split(';')[0]))].join(' · ')}</div>
              </div>
            )}
            {!anyRaster && enabledIds.length > 0 && Object.values(previewStatus).some((s) => s === 'loading') && (
              <div className="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-4rem)] items-start gap-2 rounded-lg border border-line-strong bg-bg/85 px-3 py-2 text-[11px] leading-snug text-fg-2 backdrop-blur sm:max-w-sm">
                <Info className="mt-px size-3.5 shrink-0 text-cyan" aria-hidden />
                <span>{t('lroc.loading')}</span>
              </div>
            )}
            {imagery.photoFailed && (
              <div className="absolute top-3 right-14 z-20 max-w-xs rounded-lg border border-warning/40 bg-bg/95 p-3 text-xs text-fg-2" role="alert">
                <p>{t('lroc.failedFallback')}</p>
                <button type="button" className="mt-2 rounded border border-line-strong px-3 py-1 text-cyan" onClick={imagery.retry}>{t('lroc.retry')}</button>
              </div>
            )}
            {imagery.fallback && !imagery.photoFailed && anyRaster && (
              <div className="pointer-events-none absolute top-3 right-14 max-w-xs rounded-lg border border-line bg-bg/90 px-3 py-2 text-[11px] text-fg-2" role="status">
                {t('lroc.pendingFallback')}
              </div>
            )}
            {!anyRaster && enabledIds.length === 0 && (
              <div className="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-4rem)] items-start gap-2 rounded-lg border border-line-strong bg-bg/85 px-3 py-2 text-[11px] leading-snug text-fg-2 backdrop-blur sm:max-w-sm">
                <Info className="mt-px size-3.5 shrink-0 text-cyan" aria-hidden />
                <span>{t('explorer2.noBasemap')}</span>
              </div>
            )}
            {caps.has('mapLayers') && (
              <div className="pointer-events-none absolute bottom-10 left-3 z-10">
                <BasemapControl layers={layerList} choice={basemapChoice} onChoice={chooseBasemap} opacity={basemapOpacity} onOpacity={setBasemapOpacity} />
              </div>
            )}
            <div
              className="pointer-events-none absolute right-3 bottom-3 flex flex-col items-end gap-0.5 rounded-lg border border-line bg-bg/85 px-3 py-1.5 font-mono text-[11px] text-fg-2 backdrop-blur"
              aria-live="off"
            >
              <span className="flex items-center gap-2">
                <Crosshair className="size-3.5 text-cyan" aria-hidden />
                <span className="text-fg-3">{t('explorer.cursor')}</span>
                {cursor ? formatCoord(cursor.lat, cursor.lon, 4) : '—'}
              </span>
              {cursorXY && (
                <span className="text-[10px] text-fg-3">
                  x {(cursorXY[0] / 1000).toFixed(3)} km · y {(cursorXY[1] / 1000).toFixed(3)} km
                </span>
              )}
            </div>
          </div>
          {target && !isInMapRegion(target.lat) && <p className="mt-2 text-xs text-warning">{t('explorer.outsideMap')}</p>}
        </section>

        <div className="order-3">
          <SiteInspector
            target={target}
            siteA={siteA}
            siteB={siteB}
            onSavePicked={() => {
              if (!picked) return
              handleAdd({
                name: `Point ${formatCoord(picked.lat, picked.lon, 2)}`,
                lat: Number(picked.lat.toFixed(4)),
                lon: Number(picked.lon.toFixed(4)),
              })
            }}
          />
        </div>

        <div className="order-4 2xl:col-span-3">
          <MissionTimelineDock />
        </div>
      </div>
    </PageTransition>
  )
}
