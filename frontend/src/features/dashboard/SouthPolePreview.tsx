import { ArrowRight, ChevronDown, Globe2, LocateFixed } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useSites } from '@/hooks/useApi'
import { HOMEPAGE_REFERENCE_SITES } from './homepageReferenceSites'
import {
  circleRadiusForLatitude, imagePlacement, PREVIEW_CENTER, PREVIEW_RADIUS,
  PREVIEW_SIZE, projectPreview,
} from './polarPreviewGeometry'

// Phase 5F.2 manifest z=1: exact SPS metre bounds, 240 px per quadrant.
const QUADRANTS = [
  { id: '1-1', bounds: [-384000, 0, 0, 384000] },
  { id: '2-1', bounds: [0, 0, 384000, 384000] },
  { id: '1-2', bounds: [-384000, -384000, 0, 0] },
  { id: '2-2', bounds: [0, -384000, 384000, 0] },
] as const
type Surface = 'wac' | 'lola' | 'missing'
type QuadrantState = { surface: Surface; ready: boolean }
const INITIAL_SURFACES = Object.fromEntries(QUADRANTS.map(({ id }) => [id, { surface: 'wac', ready: false }])) as Record<string, QuadrantState>

/** Homepage only: prepared NASA imagery, using Explorer's unchanged projection. */
export default function SouthPolePreview() {
  const { t } = useTranslation()
  const { data, isError } = useSites()
  const uid = useId().replaceAll(':', '')
  const clipId = `polar-cap-${uid}`
  const titleId = `polar-title-${uid}`
  const descriptionId = `polar-description-${uid}`
  const [surfaces, setSurfaces] = useState(INITIAL_SURFACES)
  const [activeSite, setActiveSite] = useState<string | null>(null)
  const startedAt = useRef<number | null>(null)
  const [firstSurfaceMs, setFirstSurfaceMs] = useState<number | null>(null)
  useLayoutEffect(() => { startedAt.current = performance.now() }, [])
  // An authoritative empty API catalog must not be replaced by the snapshot.
  const sites = data?.items ?? HOMEPAGE_REFERENCE_SITES
  const plotted = sites.flatMap((site) => {
    const point = projectPreview(site.longitude_deg, site.latitude_deg)
    return point ? [{ ...site, point }] : []
  })
  const states = Object.values(surfaces)
  const readyCount = states.filter((state) => state.ready).length
  const missingCount = states.filter((state) => state.surface === 'missing').length
  const hasLola = states.some((state) => state.surface === 'lola')
  const hasLolaReady = states.some((state) => state.surface === 'lola' && state.ready)
  const lolaPending = states.some((state) => state.surface === 'lola' && !state.ready)
  const pending = states.some((state) => !state.ready && state.surface !== 'missing')
  const selected = plotted.find((site) => site.id === activeSite)

  function loaded(id: string, surface: Surface) {
    setSurfaces((current) => current[id]?.surface === surface
      ? { ...current, [id]: { surface, ready: true } } : current)
    // Observable QA metric; no network telemetry or animation loop.
    setFirstSurfaceMs((previous) => previous ?? Math.round(performance.now() - startedAt.current!))
  }

  function failed(id: string, surface: Surface) {
    setSurfaces((current) => current[id]?.surface === surface
      ? { ...current, [id]: { surface: surface === 'wac' ? 'lola' : 'missing', ready: false } } : current)
  }

  return (
    <Card data-testid="south-pole-card" data-phase="6C.1" data-first-surface-ms={firstSurfaceMs ?? undefined}
      className="relative h-full overflow-hidden border-cyan/15 bg-[radial-gradient(ellipse_at_50%_35%,rgba(86,217,233,0.06),transparent_65%)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="sel-eyebrow text-[10px] text-cyan">{t('polarPreview.eyebrow')}</div>
          <h3 className="mt-1 font-display text-lg font-semibold">{t('polarPreview.title')}</h3>
        </div>
        <Badge tone="cyan">80–90°S · NASA</Badge>
      </div>

      <div className="relative mx-auto w-full max-w-[470px] px-1">
        <svg data-testid="south-polar-preview" viewBox={`0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`}
          className="block h-auto w-full" role="group" aria-labelledby={`${titleId} ${descriptionId}`}>
          <title id={titleId}>{t('polarPreview.aria')}</title>
          <desc id={descriptionId}>{t('polarPreview.description')}</desc>
          <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <circle cx={PREVIEW_CENTER} cy={PREVIEW_CENTER} r={PREVIEW_RADIUS} />
          </clipPath></defs>
          <circle cx={PREVIEW_CENTER} cy={PREVIEW_CENTER} r={PREVIEW_RADIUS + 13} fill="none" stroke="currentColor" className="text-cyan/10" />
          <circle cx={PREVIEW_CENTER} cy={PREVIEW_CENTER} r={PREVIEW_RADIUS + 3} fill="none" stroke="currentColor" className="text-cyan/40" />
          <g clipPath={`url(#${clipId})`}>
            <circle cx={PREVIEW_CENTER} cy={PREVIEW_CENTER} r={PREVIEW_RADIUS} fill="#111b28" />
            {QUADRANTS.map(({ id, bounds }) => {
              const { surface } = surfaces[id]!
              if (surface === 'missing') return null
              const layer = surface === 'wac' ? 'lroc-wac-south-summer' : 'ldem-80s-80mpp-hill'
              return <foreignObject key={`${id}-${surface}`} data-quadrant={id} data-layer={layer}
                {...imagePlacement(bounds)}>
                {/* HTML image events reliably include cached loads. The square
                    PNG and its exact square projected bounds have equal aspect. */}
                <img src={`/lunar-overview/${layer}-1-${id}.png`} alt="" width="240" height="240"
                  className="block h-full w-full" draggable={false}
                  onLoad={() => loaded(id, surface)} onError={() => failed(id, surface)} />
              </foreignObject>
            })}
            <g fill="none" stroke="#b7eff5" strokeOpacity="0.19" strokeWidth="0.8" pointerEvents="none">
              {[-85, -88].map((lat) => <circle key={lat} cx={PREVIEW_CENTER} cy={PREVIEW_CENTER} r={circleRadiusForLatitude(lat)} />)}
              {Array.from({ length: 12 }, (_, i) => {
                const point = projectPreview(i * 30, -80)!
                return <line key={i} x1={PREVIEW_CENTER} y1={PREVIEW_CENTER} x2={point[0]} y2={point[1]} />
              })}
            </g>
            <g fill="#d9f7fa" fillOpacity="0.8" fontSize="12" fontFamily="monospace" pointerEvents="none">
              <text x={PREVIEW_CENTER + 8} y={PREVIEW_CENTER - circleRadiusForLatitude(-85) + 15}>85°S</text>
              <text x={PREVIEW_CENTER + 8} y={PREVIEW_CENTER + circleRadiusForLatitude(-88) + 17}>88°S</text>
            </g>
            {plotted.map((site) => <Link key={site.id} to={`/explorer?site=${encodeURIComponent(site.id)}`}
              aria-label={site.name} data-site-id={site.id}
              onMouseEnter={() => setActiveSite(site.id)} onMouseLeave={() => setActiveSite(null)}
              onFocus={() => setActiveSite(site.id)} onBlur={() => setActiveSite(null)}
              className="group outline-none">
              <title>{site.name} · {site.latitude_deg}°, {site.longitude_deg}°</title>
              <circle cx={site.point[0]} cy={site.point[1]} r="7" fill="transparent" />
              <circle cx={site.point[0]} cy={site.point[1]} r={activeSite === site.id ? 5 : 3.5}
                fill="#56d9e9" stroke="#06121f" strokeWidth="1.5" />
              <circle cx={site.point[0]} cy={site.point[1]} r="10" fill="none" stroke="#fff" strokeWidth="1.5"
                pointerEvents="none" className="opacity-0 group-focus-visible:opacity-100 group-hover:opacity-100" />
            </Link>)}
          </g>
          <g fill="#a7b9cd" fontSize="14" fontFamily="monospace" textAnchor="middle" pointerEvents="none">
            <text x={PREVIEW_CENTER} y="30">0°E</text>
            <text x="691" y={PREVIEW_CENTER + 5}>90°E</text>
            <text x={PREVIEW_CENTER} y="704">180°</text>
            <text x="29" y={PREVIEW_CENTER + 5}>90°W</text>
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-x-10 bottom-2 min-h-5 text-center text-[11px] text-fg-2">
          {selected?.name ?? t('polarPreview.cap')}
        </div>
      </div>

      <div className="space-y-3 px-5 pb-5">
        <p role="status" className="min-h-4 text-xs text-fg-2">
          {missingCount > 0 ? t('polarPreview.missing')
            : lolaPending ? t('polarPreview.fallbackLoading')
              : hasLolaReady ? t('polarPreview.fallback')
              : pending && readyCount === 0 ? t('polarPreview.loading') : t('polarPreview.photo')}
        </p>
        <details className="group/sites rounded-xl border border-line bg-bg/35">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-xs text-fg-2 focus-visible:outline-2 focus-visible:outline-cyan">
            <LocateFixed className="size-3.5 text-cyan" aria-hidden />
            {t('polarPreview.sites', { n: plotted.length })}
            <ChevronDown className="ml-auto size-4 group-open/sites:rotate-180" aria-hidden />
          </summary>
          <ul className="grid gap-1 px-2 pb-2 sm:grid-cols-2">
            {plotted.map((site) => <li key={site.id}>
              <Link to={`/explorer?site=${encodeURIComponent(site.id)}`}
                onMouseEnter={() => setActiveSite(site.id)} onMouseLeave={() => setActiveSite(null)}
                onFocus={() => setActiveSite(site.id)} onBlur={() => setActiveSite(null)}
                className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-xs leading-snug text-fg-2 hover:bg-cyan/10 hover:text-cyan focus-visible:outline-2 focus-visible:outline-cyan">
                <span className="size-1.5 shrink-0 rounded-full bg-cyan" aria-hidden />{site.name}
              </Link>
            </li>)}
          </ul>
        </details>
        {!data && <p className="text-[11px] leading-relaxed text-fg-3">{t(isError ? 'polarPreview.snapshotOffline' : 'polarPreview.snapshot')}</p>}
        <p className="text-[11px] leading-relaxed text-fg-3">{t('polarPreview.disclaimer')}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11 motion-reduce:transition-none">
            <Link to="/explorer">{t('nav.explorer')} <ArrowRight aria-hidden /></Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 motion-reduce:transition-none">
            <Link to="/moon"><Globe2 aria-hidden />{t('polarPreview.open3d')}</Link>
          </Button>
        </div>
        <p className="border-t border-line pt-3 text-[10px] leading-relaxed text-fg-3">
          <a href="https://wms.lroc.asu.edu/lroc" target="_blank" rel="noreferrer" className="underline decoration-fg-3/40 underline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-cyan">NASA / GSFC / ASU · LROC WAC</a>
          {hasLola && <> · <a href="https://pgda.gsfc.nasa.gov/products/90" target="_blank" rel="noreferrer" className="underline underline-offset-2">NASA / GSFC · LOLA</a></>}
          {' · '}{t('polarPreview.sourceNote')}
        </p>
      </div>
    </Card>
  )
}
