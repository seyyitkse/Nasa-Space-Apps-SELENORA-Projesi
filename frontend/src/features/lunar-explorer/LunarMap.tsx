import 'ol/ol.css'

import { defaults as defaultControls, ScaleLine } from 'ol/control'
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import { defaults as defaultInteractions } from 'ol/interaction/defaults'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import OlMap from 'ol/Map'
import Projection from 'ol/proj/Projection'
import type ImageStatic from 'ol/source/ImageStatic'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import View from 'ol/View'
import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'

import type { DemTileInfo, RasterPreview } from '@/services/contracts'

import { RasterSourceSlot } from './RasterSourceSlot'
import { START_VIEW_EXTENT, type RasterDisplayEvent } from './useExplorerPreviews'

import { isInMapRegion, lonLatToXY, MAP_LAT_BOUND, mapHalfExtent, PROJECTION_CODE, xyToLonLat } from './projection'

export interface MapSite {
  id: string
  name: string
  latitude_deg: number
  longitude_deg: number
  kind: 'reference' | 'custom' | 'analysis'
}

export interface MapLayers {
  graticule: boolean
  reference: boolean
  custom: boolean
  labels: boolean
  coverage: boolean
  /** Backend map-layer ids (GET /maps/layers) that are switched on. */
  rasters: Record<string, boolean>
}

export const DEFAULT_LAYERS: MapLayers = {
  graticule: true,
  reference: true,
  custom: true,
  labels: true,
  coverage: true,
  rasters: {},
}

export interface LunarMapHandle {
  fitPolar: () => void
  fitExtent: (extent: [number, number, number, number]) => void
}

interface Props {
  sites: MapSite[]
  selectedId: string | null
  picked?: { lat: number; lon: number } | null
  layers: MapLayers
  tiles?: DemTileInfo[]
  /** Backend-rendered PNG previews placed at their returned stereographic bounds. */
  previews?: RasterPreview[]
  onRasterStatus?: (event: RasterDisplayEvent) => void
  /** Per-layer opacity (0..1) for previews; default 0.85. */
  rasterOpacity?: Record<string, number>
  /** Fires after pan/zoom with the view centre and viewport half-extents (metres). */
  onView?: (v: {
    center: [number, number]
    /** Larger of halfW/halfH — legacy square covering the viewport. */
    halfExtent: number
    halfWidthM: number
    halfHeightM: number
    resolution: number
    interacted: boolean
  }) => void
  /** Badge letters drawn on markers (e.g. mission Site A / B). */
  marks?: Record<string, string>
  onSelect?: (id: string) => void
  onPick?: (lat: number, lon: number) => void
  onCursor?: (pos: { lat: number; lon: number } | null) => void
  ariaLabel: string
  interactive?: boolean
  /** Latitude bound of the initial view (default ≈ −88° — Shackleton / ridge scale). */
  focusLat?: number
  ref?: Ref<LunarMapHandle>
}

const HALF = mapHalfExtent()
export const lunarProjection = new Projection({
  code: PROJECTION_CODE,
  units: 'm',
  extent: [-HALF, -HALF, HALF, HALF],
  global: false,
})

const COLORS = { reference: '#56D9E9', custom: '#F5C674', analysis: '#6EE7B7', selected: '#9585FF' }

function buildGraticule(): Feature[] {
  const features: Feature[] = []
  for (const lat of [-80, -82, -84, -86, -88, -89]) {
    const coords: [number, number][] = []
    for (let lon = -180; lon <= 180; lon += 2) coords.push(lonLatToXY(lon, lat))
    const f = new Feature(new LineString(coords))
    f.set('kind', lat === MAP_LAT_BOUND ? 'boundary' : 'grid')
    features.push(f)
    const label = new Feature(new Point(lonLatToXY(12, lat + 0.15)))
    label.set('kind', 'grid-label')
    label.set('text', `${Math.abs(lat)}°S`)
    features.push(label)
  }
  for (let lon = -150; lon <= 180; lon += 30) {
    const f = new Feature(new LineString([lonLatToXY(lon, MAP_LAT_BOUND), lonLatToXY(lon, -89.6)]))
    f.set('kind', 'grid')
    features.push(f)
    const label = new Feature(new Point(lonLatToXY(lon, MAP_LAT_BOUND + 0.55)))
    label.set('kind', 'grid-label')
    label.set('text', lon === 0 ? '0°' : lon === 180 ? '180°' : lon > 0 ? `${lon}°E` : `${-lon}°W`)
    features.push(label)
  }
  const disc: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += 3) disc.push(lonLatToXY(lon, MAP_LAT_BOUND))
  const region = new Feature(new Polygon([disc]))
  region.set('kind', 'region')
  features.unshift(region)
  return features
}

const gridStyle = new Style({ stroke: new Stroke({ color: 'rgba(148,163,184,0.22)', width: 1 }) })
const boundaryStyle = new Style({ stroke: new Stroke({ color: 'rgba(86,217,233,0.4)', width: 1.2, lineDash: [4, 6] }) })
/** Subtle disc UNDER rasters only — never a mask above imagery. */
const regionStyle = new Style({ fill: new Fill({ color: 'rgba(12,20,36,0.35)' }) })

function graticuleLineStyle(f: Feature): Style | undefined {
  const kind = f.get('kind') as string
  if (kind === 'region') return undefined
  if (kind === 'boundary') return boundaryStyle
  if (kind === 'grid-label')
    return new Style({
      text: new Text({
        text: f.get('text') as string,
        font: '500 10px "JetBrains Mono Variable", monospace',
        fill: new Fill({ color: 'rgba(148,163,184,0.8)' }),
      }),
    })
  return gridStyle
}

function tileFeature(tile: DemTileInfo): Feature {
  const [l, b, r, t] = tile.bounds_m
  const f = new Feature(new Polygon([[[l, b], [r, b], [r, t], [l, t], [l, b]]]))
  f.set('label', `LOLA ${tile.site_id} · ${tile.resolution_m} m/px`)
  return f
}

/** Extent of all tiles, padded. */
export function tilesExtent(tiles: DemTileInfo[], padM = 4000): [number, number, number, number] | null {
  if (!tiles.length) return null
  const l = Math.min(...tiles.map((t) => t.bounds_m[0])) - padM
  const b = Math.min(...tiles.map((t) => t.bounds_m[1])) - padM
  const r = Math.max(...tiles.map((t) => t.bounds_m[2])) + padM
  const tp = Math.max(...tiles.map((t) => t.bounds_m[3])) + padM
  return [l, b, r, tp]
}

export function LunarMap({
  sites,
  selectedId,
  picked = null,
  layers,
  tiles = [],
  previews = [],
  onRasterStatus,
  rasterOpacity = {},
  onView,
  marks = {},
  onSelect,
  onPick,
  onCursor,
  ariaLabel,
  interactive = true,
  focusLat = -88,
  ref,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<OlMap | null>(null)
  const siteSource = useRef(new VectorSource())
  const pickSource = useRef(new VectorSource())
  const tileSource = useRef(new VectorSource())
  const regionLayer = useRef<VectorLayer | null>(null)
  const graticuleLayer = useRef<VectorLayer | null>(null)
  const tileLayer = useRef<VectorLayer | null>(null)
  const rasterLayers = useRef(new Map<string, { layer: ImageLayer<ImageStatic>; slot: RasterSourceSlot; layerId: string }>())
  const interacted = useRef(false)
  const startedAt = useRef(0)
  const displayEvents = useRef<Record<string, object>>({})
  // Latest props for OpenLayers callbacks (registered once).
  const state = useRef({ selectedId, layers, marks, onSelect, onPick, onCursor, onView, onRasterStatus })
  useLayoutEffect(() => {
    state.current = { selectedId, layers, marks, onSelect, onPick, onCursor, onView, onRasterStatus }
  })

  useImperativeHandle(ref, () => ({
    fitPolar: () => {
      interacted.current = true
      const f = mapHalfExtent(focusLat)
      mapRef.current?.getView().fit([-f, -f, f, f], { padding: [16, 16, 16, 16], duration: 400 })
    },
    fitExtent: (extent) => {
      interacted.current = true
      mapRef.current?.getView().fit(extent, { padding: [24, 24, 24, 24], duration: 450 })
    },
  }))

  useEffect(() => {
    if (!containerRef.current) return
    startedAt.current = performance.now()
    const allGrat = buildGraticule()
    const regionFeats = allGrat.filter((f) => f.get('kind') === 'region')
    const lineFeats = allGrat.filter((f) => f.get('kind') !== 'region')
    // z-order: region fill (0) < rasters (2) < grid/labels (5) < coverage (6) < sites (10)
    const region = new VectorLayer({
      source: new VectorSource({ features: regionFeats }),
      style: regionStyle,
      zIndex: 0,
    })
    regionLayer.current = region
    const grat = new VectorLayer({
      source: new VectorSource({ features: lineFeats }),
      style: (f) => graticuleLineStyle(f as Feature),
      zIndex: 5,
    })
    graticuleLayer.current = grat

    const coverage = new VectorLayer({
      source: tileSource.current,
      zIndex: 6,
      style: (f, resolution) =>
        new Style({
          stroke: new Stroke({ color: 'rgba(110,231,183,0.85)', width: 1.5, lineDash: [6, 4] }),
          fill: new Fill({ color: 'rgba(110,231,183,0.07)' }),
          // Labels only once tiles are large enough on screen (avoids collisions at polar zoom).
          text: resolution > 400 ? undefined : new Text({
            text: f.get('label') as string,
            font: '600 10.5px "JetBrains Mono Variable", monospace',
            fill: new Fill({ color: '#6EE7B7' }),
            stroke: new Stroke({ color: 'rgba(7,11,22,0.9)', width: 3 }),
            overflow: true,
          }),
        }),
    })
    tileLayer.current = coverage

    const siteLayer = new VectorLayer({
      source: siteSource.current,
      declutter: true,
      zIndex: 10,
      style: (f) => {
        const { selectedId: sel, layers: l, marks: m } = state.current
        const kind = f.get('kind') as MapSite['kind']
        if ((kind === 'reference' && !l.reference) || (kind === 'custom' && !l.custom)) return undefined
        const id = String(f.getId())
        const isSel = id === sel
        const color = isSel ? COLORS.selected : COLORS[kind]
        const mark = m[id]
        const styles: Style[] = []
        if (isSel)
          styles.push(
            new Style({
              image: new CircleStyle({
                radius: 13,
                stroke: new Stroke({ color, width: 1.5 }),
                fill: new Fill({ color: 'rgba(149,133,255,0.15)' }),
              }),
            }),
          )
        styles.push(
          new Style({
            image: new CircleStyle({
              radius: mark ? 8 : isSel ? 6.5 : 5.5,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: '#070B16', width: 2 }),
            }),
            text: mark
              ? new Text({ text: mark, font: '700 10px "Inter Variable", sans-serif', fill: new Fill({ color: '#070B16' }) })
              : undefined,
            zIndex: isSel ? 10 : mark ? 5 : 1,
          }),
        )
        if (l.labels)
          styles.push(
            new Style({
              text: new Text({
                text: f.get('name') as string,
                offsetY: -18,
                font: `${isSel ? 600 : 500} 11.5px "Inter Variable", sans-serif`,
                fill: new Fill({ color: isSel ? '#F4F7FF' : '#CBD5E1' }),
                stroke: new Stroke({ color: 'rgba(7,11,22,0.9)', width: 3.5 }),
              }),
              zIndex: isSel ? 10 : 1,
            }),
          )
        return styles
      },
    })

    const pickLayer = new VectorLayer({
      source: pickSource.current,
      zIndex: 11,
      style: new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: 'rgba(245,198,116,0.25)' }),
          stroke: new Stroke({ color: '#F5C674', width: 2, lineDash: [3, 3] }),
        }),
      }),
    })

    const map = new OlMap({
      target: containerRef.current,
      layers: [region, grat, coverage, siteLayer, pickLayer],
      controls: interactive
        ? defaultControls({ attribution: false, rotate: false }).extend([new ScaleLine({ units: 'metric', minWidth: 80 })])
        : [],
      interactions: interactive ? defaultInteractions() : [],
      view: new View({
        projection: lunarProjection,
        center: [0, 0],
        zoom: 1,
        extent: [-HALF, -HALF, HALF, HALF],
        constrainOnlyCenter: true,
        enableRotation: false,
        showFullExtent: true,
      }),
    })
    // Min zoom = full 80°S disc; start zoomed to focusLat (~88°S ridge/Shackleton scale).
    map.getView().fit([-HALF, -HALF, HALF, HALF], { padding: [16, 16, 16, 16] })
    const fitZoom = map.getView().getZoom() ?? 1
    map.getView().setMinZoom(fitZoom - 0.5)
    map.getView().setMaxZoom(map.getView().getZoomForResolution(1) ?? fitZoom + 12)
    const focus = mapHalfExtent(focusLat)
    map.getView().fit(focusLat === -88 ? START_VIEW_EXTENT : [-focus, -focus, focus, focus], { padding: [24, 24, 24, 24] })

    if (interactive) {
      map.on('singleclick', (evt) => {
        const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, { layerFilter: (l) => l === siteLayer, hitTolerance: 6 })
        if (hit && hit.getId()) {
          state.current.onSelect?.(String(hit.getId()))
          return
        }
        const [lon, lat] = xyToLonLat(evt.coordinate[0]!, evt.coordinate[1]!)
        state.current.onPick?.(lat, lon)
      })
    }

    let raf = 0
    map.on('pointermove', (evt) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const [lon, lat] = xyToLonLat(evt.coordinate[0]!, evt.coordinate[1]!)
        state.current.onCursor?.({ lat, lon })
        const hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter: (l) => l === siteLayer, hitTolerance: 6 })
        const target = map.getTargetElement()
        if (target) target.style.cursor = hit ? 'pointer' : interactive ? 'crosshair' : 'default'
      })
    })
    const emitView = () => {
      const v = map.getView()
      const c = v.getCenter()
      const size = map.getSize()
      const res = v.getResolution()
      if (!c || !size || !res) return
      const halfWidthM = (size[0]! * res) / 2
      const halfHeightM = (size[1]! * res) / 2
      state.current.onView?.({
        center: [c[0]!, c[1]!],
        halfExtent: Math.max(halfWidthM, halfHeightM),
        halfWidthM,
        halfHeightM,
        resolution: res,
        interacted: interacted.current,
      })
    }
    map.on('moveend', emitView)
    map.once('rendercomplete', emitView)

    const el = containerRef.current
    const leave = () => state.current.onCursor?.(null)
    const beginInteraction = () => { interacted.current = true }
    el.addEventListener('pointerdown', beginInteraction)
    el.addEventListener('wheel', beginInteraction, { passive: true })
    el.addEventListener('keydown', beginInteraction)
    el.addEventListener('mouseleave', leave)

    mapRef.current = map
    const resize = new ResizeObserver(() => { map.updateSize(); emitView() })
    resize.observe(el)
    const rasterMap = rasterLayers.current
    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      el.removeEventListener('mouseleave', leave)
      el.removeEventListener('pointerdown', beginInteraction)
      el.removeEventListener('wheel', beginInteraction)
      el.removeEventListener('keydown', beginInteraction)
      map.setTarget(undefined)
      mapRef.current = null
      for (const entry of rasterMap.values()) entry.slot.dispose()
      rasterMap.clear()
    }
  }, [interactive, focusLat])

  // Sites
  useEffect(() => {
    const src = siteSource.current
    src.clear()
    src.addFeatures(
      sites
        .filter((s) => s.latitude_deg <= 0)
        .map((s) => {
          const f = new Feature(new Point(lonLatToXY(s.longitude_deg, s.latitude_deg)))
          f.setId(s.id)
          f.set('name', s.name)
          f.set('kind', s.kind)
          return f
        }),
    )
  }, [sites])

  // Real LOLA tile footprints (exact stereographic bounds from /terrain/catalog)
  useEffect(() => {
    tileSource.current.clear()
    tileSource.current.addFeatures(tiles.map(tileFeature))
  }, [tiles])

  // Slots own their source/URL lifetimes; stable payloads never re-decode on UI renders.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const existing = rasterLayers.current
    const live = new Set(previews.map((p) => p.renderKey ?? p.layerId))
    for (const [key, entry] of existing) {
      if (!live.has(key)) {
        map.removeLayer(entry.layer)
        entry.slot.dispose()
        existing.delete(key)
      }
    }
    previews.forEach((preview, index) => {
      const key = preview.renderKey ?? preview.layerId
      let entry = existing.get(key)
      if (!entry) {
        const layer = new ImageLayer<ImageStatic>({ opacity: 0.85, zIndex: preview.renderOrder ?? 2 + index })
        const slot = new RasterSourceSlot(layer, map, lunarProjection, (event) => {
          const el = containerRef.current
          if (el) {
            if (event.status === 'ready' && !el.dataset.firstRasterMs) {
              el.dataset.firstRasterMs = (performance.now() - startedAt.current).toFixed(1)
            }
            displayEvents.current[key] = { status: event.status, layer: event.preview.layerId,
              bounds: event.preview.extent, cache: event.preview.cacheStatus,
              requestMs: event.preview.requestMs, loadMs: event.loadMs,
              elapsedMs: performance.now() - startedAt.current }
            el.dataset.rasters = JSON.stringify(displayEvents.current)
          }
          state.current.onRasterStatus?.(event)
        })
        entry = { layer, slot, layerId: preview.layerId }
        existing.set(key, entry)
        map.addLayer(layer)
      }
      entry.layer.setZIndex(preview.renderOrder ?? 2 + index)
      entry.slot.update(preview)
    })
  }, [previews])

  // Restyle on selection / layer toggles.
  useEffect(() => {
    siteSource.current.changed()
    regionLayer.current?.setVisible(layers.graticule)
    graticuleLayer.current?.setVisible(layers.graticule)
    tileLayer.current?.setVisible(layers.coverage)
    for (const { layer, layerId } of rasterLayers.current.values()) {
      layer.setVisible(Boolean(layers.rasters[layerId]))
      layer.setOpacity(rasterOpacity[layerId] ?? 0.85)
    }
  }, [selectedId, layers, marks, previews, rasterOpacity])

  useEffect(() => {
    pickSource.current.clear()
    if (picked && picked.lat <= 0) pickSource.current.addFeature(new Feature(new Point(lonLatToXY(picked.lon, picked.lat))))
  }, [picked])

  useEffect(() => {
    const map = mapRef.current
    const site = sites.find((s) => s.id === selectedId)
    if (!map || !site || !isInMapRegion(site.latitude_deg)) return
    interacted.current = true
    map.getView().animate({ center: lonLatToXY(site.longitude_deg, site.latitude_deg), duration: 450 })
  }, [selectedId, sites])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      className="absolute inset-0 cursor-crosshair bg-[radial-gradient(circle_at_50%_50%,#0c1424_0%,#070b16_70%)]"
    />
  )
}
