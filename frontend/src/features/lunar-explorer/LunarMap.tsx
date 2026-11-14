import 'ol/ol.css'

import { defaults as defaultControls, ScaleLine } from 'ol/control'
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import VectorLayer from 'ol/layer/Vector'
import OlMap from 'ol/Map'
import Projection from 'ol/proj/Projection'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import View from 'ol/View'
import { useEffect, useLayoutEffect, useRef } from 'react'

import { isInMapRegion, lonLatToXY, MAP_LAT_BOUND, mapHalfExtent, PROJECTION_CODE, xyToLonLat } from './projection'

export interface MapSite {
  id: string
  name: string
  latitude_deg: number
  longitude_deg: number
  kind: 'reference' | 'custom'
}

export interface MapLayers {
  graticule: boolean
  reference: boolean
  custom: boolean
  labels: boolean
}

interface Props {
  sites: MapSite[]
  selectedId: string | null
  picked: { lat: number; lon: number } | null
  layers: MapLayers
  onSelect: (id: string) => void
  onPick: (lat: number, lon: number) => void
  onCursor: (pos: { lat: number; lon: number } | null) => void
  ariaLabel: string
}

const HALF = mapHalfExtent()
const projection = new Projection({
  code: PROJECTION_CODE,
  units: 'm',
  extent: [-HALF, -HALF, HALF, HALF],
  global: false,
})

const COLORS = { reference: '#56D9E9', custom: '#F5C674', selected: '#9585FF' }

function buildGraticule(): Feature[] {
  const features: Feature[] = []
  const latRings = [-80, -82, -84, -86, -88, -89]
  for (const lat of latRings) {
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
  // Mapped-region disc (subtle fill so the empty map reads as a region, not data)
  const disc: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += 3) disc.push(lonLatToXY(lon, MAP_LAT_BOUND))
  const region = new Feature(new Polygon([disc]))
  region.set('kind', 'region')
  features.unshift(region)
  return features
}

const gridStyle = new Style({ stroke: new Stroke({ color: 'rgba(148,163,184,0.16)', width: 1 }) })
const boundaryStyle = new Style({
  stroke: new Stroke({ color: 'rgba(86,217,233,0.35)', width: 1.2, lineDash: [4, 6] }),
})
const regionStyle = new Style({ fill: new Fill({ color: 'rgba(21,31,50,0.55)' }) })

function graticuleStyle(f: Feature): Style {
  const kind = f.get('kind') as string
  if (kind === 'region') return regionStyle
  if (kind === 'boundary') return boundaryStyle
  if (kind === 'grid-label')
    return new Style({
      text: new Text({
        text: f.get('text') as string,
        font: '500 10px "JetBrains Mono Variable", monospace',
        fill: new Fill({ color: 'rgba(148,163,184,0.75)' }),
      }),
    })
  return gridStyle
}

export function LunarMap({ sites, selectedId, picked, layers, onSelect, onPick, onCursor, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<OlMap | null>(null)
  const siteSource = useRef(new VectorSource())
  const pickSource = useRef(new VectorSource())
  const graticuleLayer = useRef<VectorLayer | null>(null)
  // Latest props for OpenLayers callbacks (registered once).
  const state = useRef({ selectedId, layers, onSelect, onPick, onCursor })
  useLayoutEffect(() => {
    state.current = { selectedId, layers, onSelect, onPick, onCursor }
  })

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const grat = new VectorLayer({
      source: new VectorSource({ features: buildGraticule() }),
      style: (f) => graticuleStyle(f as Feature),
      updateWhileInteracting: false,
    })
    graticuleLayer.current = grat

    const siteLayer = new VectorLayer({
      source: siteSource.current,
      declutter: true,
      style: (f) => {
        const { selectedId: sel, layers: l } = state.current
        const kind = f.get('kind') as 'reference' | 'custom'
        if ((kind === 'reference' && !l.reference) || (kind === 'custom' && !l.custom)) return undefined
        const isSel = f.getId() === sel
        const color = isSel ? COLORS.selected : COLORS[kind]
        return [
          ...(isSel
            ? [
                new Style({
                  image: new CircleStyle({ radius: 13, stroke: new Stroke({ color, width: 1.5 }), fill: new Fill({ color: 'rgba(149,133,255,0.15)' }) }),
                }),
              ]
            : []),
          new Style({
            image: new CircleStyle({
              radius: isSel ? 6.5 : 5.5,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: '#070B16', width: 2 }),
            }),
            text: l.labels
              ? new Text({
                  text: f.get('name') as string,
                  offsetY: -16,
                  font: `${isSel ? 600 : 500} 11.5px "Inter Variable", sans-serif`,
                  fill: new Fill({ color: isSel ? '#F4F7FF' : '#CBD5E1' }),
                  stroke: new Stroke({ color: 'rgba(7,11,22,0.9)', width: 3.5 }),
                })
              : undefined,
            zIndex: isSel ? 10 : 1,
          }),
        ]
      },
    })

    const pickLayer = new VectorLayer({
      source: pickSource.current,
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
      layers: [grat, siteLayer, pickLayer],
      controls: defaultControls({ attribution: false, rotate: false }).extend([
        new ScaleLine({ units: 'metric', minWidth: 80 }),
      ]),
      view: new View({
        projection,
        center: [0, 0],
        zoom: 1,
        extent: [-HALF, -HALF, HALF, HALF],
        constrainOnlyCenter: true,
        enableRotation: false,
        showFullExtent: true,
      }),
    })
    map.getView().fit([-HALF, -HALF, HALF, HALF], { padding: [16, 16, 16, 16] })
    const fitZoom = map.getView().getZoom() ?? 1
    map.getView().setMinZoom(fitZoom - 0.5)
    map.getView().setMaxZoom(fitZoom + 7)
    // Open focused on the high-interest polar cap (≈ south of 84.5° S); users can zoom out to 80° S.
    const focus = mapHalfExtent(-84.5)
    map.getView().fit([-focus, -focus, focus, focus], { padding: [16, 16, 16, 16] })

    map.on('singleclick', (evt) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === siteLayer,
        hitTolerance: 6,
      })
      if (hit && hit.getId()) {
        state.current.onSelect(String(hit.getId()))
        return
      }
      const [lon, lat] = xyToLonLat(evt.coordinate[0]!, evt.coordinate[1]!)
      state.current.onPick(lat, lon)
    })

    let raf = 0
    map.on('pointermove', (evt) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const [lon, lat] = xyToLonLat(evt.coordinate[0]!, evt.coordinate[1]!)
        state.current.onCursor({ lat, lon })
        const hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter: (l) => l === siteLayer, hitTolerance: 6 })
        const target = map.getTargetElement()
        if (target) target.style.cursor = hit ? 'pointer' : 'crosshair'
      })
    })
    const el = containerRef.current
    const leave = () => state.current.onCursor(null)
    el.addEventListener('mouseleave', leave)

    mapRef.current = map
    const resize = new ResizeObserver(() => map.updateSize())
    resize.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      el.removeEventListener('mouseleave', leave)
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [])

  // Sync site features.
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

  // Restyle on selection / layer toggles.
  useEffect(() => {
    siteSource.current.changed()
    graticuleLayer.current?.setVisible(layers.graticule)
  }, [selectedId, layers])

  // Picked point.
  useEffect(() => {
    pickSource.current.clear()
    if (picked && picked.lat <= 0) {
      pickSource.current.addFeature(new Feature(new Point(lonLatToXY(picked.lon, picked.lat))))
    }
  }, [picked])

  // Centre on a selected site if it is in the mapped region.
  useEffect(() => {
    const map = mapRef.current
    const site = sites.find((s) => s.id === selectedId)
    if (!map || !site || !isInMapRegion(site.latitude_deg)) return
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
