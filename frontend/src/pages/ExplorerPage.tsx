import { AlertTriangle, Crosshair } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { PageHeader } from '@/components/shared/PageHeader'
import { PageTransition } from '@/components/shared/PageTransition'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { useSites } from '@/hooks/useApi'
import { formatCoord } from '@/lib/format'
import {
  CoordinateForm,
  DetailsPanel,
  type DetailTarget,
  LayerPanel,
  SiteList,
} from '@/features/lunar-explorer/ExplorerPanels'
import { LunarMap, type MapLayers, type MapSite } from '@/features/lunar-explorer/LunarMap'
import { isInMapRegion } from '@/features/lunar-explorer/projection'
import { useMissionStore } from '@/stores/missionStore'

export default function ExplorerPage() {
  const { t } = useTranslation()
  const { data, isPending, error, refetch } = useSites()
  const custom = useMissionStore((s) => s.customSites)
  const addCustom = useMissionStore((s) => s.addCustomSite)
  const removeCustom = useMissionStore((s) => s.removeCustomSite)
  const assignSite = useMissionStore((s) => s.assignSite)
  const draft = useMissionStore((s) => s.draft)

  const [params, setParams] = useSearchParams()
  const selectedId = params.get('site')
  const setSelectedId = useCallback(
    (id: string | null) =>
      setParams((p) => {
        if (id) p.set('site', id)
        else p.delete('site')
        return p
      }, { replace: true }),
    [setParams],
  )
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null)
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null)
  const [layers, setLayers] = useState<MapLayers>({ graticule: true, reference: true, custom: true, labels: true })

  const reference = useMemo(() => data?.items ?? [], [data])
  const mapSites: MapSite[] = useMemo(
    () => [
      ...reference.map((s) => ({ ...s, kind: 'reference' as const })),
      ...custom.map((s) => ({ ...s, kind: 'custom' as const })),
    ],
    [reference, custom],
  )

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
    if (c) return { kind: 'custom', id: c.id, name: c.name, lat: c.latitude_deg, lon: c.longitude_deg, source: 'User input' }
    if (picked) return { kind: 'picked', id: null, name: formatCoord(picked.lat, picked.lon, 3), lat: picked.lat, lon: picked.lon }
    return null
  }, [reference, custom, selectedId, picked])

  const assignedSlot =
    target?.id && draft.siteA?.id === target.id
      ? 'siteA'
      : target?.id && draft.siteB?.id === target.id
        ? 'siteB'
        : null

  const handleAdd = (s: { name: string; lat: number; lon: number }) => {
    const created = addCustom({ name: s.name, latitude_deg: s.lat, longitude_deg: s.lon })
    setPicked(null)
    setSelectedId(created.id)
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow="LRO · LOLA · JPL Horizons"
        title={t('explorer.title')}
        description={t('explorer.description')}
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <div className="order-2 space-y-5 xl:order-1">
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
          <LayerPanel layers={layers} onChange={setLayers} />
        </div>

        <section className="order-1 xl:order-2" aria-label={t('explorer.title')}>
          <div className="sel-card relative h-[58vh] min-h-[380px] overflow-hidden xl:h-[calc(100dvh-220px)] xl:min-h-[560px]">
            <LunarMap
              sites={mapSites}
              selectedId={selectedId}
              picked={picked}
              layers={layers}
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
            <div className="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-4rem)] items-start gap-2 rounded-lg border border-warning/25 bg-bg/85 px-3 py-2 text-[11px] leading-snug text-fg-2 backdrop-blur">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
              <span>{t('explorer.baseRasterMissing')}</span>
            </div>
            <div
              className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-2 rounded-lg border border-line bg-bg/85 px-3 py-1.5 font-mono text-[11px] text-fg-2 backdrop-blur"
              aria-live="off"
            >
              <Crosshair className="size-3.5 text-cyan" aria-hidden />
              <span className="text-fg-3">{t('explorer.cursor')}</span>
              {cursor ? formatCoord(cursor.lat, cursor.lon, 3) : '—'}
            </div>
          </div>
          {target && !isInMapRegion(target.lat) && (
            <p className="mt-2 text-xs text-warning">{t('explorer.outsideMap')}</p>
          )}
        </section>

        <div className="order-3">
          <DetailsPanel
            target={target}
            assignedSlot={assignedSlot}
            onAssign={(slot) => {
              if (!target?.id || target.kind === 'picked') return
              assignSite(slot, { kind: target.kind, id: target.id })
            }}
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
      </div>
    </PageTransition>
  )
}
