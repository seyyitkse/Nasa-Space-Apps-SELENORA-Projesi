import { ArrowRight, Box } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { useGlobeSites } from '@/hooks/useApi'

import { MOON_ASSET } from './asset'
import { webglAvailable } from './globeUtils'
import { MoonExplorer } from './MoonExplorer'
import type { CameraCommand, CameraIntent, GlobeSite } from './MoonScene'
import { StaticMoonFallback } from './StaticMoonFallback'

/** Still frame rendered by SELENORA from the NASA GLB (committed, ~60 kB). Shown before the 13.8 MB model is requested. */
export const MOON_POSTER = '/nasa/svs-14959/selenora-still-nearside.webp'

/**
 * Mission Control hero: an attributed poster first; the NASA GLB is only downloaded
 * after the user explicitly opens the interactive globe.
 */
export function MoonHero() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = useGlobeSites()
  const [open, setOpen] = useState(false)
  const [webgl] = useState(() => (typeof document === 'undefined' ? false : webglAvailable()))
  const seq = useRef(0)
  const [command, setCommand] = useState<CameraCommand | null>(null)
  const send = useCallback((c: CameraIntent) => {
    seq.current += 1
    setCommand({ ...c, seq: seq.current })
  }, [])
  const sites: GlobeSite[] = useMemo(
    () => (data?.items ?? []).map((s) => ({ id: s.id, name: s.name, lat: s.latitude_deg, lon: s.longitude_deg, slot: null })),
    [data],
  )
  const goSite = (id: string) => navigate(`/moon?site=${encodeURIComponent(id)}`)

  if (!webgl)
    return <StaticMoonFallback reason="webgl" sites={sites} selectedId={null} onSelect={goSite} className="mx-auto w-full max-w-[520px]" />

  if (open)
    return (
      <div className="mx-auto w-full max-w-[520px] space-y-2">
        <MoonExplorer compact sites={sites} selectedId={null} onSelect={goSite} command={command} onCommand={send} className="aspect-square w-full" />
        <Button asChild variant="secondary" size="sm" className="w-full">
          <Link to="/moon">
            {t('moon.openFull')} <ArrowRight />
          </Link>
        </Button>
      </div>
    )

  return (
    <figure className="mx-auto w-full max-w-[460px]" data-testid="moon-hero-poster">
      <div className="relative aspect-square w-full">
        <img
          src={MOON_POSTER}
          alt={t('moon.posterAlt')}
          className="absolute inset-0 h-full w-full rounded-full object-cover shadow-[0_0_80px_-20px_rgba(86,217,233,0.35)]"
          width={960}
          height={960}
          decoding="async"
        />
        <div className="absolute inset-x-0 bottom-[8%] flex flex-col items-center gap-2">
          <Button variant="primary" onClick={() => setOpen(true)} aria-describedby="moon-hero-size">
            <Box /> {t('moon.open3d')}
          </Button>
          <span id="moon-hero-size" className="rounded-full bg-bg/80 px-2 py-0.5 text-[10.5px] text-fg-2 backdrop-blur">
            {t('moon.downloadSize', { mb: (MOON_ASSET.bytes / 1e6).toFixed(1) })}
          </span>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-[10.5px] leading-snug text-fg-3">
        {t('moon.posterCaption')}{' '}
        <a href={MOON_ASSET.sourcePage} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
          NASA SVS {MOON_ASSET.svsId}
        </a>{' '}
        · {t('moon.posterUnlit')}
      </figcaption>
    </figure>
  )
}
