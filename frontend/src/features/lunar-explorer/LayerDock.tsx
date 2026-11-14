import { ExternalLink, Layers, Loader2, Maximize2, Mountain } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator, Skeleton, Switch } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import type { MapLayer, TerrainCatalog } from '@/services/contracts'

import type { MapLayers } from './LunarMap'

/** Requested raster kinds (Phase 5A brief). A kind is "live" only if the backend lists a renderable layer for it. */
export const REQUESTED_KINDS = ['imagery', 'elevation', 'hillshade', 'slope', 'psr'] as const

export function isRenderable(l: MapLayer) {
  return l.role !== 'REFERENCE_DOC' && l.access_mode !== 'documentation_only'
}

export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error'

function Row({
  label,
  sub,
  checked,
  onChange,
  disabled,
  status,
  dot,
  hint,
  busy,
}: {
  label: string
  sub?: React.ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  status: 'live' | 'unavailable'
  dot?: string
  hint?: string
  busy?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex items-center gap-2 py-1', disabled && 'opacity-75')} title={hint}>
      {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className={cn('text-[12.5px] leading-snug', disabled ? 'text-fg-3' : 'text-fg-2')}>{label}</div>
        <div className={cn('flex flex-wrap items-center gap-x-1.5 font-mono text-[9.5px] tracking-wide uppercase', status === 'live' ? 'text-success' : 'text-fg-3')}>
          {status === 'live' ? t('explorer2.live') : t('explorer2.unavailable')}
          {sub}
        </div>
      </div>
      {busy && <Loader2 className="size-3.5 animate-spin text-fg-3" aria-label={t('common.loading')} />}
      <Switch checked={checked && !disabled} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}

const ROLE_TONE: Record<string, 'success' | 'cyan' | 'neutral'> = {
  SCIENCE_VALIDATED_LOCAL: 'success',
  MAP_VISUALIZATION_ONLY: 'cyan',
  REFERENCE_DOC: 'neutral',
}

export function LayerDock({
  layers,
  onChange,
  catalog,
  catalogLoading,
  mapLayers,
  mapLayersLoading,
  previewStatus,
  onFitTiles,
  onFitPolar,
}: {
  layers: MapLayers
  onChange: (l: MapLayers) => void
  catalog: TerrainCatalog | undefined
  catalogLoading: boolean
  mapLayers: MapLayer[]
  mapLayersLoading: boolean
  previewStatus: Record<string, PreviewStatus>
  onFitTiles: () => void
  onFitPolar: () => void
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<MapLayers>) => onChange({ ...layers, ...patch })
  const tiles = catalog?.tiles ?? []
  const renderable = mapLayers.filter(isRenderable)
  const references = mapLayers.filter((l) => !isRenderable(l))
  const kindTitle: Record<string, string> = {
    imagery: t('explorer2.layer.basemap'),
    elevation: t('explorer2.layer.lola_elevation'),
    hillshade: t('explorer2.layer.hillshade'),
    slope: t('explorer2.layer.slope'),
    psr: t('explorer2.layer.psr'),
  }
  const missingKinds = REQUESTED_KINDS.filter((k) => !renderable.some((l) => l.kind === k))

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-1">
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4 text-cyan" aria-hidden /> {t('explorer.layers')}
        </CardTitle>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="size-8" onClick={onFitPolar} aria-label={t('explorer2.fitPolar')} title={t('explorer2.fitPolar')}>
            <Maximize2 />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" onClick={onFitTiles} disabled={!tiles.length} aria-label={t('explorer2.fitTiles')} title={t('explorer2.fitTiles')}>
            <Mountain />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="sel-eyebrow pt-1 text-[10px]">{t('explorer2.rasterGroup')}</div>
        {mapLayersLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            {renderable.map((l) => {
              const st = previewStatus[l.id] ?? 'idle'
              return (
                <Row
                  key={l.id}
                  label={l.title}
                  status="live"
                  busy={st === 'loading'}
                  checked={Boolean(layers.rasters[l.id])}
                  onChange={(v) => set({ rasters: { ...layers.rasters, [l.id]: v } })}
                  hint={`${l.attribution} · ${l.crs_summary}`}
                  sub={
                    <>
                      <Badge tone={ROLE_TONE[l.role] ?? 'neutral'} className="px-1.5 py-0 text-[8.5px]">
                        {l.role === 'SCIENCE_VALIDATED_LOCAL' ? t('explorer2.roleScience') : t('explorer2.roleViz')}
                      </Badge>
                      {l.resolution_m != null && <span className="normal-case">{l.resolution_m} m/px</span>}
                      {st === 'error' && <span className="text-danger normal-case">{t('explorer2.previewFailed')}</span>}
                    </>
                  }
                />
              )
            })}
            {missingKinds.map((k) => (
              <Row key={k} label={kindTitle[k] ?? k} status="unavailable" disabled checked={false} onChange={() => undefined} hint={t('explorer2.noVerifiedSource')} />
            ))}
          </>
        )}
        <p className="text-[11px] leading-relaxed text-fg-3">{t('explorer2.rasterNote')}</p>

        <Separator />
        <div className="sel-eyebrow pt-1 text-[10px]">{t('explorer2.dataGroup')}</div>
        {catalogLoading ? (
          <Skeleton className="h-7" />
        ) : (
          <Row
            label={t('explorer2.layer.coverage', { n: tiles.length })}
            dot="bg-[#6EE7B7]"
            status={tiles.length ? 'live' : 'unavailable'}
            disabled={!tiles.length}
            checked={layers.coverage}
            onChange={(v) => set({ coverage: v })}
            hint={catalog?.citation}
          />
        )}
        <Row label={t('explorer.layerReference')} dot="bg-cyan" status="live" checked={layers.reference} onChange={(v) => set({ reference: v })} />
        <Row label={t('explorer.layerCustom')} dot="bg-gold" status="live" checked={layers.custom} onChange={(v) => set({ custom: v })} />

        <Separator />
        <div className="sel-eyebrow pt-1 text-[10px]">{t('explorer2.guideGroup')}</div>
        <Row label={t('explorer.layerGraticule')} status="live" checked={layers.graticule} onChange={(v) => set({ graticule: v })} />
        <Row label={t('explorer.layerLabels')} status="live" checked={layers.labels} onChange={(v) => set({ labels: v })} />

        {references.length > 0 && (
          <>
            <Separator />
            <div className="sel-eyebrow pt-1 text-[10px]">{t('explorer2.referenceGroup')}</div>
            <ul className="space-y-1">
              {references.map((l) => (
                <li key={l.id}>
                  <a href={l.product_page} target="_blank" rel="noreferrer noopener" className="flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-2 hover:text-cyan">
                    <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden /> {l.title}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
