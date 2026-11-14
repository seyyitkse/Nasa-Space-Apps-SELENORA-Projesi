import { unByKey } from 'ol/Observable'
import type { EventsKey } from 'ol/events'
import type ImageLayer from 'ol/layer/Image'
import type OlMap from 'ol/Map'
import type Projection from 'ol/proj/Projection'
import ImageStatic from 'ol/source/ImageStatic'

import type { RasterPreview } from '@/services/contracts'

import type { RasterDisplayEvent } from './useExplorerPreviews'

type Resource = { source: ImageStatic; url: string }

/** Owns URLs and decoded sources independently from React render frequency. */
export class RasterSourceSlot {
  private current?: Resource
  private pending?: Resource
  private attempted?: RasterPreview
  private generation = 0
  private listeners: EventsKey[] = []
  private paint?: EventsKey
  private retired = new Set<Resource>()

  private layer: ImageLayer<ImageStatic>
  private map: OlMap
  private projection: Projection
  private onStatus: (event: RasterDisplayEvent) => void

  constructor(layer: ImageLayer<ImageStatic>, map: OlMap,
    projection: Projection, onStatus: (event: RasterDisplayEvent) => void) {
    this.layer = layer
    this.map = map
    this.projection = projection
    this.onStatus = onStatus
  }

  update(preview: RasterPreview) {
    const previous = this.attempted
    if (previous?.blob === preview.blob && previous.extent.join(',') === preview.extent.join(',')) return
    this.attempted = preview
    const generation = ++this.generation
    this.cancelPending()
    const started = performance.now()
    const key = preview.renderKey ?? preview.layerId
    const report = (status: RasterDisplayEvent['status']) => this.onStatus({
      key, preview, status, loadMs: performance.now() - started,
    })
    const url = URL.createObjectURL(preview.blob)
    const source = new ImageStatic({ url, imageExtent: preview.extent,
      projection: this.projection, attributions: preview.attribution })
    const resource = { source, url }
    this.pending = resource
    report('loading')
    this.listeners = [source.on('imageloaderror', () => {
      if (generation !== this.generation) return
      this.cancelPending()
      report('error')
    }), source.on('imageloadend', () => {
      if (generation !== this.generation) return
      unByKey(this.listeners)
      this.listeners = []
      if (this.current) this.retired.add(this.current)
      this.current = resource
      this.pending = undefined
      // The old, decoded image stays on the layer until the replacement decodes.
      this.layer.setSource(source)
      if (this.paint) unByKey(this.paint)
      this.paint = this.map.once('postrender', () => {
        this.paint = undefined
        this.releaseRetired()
        if (generation === this.generation) report('ready')
      })
      this.map.render()
    })]
    // Preload even while a source is not yet attached to the visible layer.
    // OpenLayers' loader uses image.decode(); imageloadend follows successful decode.
    source.getImage(preview.extent, this.map.getView().getResolution() ?? 1, 1, this.projection)?.load()
  }

  private release(resource: Resource) {
    URL.revokeObjectURL(resource.url)
    resource.source.dispose()
  }

  private cancelPending() {
    unByKey(this.listeners)
    this.listeners = []
    if (this.pending) this.release(this.pending)
    this.pending = undefined
  }

  private releaseRetired() {
    for (const resource of this.retired) this.release(resource)
    this.retired.clear()
  }

  dispose() {
    ++this.generation
    this.cancelPending()
    if (this.paint) unByKey(this.paint)
    if (this.current) this.release(this.current)
    this.releaseRetired()
  }
}
