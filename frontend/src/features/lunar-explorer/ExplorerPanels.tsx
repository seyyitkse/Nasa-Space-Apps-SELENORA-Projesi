import { Info, Layers, MapPin, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Separator, Skeleton, Switch } from '@/components/ui/misc'
import { formatCoord } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CustomSite } from '@/stores/missionStore'
import type { LandingSite } from '@/types/api'

import { type CoordinateErrors, parseCoordinates } from './coordinates'
import type { MapLayers } from './LunarMap'

export function SiteList({
  reference,
  custom,
  loading,
  selectedId,
  onSelect,
  onRemove,
}: {
  reference: LandingSite[]
  custom: CustomSite[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}) {
  const { t } = useTranslation()
  const row = (id: string, name: string, lat: number, lon: number, tone: string, removable: boolean) => (
    <li key={id} className="group relative">
      <button
        type="button"
        onClick={() => onSelect(id)}
        aria-pressed={selectedId === id}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
          selectedId === id ? 'bg-violet/12 ring-1 ring-violet/40' : 'hover:bg-white/[0.04]',
        )}
      >
        <span className={cn('size-2 shrink-0 rounded-full', tone)} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-fg">{name}</span>
          <span className="block font-mono text-[10.5px] text-fg-3">{formatCoord(lat, lon, 2)}</span>
        </span>
      </button>
      {removable && (
        <button
          type="button"
          onClick={() => onRemove(id)}
          aria-label={`${t('common.remove')} ${name}`}
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </li>
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4 text-cyan" aria-hidden /> {t('explorer.sites')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="sel-eyebrow mb-1.5 text-[10px]">{t('explorer.reference')}</div>
          {loading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {reference.map((s) => row(s.id, s.name, s.latitude_deg, s.longitude_deg, 'bg-cyan', false))}
            </ul>
          )}
        </div>
        <Separator />
        <div>
          <div className="sel-eyebrow mb-1.5 text-[10px]">{t('explorer.custom')}</div>
          {custom.length === 0 ? (
            <p className="px-1 text-xs text-fg-3">{t('explorer.noCustom')}</p>
          ) : (
            <ul className="space-y-0.5">
              {custom.map((s) => row(s.id, s.name, s.latitude_deg, s.longitude_deg, 'bg-gold', true))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function CoordinateForm({ onAdd }: { onAdd: (s: { name: string; lat: number; lon: number }) => void }) {
  const { t } = useTranslation()
  const [values, setValues] = useState({ lat: '', lon: '', name: '' })
  const [errors, setErrors] = useState<CoordinateErrors>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseCoordinates(values)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    onAdd({ name: parsed.name, lat: parsed.lat, lon: parsed.lon })
    setValues({ lat: '', lon: '', name: '' })
  }

  const field = (key: 'lat' | 'lon' | 'name', label: string, placeholder: string, inputMode?: 'decimal') => (
    <div>
      <Label htmlFor={`coord-${key}`}>{label}</Label>
      <Input
        id={`coord-${key}`}
        value={values[key]}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `coord-${key}-err` : undefined}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
      <FieldError id={`coord-${key}-err`}>{errors[key] && t(`explorer.errors.${errors[key]}`)}</FieldError>
    </div>
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Plus className="size-4 text-cyan" aria-hidden /> {t('explorer.coordinates')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-3">
          {field('name', t('explorer.name'), t('explorer.namePlaceholder'))}
          <div className="grid grid-cols-2 gap-2">
            {field('lat', t('explorer.latitude'), '-89.50', 'decimal')}
            {field('lon', t('explorer.longitude'), '-140.00', 'decimal')}
          </div>
          <Button type="submit" variant="secondary" className="w-full">
            <Plus /> {t('explorer.addSite')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function LayerPanel({ layers, onChange }: { layers: MapLayers; onChange: (l: MapLayers) => void }) {
  const { t } = useTranslation()
  const items: { key: keyof MapLayers; label: string; dot?: string }[] = [
    { key: 'graticule', label: t('explorer.layerGraticule') },
    { key: 'reference', label: t('explorer.layerReference'), dot: 'bg-cyan' },
    { key: 'custom', label: t('explorer.layerCustom'), dot: 'bg-gold' },
    { key: 'labels', label: t('explorer.layerLabels') },
  ]
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4 text-cyan" aria-hidden /> {t('explorer.layers')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.map((it) => (
          <label key={it.key} className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-fg-2">
            <span className="flex items-center gap-2">
              {it.dot && <span className={cn('size-2 rounded-full', it.dot)} aria-hidden />}
              {it.label}
            </span>
            <Switch checked={layers[it.key]} onCheckedChange={(v) => onChange({ ...layers, [it.key]: v })} />
          </label>
        ))}
        <label className="flex items-center justify-between gap-3 text-[13px] text-fg-3">
          <span>{t('explorer.layerLola')}</span>
          <Switch checked={false} disabled aria-describedby="lola-note" />
        </label>
        <p id="lola-note" className="flex gap-1.5 text-[11px] leading-relaxed text-fg-3">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
          {t('explorer.baseRasterMissing')}
        </p>
      </CardContent>
    </Card>
  )
}

export interface DetailTarget {
  kind: 'reference' | 'custom' | 'picked'
  id: string | null
  name: string
  lat: number
  lon: number
  source?: string
  status?: string
}

export function DetailsPanel({
  target,
  onAssign,
  onSavePicked,
  assignedSlot,
}: {
  target: DetailTarget | null
  onAssign: (slot: 'siteA' | 'siteB') => void
  onSavePicked: () => void
  assignedSlot: 'siteA' | 'siteB' | null
}) {
  const { t } = useTranslation()
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle>{t('explorer.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        {!target ? (
          <p className="text-[13px] leading-relaxed text-fg-3">{t('explorer.noSelection')}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={target.kind === 'reference' ? 'cyan' : target.kind === 'custom' ? 'gold' : 'neutral'}>
                  {target.kind === 'picked' ? t('explorer.pickedPoint') : target.kind}
                </Badge>
                {assignedSlot && (
                  <Badge tone="violet">{t('explorer.assigned', { slot: t(`common.${assignedSlot}`) })}</Badge>
                )}
              </div>
              <h3 className="mt-2 font-display text-base font-semibold text-fg">{target.name}</h3>
            </div>
            <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className="rounded-lg border border-line bg-bg-2/60 p-2.5">
                <dt className="text-[10.5px] text-fg-3">{t('explorer.latitude')}</dt>
                <dd className="mt-0.5 text-fg">{target.lat.toFixed(4)}°</dd>
              </div>
              <div className="rounded-lg border border-line bg-bg-2/60 p-2.5">
                <dt className="text-[10.5px] text-fg-3">{t('explorer.longitude')}</dt>
                <dd className="mt-0.5 text-fg">{target.lon.toFixed(4)}°</dd>
              </div>
            </dl>
            {target.source && (
              <div>
                <div className="sel-eyebrow text-[10px]">{t('explorer.dataSource')}</div>
                <p className="mt-1 text-xs leading-relaxed text-fg-2">{target.source}</p>
              </div>
            )}
            {target.status && (
              <div className="flex items-center justify-between gap-2">
                <span className="sel-eyebrow text-[10px]">{t('explorer.status')}</span>
                <Badge tone="warning">{target.status}</Badge>
              </div>
            )}
            <Separator />
            {target.kind === 'picked' ? (
              <Button variant="secondary" className="w-full" onClick={onSavePicked}>
                <Plus /> {t('explorer.saveAsSite')}
              </Button>
            ) : (
              <div>
                <div className="sel-eyebrow mb-2 text-[10px]">{t('explorer.addToMission')}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={assignedSlot === 'siteA' ? 'primary' : 'outline'} size="sm" onClick={() => onAssign('siteA')}>
                    {t('explorer.asSiteA')}
                  </Button>
                  <Button variant={assignedSlot === 'siteB' ? 'violet' : 'outline'} size="sm" onClick={() => onAssign('siteB')}>
                    {t('explorer.asSiteB')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
