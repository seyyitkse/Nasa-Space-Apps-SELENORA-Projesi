import type ImageTile from 'ol/ImageTile'
import TileLayer from 'ol/layer/Tile'
import type OlMap from 'ol/Map'
import type Projection from 'ol/proj/Projection'
import TileImage from 'ol/source/TileImage'
import TileState from 'ol/TileState'
import { unByKey } from 'ol/Observable'
import type { EventsKey } from 'ol/events'

import { covers, EMPTY_BASEMAP, hasValidPixels, HILL, intersects, NAC, polarGrid, preparedTile, tileBounds, TILE_VERSION, WAC,
  type BasemapStatus, type Bounds } from './polarTiles'

type Record = { layer: string; coord: number[]; bounds: Bounds; tile: WeakRef<ImageTile>; state: 'queued' | 'loading' | 'ready' | 'failed' | 'cancelled';
  controller: AbortController; url: string; started: number; requestMs?: number; bytes?: number; cache?: string; nodata?: number; mask?: Uint8Array }

/** One stable source per product. OL's native tile renderer substitutes parents,
 * clips at true tile bounds and retires redundant interim tiles after paint.
 * No per-preview ImageStatic layers, no alpha accumulation inside a product.
 */
export class PolarBasemap {
  private map: OlMap
  private layers = new Map<string, TileLayer<TileImage>>()
  private records = new Map<string, Record>()
  private queue: Record[] = []
  private active = 0
  private disposed = false
  private choice = 'none'
  private nac = false
  private opacity = 1
  private extent: Bounds = [-30000, -26000, 18000, 6000]
  private resolution = 100
  private debounce?: ReturnType<typeof setTimeout>
  private onStatus: (status: BasemapStatus) => void
  private onMetrics: (metrics: object) => void
  private lastStatus = ''
  private lastMetricsAt = 0
  private firstPaintReported = false
  private listeners: EventsKey[] = []

  constructor(map: OlMap, projection: Projection, onStatus: (status: BasemapStatus) => void, onMetrics: (metrics: object) => void) {
    this.map = map
    this.onStatus = onStatus
    this.onMetrics = onMetrics
    for (const id of [HILL, WAC, NAC]) {
      const grid = polarGrid(id === NAC)
      const source = new TileImage({ projection, tileGrid: grid, wrapX: false, transition: 0, zDirection: 1,
        crossOrigin: 'anonymous', attributions: id === HILL ? 'NASA GSFC LOLA / Barker et al. (2021), PGDA Product 90'
          : id === NAC ? 'NASA/GSFC/ASU — preliminary LROC NAC 2 m mosaic (2009–2010)' : 'NASA/GSFC/ASU — LROC WAC summer mosaic (~100 m/px)',
        tileUrlFunction: ([z, x, y]) => {
          if (id === NAC) {
            const b = tileBounds(z!, x!, y!)
            // Operationally bounded ROI, not a claim of complete NAC coverage.
            if (!intersects(b, [-60000, -60000, 60000, 60000])) return undefined
          }
          return preparedTile(id, z!, x!, y!) ? `/lunar-overview/${id}-${z}-${x}-${y}.png?v=${TILE_VERSION}`
            : `/api/v1/maps/tiles/${id}/${z}/${x}/${y}.png?v=${TILE_VERSION}`
        },
        tileLoadFunction: (raw, url) => this.enqueue(id, raw as ImageTile, url),
      })
      const layer = new TileLayer({ source, zIndex: id === HILL ? 1 : id === WAC ? 2 : 2.5,
        // Native cache stores decoded tiles, and expires old tiles after rendering.
        cacheSize: 96, preload: id === NAC ? 0 : 5, visible: false })
      this.layers.set(id, layer)
      map.addLayer(layer)
    }
    this.listeners.push(map.on('moveend', () => this.viewChanged()), map.on('change:size', () => this.viewChanged()),
      map.on('postrender', () => this.report(true)))
    this.viewChanged()
  }

  setMode(choice: string, opacity: number, nac: boolean) {
    this.choice = choice
    this.opacity = opacity
    this.nac = nac
    this.updateVisibility()
    this.viewChanged()
  }

  private updateVisibility() {
    this.layers.get(HILL)!.setVisible(this.choice !== 'none')
    this.layers.get(WAC)!.setVisible(this.choice === 'photo')
    this.layers.get(NAC)!.setVisible(this.choice === 'photo' && this.nac && this.resolution <= 32)
    for (const layer of this.layers.values()) layer.setOpacity(this.opacity)
  }

  private wanted(record: Record) {
    if (this.choice === 'none' || (record.layer !== HILL && this.choice !== 'photo')) return false
    if (record.layer === NAC && (!this.nac || this.resolution > 32)) return false
    const grid = this.layers.get(record.layer)!.getSource()!.getTileGrid()!
    const z = grid.getZForResolution(this.resolution, 1)
    const [rz, x, y] = record.coord
    const prepared = preparedTile(record.layer, rz!, x!, y!)
    if (!prepared && rz !== z) return false
    // Photo already has its own ready coarse pyramid. Hill detail is only
    // requested in hillshade mode; genuine prepared LOLA remains underneath.
    if (record.layer === HILL && this.choice === 'photo' && !prepared) return false
    return rz! <= z && intersects(record.bounds, this.extent)
  }

  private viewChanged() {
    const size = this.map.getSize()
    if (!size) return
    const view = this.map.getView()
    this.extent = view.calculateExtent(size) as Bounds
    this.resolution = view.getResolution() ?? 100
    this.updateVisibility()
    clearTimeout(this.debounce)
    this.debounce = setTimeout(() => {
      for (const record of this.records.values()) {
        if (!this.wanted(record) && ['queued', 'loading'].includes(record.state)) {
          record.state = 'cancelled'
          record.controller.abort()
          record.tile.deref()?.setState(TileState.ERROR)
        } else if (record.state === 'cancelled' && this.wanted(record)) {
          record.tile.deref()?.load()
        }
      }
      this.pump()
      this.report()
    }, 280)
    this.report()
  }

  private enqueue(layer: string, tile: ImageTile, url: string) {
    const coord = tile.getTileCoord()
    const key = `${layer}/${coord.join('/')}`
    this.records.get(key)?.controller.abort()
    const record: Record = { layer, coord, bounds: tileBounds(coord[0]!, coord[1]!, coord[2]!), tile: new WeakRef(tile),
      state: 'queued', controller: new AbortController(), url, started: performance.now() }
    this.records.set(key, record)
    this.queue.push(record)
    this.report()
    // Coarse prepared tiles can paint immediately. Remote detail waits for navigation to settle.
    if (url.startsWith('/lunar-overview/')) this.pump()
    else { clearTimeout(this.debounce); this.debounce = setTimeout(() => { this.viewChanged(); this.pump() }, 280) }
  }

  private pump() {
    if (this.disposed) return
    // Prepared parents first; no duplicate request for an existing decoded tile.
    this.queue.sort((a, b) => Number(!a.url.startsWith('/lunar-overview/')) - Number(!b.url.startsWith('/lunar-overview/')) || a.coord[0]! - b.coord[0]!)
    while (this.active < 4 && this.queue.length) {
      const record = this.queue.shift()!
      if (record.state !== 'queued') continue
      if (!this.wanted(record)) {
        record.state = 'cancelled'
        record.tile.deref()?.setState(TileState.ERROR)
        continue
      }
      this.active++
      record.state = 'loading'
      void this.load(record).finally(() => { this.active--; this.pump(); this.report() })
    }
  }

  private async load(record: Record) {
    let objectUrl: string | undefined
    const tile = record.tile.deref()
    if (!tile) return
    const timeout = setTimeout(() => record.controller.abort('timeout'), 90_000)
    try {
      const response = await fetch(record.url, { signal: record.controller.signal })
      if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) throw new Error(`Tile HTTP ${response.status}`)
      const native = response.headers.get('x-selenora-crs')
      const b = response.headers.get('x-selenora-bounds-m')
      if (native && native !== 'IAU2000:30120') throw new Error('Tile CRS mismatch')
      if (b && b.split(',').some((v, i) => Math.abs(Number(v) - record.bounds[i]!) > 0.01)) throw new Error('Tile geographic bounds mismatch')
      const blob = await response.blob()
      if (this.disposed || record.controller.signal.aborted) return
      record.bytes = blob.size
      record.cache = response.headers.get('x-selenora-cache') ?? 'BUNDLED'
      // Decode off-source. Only the current generation may replace a tile image.
      const image = new Image()
      objectUrl = URL.createObjectURL(blob)
      image.src = objectUrl
      await image.decode()
      if (this.disposed || record.controller.signal.aborted) return
      const edge = record.layer === NAC ? 375 : 240
      if (image.naturalWidth !== edge || image.naturalHeight !== edge) throw new Error('Tile size mismatch')
      const canvas = document.createElement('canvas')
      canvas.width = edge; canvas.height = edge
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, edge, edge).data
      let missing = 0
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) missing++
      record.nodata = missing / (edge * edge)
      if (missing > 0 && missing < edge * edge) record.mask = Uint8Array.from({ length: edge * edge }, (_, i) => pixels[i * 4 + 3]!)
      record.requestMs = performance.now() - record.started
      record.state = 'ready'
      tile.setImage(image)
      this.map.render()
    } catch {
      if (record.state !== 'cancelled' && !this.disposed) record.state = 'failed'
      if (this.records.get(`${record.layer}/${record.coord.join('/')}`) === record) tile.setState(TileState.ERROR)
    } finally {
      clearTimeout(timeout)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }

  retry() {
    for (const record of this.records.values()) if (record.state === 'failed' && this.wanted(record)) record.tile.deref()?.load()
  }

  private report(painted = false) {
    if (this.disposed) return
    const relevant = [...this.records.values()].filter((r) => this.wanted(r))
    const ready = relevant.filter((r) => r.state === 'ready' && r.tile.deref()?.getState() === TileState.LOADED)
    const valid = (r: Record) => hasValidPixels(r.bounds, this.extent, r.nodata ?? 1, r.mask, r.layer === NAC ? 375 : 240)
    const photo = ready.filter((r) => r.layer === WAC && valid(r))
    const target = this.choice === 'photo' ? WAC : HILL
    const grid = this.layers.get(target)!.getSource()!.getTileGrid()!
    const z = grid.getZForResolution(this.resolution, 1)
    const detail = relevant.filter((r) => r.layer === target && r.coord[0] === z)
    const loaded = detail.filter((r) => r.state === 'ready')
    const photoFull = covers(this.extent, photo.filter((r) => r.nodata === 0).map((r) => r.bounds))
    const overviewReady = ready.some((r) => r.coord[0]! <= 1 && valid(r))
    const pending = detail.some((r) => r.state === 'queued' || r.state === 'loading')
    const failed = detail.filter((r) => r.state === 'failed').length
    const any = ready.some(valid)
    const nac = relevant.filter((r) => r.layer === NAC)
    const nacGrid = this.layers.get(NAC)!.getSource()!.getTileGrid()!
    const status: BasemapStatus = { ...EMPTY_BASEMAP, overviewReady,
      detail: pending ? 'loading' : failed ? 'failed' : loaded.length ? 'ready' : 'idle',
      outsideLoaded: this.choice !== 'none' && !any,
      unavailable: this.choice !== 'none' && !any && !pending && detail.length > 0 && detail.every((r) => r.state === 'ready' || r.state === 'failed'),
      fallback: this.choice === 'photo' && !photoFull && ready.some((r) => r.layer === HILL && valid(r)),
      photoCoverage: photoFull ? 'full' : photo.length ? 'partial' : 'none',
      nac: !this.nac || this.choice !== 'photo' ? 'off' : this.resolution > 32 ? 'zoom-in'
        : !intersects(this.extent, [-60000, -60000, 60000, 60000]) ? 'no-coverage' : nac.length === 0 ? 'loading'
        : nac.some((r) => ['loading', 'queued'].includes(r.state)) ? 'loading'
        : nac.some((r) => r.state === 'ready' && valid(r)) ? 'ready'
        : nac.some((r) => r.state === 'failed') ? 'failed' : 'no-coverage',
      requested: detail.length, loaded: loaded.length, failed, resolutionM: grid.getResolution(z),
      nacResolutionM: this.nac && this.resolution <= 32 ? nacGrid.getResolution(nacGrid.getZForResolution(this.resolution, 1)) : undefined }
    const signature = JSON.stringify(status)
    const changed = signature !== this.lastStatus
    if (changed) { this.lastStatus = signature; this.onStatus(status) }
    const firstPaint = painted && overviewReady && !this.firstPaintReported
    if (!changed && !firstPaint && performance.now() - this.lastMetricsAt < 150) return
    if (firstPaint) this.firstPaintReported = true
    this.lastMetricsAt = performance.now()
    // Retain metadata without retaining decoded images; OL owns the bounded LRU.
    for (const [key, record] of this.records) if (!record.tile.deref() && !['loading', 'queued'].includes(record.state)) this.records.delete(key)
    const records = [...this.records.values()]
    this.onMetrics({ status, painted, tiles: records.map(({ layer, coord, state, requestMs, bytes, cache, nodata }) => ({ layer, coord, state, requestMs, bytes, cache, nodata })),
      decodedBytesEstimate: records.filter((r) => r.tile.deref()?.getState() === TileState.LOADED).reduce((sum, r) => sum + (r.layer === NAC ? 375 ** 2 : 240 ** 2) * 4, 0),
      alphaMaskBytes: records.reduce((sum, r) => sum + (r.mask?.byteLength ?? 0), 0), activeRequests: this.active })
  }

  dispose() {
    this.disposed = true
    clearTimeout(this.debounce)
    unByKey(this.listeners.flat())
    for (const record of this.records.values()) record.controller.abort()
    for (const layer of this.layers.values()) { this.map.removeLayer(layer); layer.getSource()?.dispose(); layer.dispose() }
    this.records.clear(); this.queue = []
  }
}
