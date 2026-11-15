import { useQueries } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

import { contractApi, PREVIEW_PROCESSING_VERSION, type MapLayer, type RasterPreview } from '@/services/contracts'

import { isRenderable, type PreviewStatus } from './LayerDock'
import type { MapLayers } from './LunarMap'

export const STARTUP_BOUNDS: [number, number, number, number] = [-64_000, -64_000, 64_000, 64_000]
export const START_VIEW_EXTENT: [number, number, number, number] = [-30_000, -26_000, 18_000, 6_000]

export type RasterDisplayEvent = { key: string; preview: RasterPreview; status: PreviewStatus; loadMs?: number }

export function useExplorerPreviews(
  catalog: MapLayer[], layers: MapLayers, bounds: [number, number, number, number] | null,
  enabled: boolean, photoId?: string, hillId?: string, detailEnabled = true, tiledBasemap = false,
) {
  const [display, setDisplay] = useState<Record<string, RasterDisplayEvent>>({})
  const onRasterStatus = useCallback((event: RasterDisplayEvent) => {
    setDisplay((old) => old[event.key]?.preview === event.preview && old[event.key]?.status === event.status
      ? old : { ...old, [event.key]: event })
  }, [])
  const photoOn = Boolean(photoId && layers.rasters[photoId])
  const hillOn = Boolean(hillId && layers.rasters[hillId])
  const requests = [
    { key: 'startup:hillshade', id: hillId ?? '', bounds: STARTUP_BOUNDS, on: photoOn || hillOn },
    { key: 'startup:photo', id: photoId ?? '', bounds: STARTUP_BOUNDS, on: photoOn },
    ...catalog.filter(isRenderable).map((layer) => ({
      key: `detail:${layer.id}`, id: layer.id, bounds,
      // Genuine hillshade also loads for a new viewport while LROC is pending.
      on: detailEnabled && (Boolean(layers.rasters[layer.id]) || (photoOn && layer.id === hillId)),
    })),
  ].filter((request) => request.id && !(tiledBasemap && (request.id === photoId || request.id === hillId)) && !(request.key.startsWith('detail:')
    && (request.id === photoId || request.id === hillId)
    && request.bounds?.every((value, index) => value === STARTUP_BOUNDS[index])))
  const combined = useQueries({
    queries: requests.map((request) => ({
      queryKey: ['map-preview', PREVIEW_PROCESSING_VERSION, request.id, request.bounds],
      queryFn: ({ signal }: { signal: AbortSignal }) => contractApi.mapPreview(request.id, request.bounds!, 768, signal),
      enabled: enabled && Boolean(request.id) && request.on && request.bounds !== null,
      staleTime: Infinity,
      gcTime: 10 * 60_000,
      retry: 0,
      // Keep the previous geographic image at its ORIGINAL extent during navigation.
      placeholderData: (previous: RasterPreview | undefined) => previous,
    })),
    combine: (results) => ({
      data: results.map((query) => query.data),
      states: results.map((query) => ({ error: query.error, isFetching: query.isFetching, isError: query.isError, refetch: query.refetch })),
    }),
  })
  // React Query structurally shares unchanged payloads. No object URL is kept in its cache.
  const { data, states: queries } = combined
  const slotKeys = requests.map((request) => request.key).join('|')
  const descriptors = useMemo(() => {
    const keys = slotKeys.split('|')
    return data.flatMap((preview, index) => preview ? [{ ...preview, renderKey: keys[index]!,
      renderOrder: preview.layerId === hillId ? (keys[index]!.startsWith('startup:') ? 1.1 : 1.2)
        : preview.layerId === photoId ? (keys[index]!.startsWith('startup:') ? 2.1 : 2.2) : 3 + index,
    }] : [])
  }, [data, slotKeys, hillId, photoId])
  const previewStatus: Record<string, PreviewStatus> = {}
  for (const [index, request] of requests.entries()) {
    if (!request.id || !request.on || request.bounds === null) continue
    const query = queries[index]!
    const descriptor = descriptors.find((preview) => preview.renderKey === request.key)
    const drawn = display[request.key]
    const state: PreviewStatus = query.error ? 'error' : query.isFetching ? 'loading'
      : descriptor && drawn?.preview.blob === descriptor.blob ? drawn.status : descriptor ? 'loading' : 'idle'
    // A detail request determines current-viewport status, rather than the overview.
    previewStatus[request.id] = state
  }
  const photoReady = descriptors.some((preview) => preview.layerId === photoId
    && display[preview.renderKey!]?.preview.blob === preview.blob
    && display[preview.renderKey!]?.status === 'ready'
    && (!bounds || (preview.extent[0] <= bounds[0] && preview.extent[1] <= bounds[1]
      && preview.extent[2] >= bounds[2] && preview.extent[3] >= bounds[3])))
  const photoFailed = photoOn && previewStatus[photoId!] === 'error'
  const fallback = photoOn && !photoReady
  const effectiveLayers = useMemo(() => ({ ...layers, rasters: {
    ...layers.rasters, ...(hillId ? { [hillId]: hillOn || photoOn } : {}),
  } }), [layers, hillId, hillOn, photoOn])
  const retry = () => {
    for (const [index, request] of requests.entries()) {
      if (request.on && (queries[index]!.isError || display[request.key]?.status === 'error')) void queries[index]!.refetch()
    }
  }
  const anyRaster = Object.values(display).some((event) => event.status === 'ready'
    && effectiveLayers.rasters[event.preview.layerId])
  const displayedPreviews = descriptors.filter((preview) => effectiveLayers.rasters[preview.layerId]
    && display[preview.renderKey!]?.preview.blob === preview.blob
    && display[preview.renderKey!]?.status === 'ready')
  return { displayedPreviews, previews: descriptors, previewStatus, effectiveLayers, fallback, photoFailed, retry, anyRaster, onRasterStatus }
}
