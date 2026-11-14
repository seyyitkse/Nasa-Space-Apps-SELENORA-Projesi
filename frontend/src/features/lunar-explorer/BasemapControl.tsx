import { Camera, ImageOff, Mountain } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { HelpTip } from '@/components/shared/Explain'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { MapLayer } from '@/services/contracts'

import { isRenderable } from './LayerDock'

export type BasemapChoice = 'photo' | 'hillshade' | 'none'

/**
 * Photography (LROC) / hillshade selector. A photographic option is enabled ONLY
 * when the backend catalogue lists a renderable `imagery` layer (served through
 * the same georeferenced /maps/preview contract). No decorative substitute is ever
 * shown; until then the option is disabled with the reason.
 */
/** Prefer allow-listed polar WMS imagery (Phase 5E `lroc-wac-south-summer`); never pick REFERENCE_DOC. */
export function pickBasemapLayers(layers: MapLayer[]) {
  const renderable = layers.filter(isRenderable)
  const imagery = renderable.filter((l) => l.kind === 'imagery')
  return {
    photo:
      imagery.find((l) => l.id === 'lroc-wac-south-summer') ??
      imagery.find((l) => l.access_mode === 'wms_allowlisted') ??
      imagery[0] ??
      null,
    hillshade: renderable.find((l) => l.kind === 'hillshade') ?? null,
  }
}

export function BasemapControl({
  layers,
  choice,
  onChoice,
  opacity,
  onOpacity,
  nac = false,
  onNac,
}: {
  layers: MapLayer[]
  choice: BasemapChoice
  onChoice: (c: BasemapChoice) => void
  opacity: number
  onOpacity: (v: number) => void
  nac?: boolean
  onNac?: (value: boolean) => void
}) {
  const { t } = useTranslation()
  const { photo, hillshade } = pickBasemapLayers(layers)
  const options: { key: BasemapChoice; icon: typeof Camera; label: string; layer: MapLayer | null | 'none' }[] = [
    { key: 'photo', icon: Camera, label: t('lroc.photo'), layer: photo },
    { key: 'hillshade', icon: Mountain, label: t('lroc.hillshade'), layer: hillshade },
    { key: 'none', icon: ImageOff, label: t('lroc.none'), layer: 'none' },
  ]
  return (
    <div className="pointer-events-auto w-[min(14.5rem,calc(100vw-5rem))] space-y-1.5 rounded-xl border border-line-strong bg-bg/90 p-2 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="sel-eyebrow text-[10px]">{t('lroc.label')}</span>
        <HelpTip label={t('lroc.label')} text={photo ? t('lroc.helpAvailable') : `${t('lroc.photoUnavailable')} ${t('lroc.helpUnavailable')}`} />
      </div>
      <div role="radiogroup" aria-label={t('lroc.label')} className="grid grid-cols-3 gap-1">
        {options.map((o) => {
          const disabled = o.layer === null
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={choice === o.key}
              aria-disabled={disabled}
              disabled={disabled}
              title={disabled ? (o.key === 'photo' ? t('lroc.photoUnavailable') : t('explorer2.noVerifiedSource')) : undefined}
              onClick={() => onChoice(o.key)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                choice === o.key ? 'border-cyan/60 bg-cyan/10 text-fg' : 'border-line text-fg-2 hover:text-fg',
              )}
            >
              <o.icon className="size-3.5" aria-hidden />
              {o.label}
            </button>
          )
        })}
      </div>
      {!photo && <p className="text-[10.5px] leading-snug text-fg-3">{t('lroc.photoShort')}</p>}
      {choice === 'photo' && photo && (
        <p className="text-[10.5px] leading-snug text-warning/90" role="note">
          <span className="sm:hidden">{t('lroc.staticShort')}</span>
          <span className="hidden sm:inline">{t('lroc.staticIllumination')}</span>
        </p>
      )}
      {choice === 'photo' && onNac && (
        <label className="flex items-center gap-2 text-[10.5px] text-fg-2">
          <input type="checkbox" checked={nac} onChange={(event) => onNac(event.target.checked)} />
          {t('imageryQuality.nacOption')}
        </label>
      )}
      {choice === 'photo' && photo?.attribution && (
        <p className="truncate text-[9.5px] leading-snug text-fg-3" title={photo.attribution}>
          {photo.attribution}
        </p>
      )}
      {choice !== 'none' && (
        <div>
          <div className="mb-1 flex justify-between text-[10.5px] text-fg-3">
            <span>{t('lroc.opacity')}</span>
            <span className="font-mono">{Math.round(opacity * 100)}%</span>
          </div>
          <Slider aria-label={t('lroc.opacity')} min={10} max={100} step={5} value={[Math.round(opacity * 100)]} onValueChange={([v]) => onOpacity((v ?? 85) / 100)} />
        </div>
      )}
    </div>
  )
}
