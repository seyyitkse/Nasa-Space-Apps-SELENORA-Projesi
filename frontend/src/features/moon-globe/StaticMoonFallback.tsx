import { ImageOff, MonitorX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { MOON_ASSET, MOON_FALLBACK_MAP } from './asset'
import type { GlobeSite } from './MoonScene'

/**
 * Accessible static fallback (no WebGL, or the NASA GLB is not installed):
 * NASA's official equirectangular LRO colour map (SVS 4720, centred on 0°E) with the
 * research sites plotted by plain equirectangular placement (x ∝ lon, y ∝ −lat).
 */
export function StaticMoonFallback({
  reason,
  sites,
  selectedId,
  onSelect,
  className,
}: {
  reason: 'webgl' | 'missing'
  sites: GlobeSite[]
  selectedId: string | null
  onSelect: (id: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <figure className={cn('relative flex flex-col overflow-hidden rounded-2xl border border-line bg-[#05070f]', className)} data-testid="moon-static-fallback">
      <div className="flex items-start gap-2 border-b border-line bg-bg-2/60 px-3 py-2 text-[12px] text-fg-2" role="note">
        {reason === 'webgl' ? <MonitorX className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> : <ImageOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
        <span>
          {reason === 'webgl' ? t('moon.noWebgl') : t('moon.missingAsset')}
          {reason === 'missing' && <code className="ml-1 rounded bg-white/5 px-1 font-mono text-[11px]">npm run fetch:moon</code>}
        </span>
      </div>
      <div className="relative grid flex-1 place-items-center p-3">
        <div className="relative w-full" style={{ aspectRatio: `${MOON_FALLBACK_MAP.width} / ${MOON_FALLBACK_MAP.height}` }}>
          <img
            src={MOON_FALLBACK_MAP.url}
            alt={t('moon.fallbackAlt')}
            width={MOON_FALLBACK_MAP.width}
            height={MOON_FALLBACK_MAP.height}
            className="absolute inset-0 h-full w-full rounded-md object-cover"
            loading="lazy"
          />
          {/* Cardinal longitude ticks */}
          {[-180, -90, 0, 90, 180].map((lon) => (
            <span
              key={lon}
              className="absolute -top-0.5 -translate-x-1/2 -translate-y-full font-mono text-[9.5px] text-fg-3"
              style={{ left: `${((lon + 180) / 360) * 100}%` }}
              aria-hidden
            >
              {lon === 0 ? '0°' : `${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`}
            </span>
          ))}
          {sites.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-label={`${s.name} (${s.lat.toFixed(2)}°, ${s.lon.toFixed(2)}°)`}
              aria-pressed={s.id === selectedId}
              className={cn(
                'absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg focus-visible:ring-2 focus-visible:ring-cyan focus-visible:outline-none',
                s.slot === 'A' ? 'bg-cyan' : s.slot === 'B' ? 'bg-violet' : 'bg-gold',
                s.id === selectedId && 'ring-2 ring-white',
              )}
              style={{ left: `${((s.lon + 180) / 360) * 100}%`, top: `${((90 - s.lat) / 180) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <figcaption className="px-3 pb-2 text-[10.5px] leading-snug text-fg-3">
        {t('moon.fallbackCaption')}{' '}
        <a href={MOON_FALLBACK_MAP.sourcePage} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
          {MOON_FALLBACK_MAP.credit}
        </a>
        {reason === 'missing' && (
          <>
            {' · '}
            <a href={MOON_ASSET.sourcePage} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
              NASA SVS {MOON_ASSET.svsId}
            </a>
          </>
        )}
      </figcaption>
    </figure>
  )
}
