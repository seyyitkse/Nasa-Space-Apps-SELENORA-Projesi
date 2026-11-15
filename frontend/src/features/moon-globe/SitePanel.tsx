import { ArrowRight, Compass, Database, Globe2, MapPin, Mountain, Rocket, SunMoon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ArtemisRegionMeta } from '@/services/contracts'
import type { GlobeSiteMarker, LandingSite } from '@/types/api'

/** SitePanel accepts Planner LandingSite or Phase 6B GlobeSiteMarker (compatible fields). */
type MoonSite = LandingSite | GlobeSiteMarker

import { MOON_ASSET } from './asset'
import { fmtLat, fmtLon } from './globeUtils'

export type Coverage = 'covered' | 'not-covered' | 'unknown'

export function SiteList({
  sites,
  slotOf,
  coverage,
  selectedId,
  onSelect,
}: {
  sites: MoonSite[]
  slotOf: (id: string) => 'A' | 'B' | null
  coverage: (id: string) => Coverage
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <ul className="space-y-1" aria-label={t('moon.sitesTitle')}>
      {sites.map((s) => {
        const slot = slotOf(s.id)
        const sel = s.id === selectedId
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={sel}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:outline-none',
                sel ? 'border-cyan/50 bg-cyan/10' : 'border-transparent hover:border-line hover:bg-white/[0.03]',
              )}
            >
              <span
                className={cn('size-2 shrink-0 rounded-full', slot === 'A' ? 'bg-cyan' : slot === 'B' ? 'bg-violet' : 'bg-gold')}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{s.name}</span>
                <span className="block font-mono text-[10.5px] text-fg-3">
                  {fmtLat(s.latitude_deg)} · {fmtLon(s.longitude_deg)}
                </span>
              </span>
              {slot && <Badge tone={slot === 'A' ? 'cyan' : 'violet'}>{slot}</Badge>}
              {coverage(s.id) === 'covered' && (
                <Badge tone="success" title={t('moon.lolaCovered')}>
                  5 m
                </Badge>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function SiteCard({
  site,
  slot,
  coverage,
  onAssign,
  onOpenTerrain,
  onFly,
}: {
  site: MoonSite
  slot: 'A' | 'B' | null
  coverage: Coverage
  onAssign: (slot: 'siteA' | 'siteB') => void
  onOpenTerrain: () => void
  onFly: () => void
}) {
  const { t } = useTranslation()
  const approximate = site.coordinate_status.startsWith('APPROXIMATE')
  const userDefined = site.coordinate_status === 'USER_DEFINED'
  const lolaTile = 'local_lola_tile' in site ? site.local_lola_tile : null
  return (
    <section className="space-y-3" aria-labelledby="moon-site-title" data-testid="moon-site-card">
      <div>
        <div className="sel-eyebrow text-[10px] text-cyan">{t('moon.selectedSite')}</div>
        <h3 id="moon-site-title" className="mt-1 font-display text-base font-semibold text-fg">
          {site.name}
        </h3>
        <p className="font-mono text-[12px] text-fg-2">
          {fmtLat(site.latitude_deg)}, {fmtLon(site.longitude_deg)}
          <span className="text-fg-3"> · {site.latitude_deg.toFixed(2)}°, {site.longitude_deg.toFixed(2)}°</span>
        </p>
      </div>

      <dl className="space-y-2 text-[12px]">
        <div>
          <dt className="text-fg-3">{t('moon.referenceStatus')}</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={userDefined ? 'gold' : approximate ? 'warning' : 'neutral'}>
              {userDefined ? t('moon.create.userDefined') : approximate ? t('moon.approxResearch') : site.coordinate_status}
            </Badge>
            <span className="text-fg-3">{t('moon.notNasaRegion')}</span>
          </dd>
          <dd className="mt-1 text-[11px] leading-snug text-fg-3">{site.coordinate_source}</dd>
        </div>
        <div>
          <dt className="text-fg-3">{t('moon.dataAvailability')}</dt>
          <dd className="mt-1 space-y-1">
            <Avail
              icon={Mountain}
              ok={coverage === 'covered' ? true : coverage === 'not-covered' ? false : null}
              label={t('moon.availLola')}
              detail={
                coverage === 'covered'
                  ? lolaTile
                    ? `${t('moon.availLolaYes')} (${lolaTile})`
                    : t('moon.availLolaYes')
                  : coverage === 'not-covered'
                    ? t('moon.availLolaNo')
                    : t('moon.availUnknown')
              }
            />
            <Avail icon={SunMoon} ok label={t('moon.availHorizons')} detail={t('moon.availHorizonsDetail')} />
            <Avail icon={Globe2} ok label={t('moon.availGlobe')} detail={t('moon.availGlobeDetail', { km: MOON_ASSET.kmPerTexelSouthPole })} />
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant={slot === 'A' ? 'primary' : 'secondary'} onClick={() => onAssign('siteA')} aria-pressed={slot === 'A'}>
          <MapPin /> {slot === 'A' ? t('moon.isSiteA') : t('moon.setA')}
        </Button>
        <Button size="sm" variant={slot === 'B' ? 'primary' : 'secondary'} onClick={() => onAssign('siteB')} aria-pressed={slot === 'B'}>
          <MapPin /> {slot === 'B' ? t('moon.isSiteB') : t('moon.setB')}
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Button size="sm" variant="ghost" onClick={onFly} className="justify-start">
          <Compass /> {t('moon.flyTo')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenTerrain} className="justify-start" disabled={coverage === 'not-covered'} title={coverage === 'not-covered' ? t('moon.availLolaNo') : undefined}>
          <Mountain /> {t('moon.openLocal')}
        </Button>
        <Button asChild size="sm" variant="ghost" className="justify-start">
          <Link to={`/explorer?site=${encodeURIComponent(site.id)}`}>
            <Database /> {t('moon.openExplorer')}
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="justify-start">
          <Link to={`/planner?site=${encodeURIComponent(site.id)}`}>
            <Rocket /> {t('moon.openPlanner')} <ArrowRight className="ml-auto" />
          </Link>
        </Button>
      </div>
    </section>
  )
}

function Avail({ icon: Icon, ok, label, detail }: { icon: typeof Mountain; ok: boolean | null; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn('mt-0.5 size-3.5 shrink-0', ok === true ? 'text-success' : ok === false ? 'text-fg-3' : 'text-warning')} aria-hidden />
      <span>
        <span className="text-fg">{label}</span> <span className="text-fg-3">— {detail}</span>
      </span>
    </div>
  )
}

/** NASA Artemis III region names: listed with provenance, never plotted (no official digitised geometry). */
export function NasaRegions({ regions, sourceUrl }: { regions: ArtemisRegionMeta[]; sourceUrl?: string }) {
  const { t } = useTranslation()
  if (regions.length === 0) return null
  return (
    <section aria-labelledby="moon-nasa-regions" className="space-y-2">
      <h3 id="moon-nasa-regions" className="text-[12.5px] font-medium text-fg">
        {t('moon.nasaRegionsTitle')}
      </h3>
      <p className="text-[11px] leading-snug text-fg-3">{t('moon.nasaRegionsNote')}</p>
      <ul className="flex flex-wrap gap-1">
        {regions.map((r) => (
          <li key={r.id}>
            <Badge tone="neutral">{r.name}</Badge>
          </li>
        ))}
      </ul>
      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] text-cyan underline decoration-dotted underline-offset-2">
          {t('moon.nasaRegionsSource')}
        </a>
      )}
    </section>
  )
}
