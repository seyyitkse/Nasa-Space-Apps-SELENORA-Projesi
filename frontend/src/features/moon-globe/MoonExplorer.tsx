import { useReducedMotion } from 'motion/react'
import { CircleAlert, Grid3x3, Landmark, Loader2, Minus, Mountain, Orbit, Plus, RotateCcw } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HelpTip } from '@/components/shared/Explain'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { MOON_ASSET, MoonAssetError } from './asset'
import { defaultQuality, fmtLat, fmtLon, loadMoonBuffer, maxTextureSize, webglAvailable } from './globeUtils'
import { LANDMARKS } from './landmarks'
import type { LoadedMoon, MoonQuality } from './loadMoon'
import type { CameraCommand, CameraIntent, CameraState, GlobeSite } from './MoonScene'
import { StaticMoonFallback } from './StaticMoonFallback'
import type { ViewPreset } from './orientation'

const MoonScene = lazy(() => import('./MoonScene'))

/** User Timing marks (DevTools → Performance) for load/parse/first-frame measurements. */
const mark = (step: string) => performance.mark?.(`selenora-moon:${step}`)

type Phase = { kind: 'loading'; loaded: number; total: number } | { kind: 'parsing' } | { kind: 'ready' } | { kind: 'error'; error: MoonAssetError }

export interface MoonExplorerProps {
  sites: GlobeSite[]
  selectedId: string | null
  onSelect: (id: string) => void
  command: CameraCommand | null
  onCommand: (c: CameraIntent) => void
  onCamera?: (c: CameraState) => void
  compact?: boolean
  /** Shown when the camera reaches the global model's resolution limit. */
  onOpenLocalTerrain?: () => void
  className?: string
}

export function MoonExplorer({ sites, selectedId, onSelect, command, onCommand, onCamera, compact = false, onOpenLocalTerrain, className }: MoonExplorerProps) {
  const { t } = useTranslation()
  const reduce = useReducedMotion() ?? false
  const [webgl] = useState(() => (typeof document === 'undefined' ? false : webglAvailable()))
  const [quality, setQuality] = useState<MoonQuality>(defaultQuality)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', loaded: 0, total: MOON_ASSET.bytes })
  const [moon, setMoon] = useState<LoadedMoon | null>(null)
  const [grid, setGrid] = useState(false)
  const [landmarks, setLandmarks] = useState(!compact)
  const [cam, setCam] = useState<CameraState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const moonRef = useRef<LoadedMoon | null>(null)

  useEffect(() => {
    if (!webgl) return
    let cancelled = false
    setPhase({ kind: 'loading', loaded: 0, total: MOON_ASSET.bytes })
    mark('start')
    loadMoonBuffer((loaded, total) => !cancelled && setPhase({ kind: 'loading', loaded, total }))
      .then(async (buf) => {
        if (cancelled) return
        mark('fetched')
        setPhase({ kind: 'parsing' })
        const { parseMoon } = await import('./loadMoon')
        const loaded = await parseMoon(buf, quality, maxTextureSize() || 4096)
        if (cancelled) {
          loaded.dispose()
          return
        }
        moonRef.current?.dispose()
        moonRef.current = loaded
        mark('parsed')
        setMoon(loaded)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const err = e instanceof MoonAssetError ? e : new MoonAssetError('parse', e instanceof Error ? e.message : String(e))
        setPhase({ kind: 'error', error: err })
      })
    return () => {
      cancelled = true
    }
  }, [webgl, quality, attempt])

  // GPU cleanup on unmount.
  useEffect(
    () => () => {
      moonRef.current?.dispose()
      moonRef.current = null
    },
    [],
  )

  const handleCamera = useCallback(
    (c: CameraState) => {
      setCam(c)
      onCamera?.(c)
    },
    [onCamera],
  )
  const onReady = useCallback(() => {
    mark('ready')
    setPhase({ kind: 'ready' })
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    const step = Math.PI / 18
    const map: Record<string, CameraIntent> = {
      ArrowLeft: { kind: 'orbit', dAzimuth: -step, dPolar: 0 },
      ArrowRight: { kind: 'orbit', dAzimuth: step, dPolar: 0 },
      ArrowUp: { kind: 'orbit', dAzimuth: 0, dPolar: -step },
      ArrowDown: { kind: 'orbit', dAzimuth: 0, dPolar: step },
      '+': { kind: 'zoom', factor: 0.85 },
      '=': { kind: 'zoom', factor: 0.85 },
      '-': { kind: 'zoom', factor: 1.18 },
      n: { kind: 'preset', preset: 'near' },
      f: { kind: 'preset', preset: 'far' },
      s: { kind: 'preset', preset: 'south' },
    }
    const c = map[e.key]
    if (c) {
      e.preventDefault()
      onCommand(c)
    }
  }

  if (!webgl) return <StaticMoonFallback reason="webgl" sites={sites} selectedId={selectedId} onSelect={onSelect} className={className} />
  if (phase.kind === 'error' && phase.error.kind === 'missing')
    return <StaticMoonFallback reason="missing" sites={sites} selectedId={selectedId} onSelect={onSelect} className={className} />

  const nearLimit = cam !== null && cam.distance < 1.75
  const presets: { key: ViewPreset; label: string }[] = [
    { key: 'near', label: t('moon.near') },
    { key: 'far', label: t('moon.far') },
    { key: 'south', label: t('moon.south') },
  ]

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-line bg-[#05070f]', className)}>
      <div
        role="application"
        tabIndex={0}
        aria-roledescription={t('moon.globeRole')}
        aria-label={t('moon.globeAria')}
        aria-describedby="moon-kbd-help"
        onKeyDown={onKey}
        className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
        data-testid="moon-canvas-host"
      >
        {moon && (
          <Suspense fallback={null}>
            <MoonScene
              moon={moon}
              sites={sites}
              selectedId={selectedId}
              onSelect={onSelect}
              landmarks={landmarks ? LANDMARKS : []}
              showGraticule={grid}
              command={command}
              reducedMotion={reduce}
              dpr={quality === 'reduced' ? [1, 1] : [1, 1.5]}
              onCamera={handleCamera}
              onReady={onReady}
            />
          </Suspense>
        )}
      </div>
      <p id="moon-kbd-help" className="sr-only">
        {t('moon.kbdHelp')}
      </p>

      {/* Loading / error overlay */}
      {phase.kind !== 'ready' && (
        <div className="absolute inset-0 grid place-items-center bg-[#05070f]/80 p-6 text-center" role="status" aria-live="polite">
          {phase.kind === 'error' ? (
            <div className="max-w-sm space-y-3">
              <CircleAlert className="mx-auto size-6 text-danger" aria-hidden />
              <p className="text-sm text-fg">{t('moon.loadError')}</p>
              <p className="font-mono text-[11px] text-fg-3">{phase.error.message}</p>
              <Button size="sm" variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
                <RotateCcw /> {t('common.retry')}
              </Button>
            </div>
          ) : (
            <div className="w-64 space-y-3">
              <Loader2 className="mx-auto size-6 animate-spin text-cyan motion-reduce:animate-none" aria-hidden />
              <p className="text-sm text-fg">{phase.kind === 'parsing' ? t('moon.preparing') : t('moon.downloading')}</p>
              {phase.kind === 'loading' && (
                <>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-label={t('moon.downloading')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((100 * phase.loaded) / (phase.total || 1))}
                  >
                    <div className="h-full bg-cyan transition-[width]" style={{ width: `${Math.min(100, (100 * phase.loaded) / (phase.total || 1))}%` }} />
                  </div>
                  <p className="font-mono text-[11px] text-fg-3">
                    {(phase.loaded / 1e6).toFixed(1)} / {(phase.total / 1e6).toFixed(1)} MB · NASA SVS {MOON_ASSET.svsId}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Top-left: view presets */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5" role="group" aria-label={t('moon.views')}>
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onCommand({ kind: 'preset', preset: p.key })}
            className="rounded-lg border border-line-strong bg-bg/80 px-2.5 py-1.5 text-[11.5px] text-fg-2 backdrop-blur transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:outline-none"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Right: zoom + layers */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <IconBtn label={t('moon.zoomIn')} onClick={() => onCommand({ kind: 'zoom', factor: 0.8 })}>
          <Plus className="size-4" />
        </IconBtn>
        <IconBtn label={t('moon.zoomOut')} onClick={() => onCommand({ kind: 'zoom', factor: 1.25 })}>
          <Minus className="size-4" />
        </IconBtn>
        <IconBtn label={t('moon.grid')} pressed={grid} onClick={() => setGrid((g) => !g)}>
          <Grid3x3 className="size-4" />
        </IconBtn>
        <IconBtn label={t('moon.landmarks')} pressed={landmarks} onClick={() => setLandmarks((l) => !l)}>
          <Landmark className="size-4" />
        </IconBtn>
      </div>

      {/* Resolution limit → honest hand-off to the local LOLA viewer */}
      {nearLimit && phase.kind === 'ready' && (
        <div className="absolute inset-x-3 bottom-14 mx-auto max-w-md rounded-xl border border-gold/40 bg-bg/90 p-3 text-[12px] leading-snug text-fg-2 backdrop-blur" role="note">
          <span className="font-medium text-gold">{t('moon.limitTitle')}</span> {t('moon.limitBody', { km: MOON_ASSET.kmPerTexelSouthPole })}
          {onOpenLocalTerrain && (
            <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={onOpenLocalTerrain}>
              <Mountain /> {t('moon.openLocal')}
            </Button>
          )}
        </div>
      )}

      {/* Bottom bar: readout, quality, attribution */}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-gradient-to-t from-bg/95 to-transparent px-3 pt-6 pb-2 text-[10.5px] text-fg-3">
        <span className="font-mono" aria-live="off" data-testid="moon-readout">
          <Orbit className="mr-1 inline size-3" aria-hidden />
          {cam ? t('moon.readout', { lat: fmtLat(cam.lat), lon: fmtLon(cam.lon), alt: Math.round((cam.distance - 1) * 1737.4).toLocaleString() }) : t('moon.readoutIdle')}
        </span>
        <span className="flex items-center gap-2">
          {!compact && (
            <label className="flex items-center gap-1">
              <span>{t('moon.quality')}</span>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as MoonQuality)}
                className="rounded border border-line bg-bg px-1 py-0.5 text-[10.5px] text-fg-2"
              >
                <option value="standard">{t('moon.qualityStandard')}</option>
                <option value="reduced">{t('moon.qualityReduced')}</option>
              </select>
            </label>
          )}
          <a href={MOON_ASSET.sourcePage} target="_blank" rel="noreferrer" className="whitespace-nowrap underline decoration-dotted underline-offset-2 hover:text-fg-2">
            {t('moon.credit')}
          </a>
          <HelpTip label={t('moon.aboutModel')} text={t('moon.aboutModelText', { km: MOON_ASSET.kmPerTexelGlobal })} />
        </span>
      </div>
    </div>
  )
}

function IconBtn({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-lg border bg-bg/80 backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:outline-none',
        pressed ? 'border-cyan/60 text-cyan' : 'border-line-strong text-fg-2 hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
