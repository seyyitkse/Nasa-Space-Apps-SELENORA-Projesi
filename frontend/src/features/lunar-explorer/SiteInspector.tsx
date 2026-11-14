import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Mountain, Plus, Rocket, SunMoon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { formatCoord } from '@/lib/format'
import { selenoraApi } from '@/services/selenoraApi'
import { type ResolvedSite, type SiteRef, useMissionStore } from '@/stores/missionStore'

import { formatDistance, greatCircleM } from './geo'

export interface DetailTarget {
  kind: 'reference' | 'custom' | 'picked'
  id: string | null
  name: string
  lat: number
  lon: number
  source?: string
  status?: string
}

function useCoverage(lat: number | undefined, lon: number | undefined) {
  return useQuery({
    queryKey: ['terrain-coverage', lat, lon],
    queryFn: () => selenoraApi.terrainCoverage(lat!, lon!),
    enabled: lat !== undefined && lon !== undefined,
    staleTime: 5 * 60_000,
    retry: 0,
  })
}

/** Real LOLA elevation lookup (GET /terrain/coverage). Shows "not covered" honestly. */
export function ElevationReadout({ lat, lon, compact = false }: { lat: number; lon: number; compact?: boolean }) {
  const { t } = useTranslation()
  const q = useCoverage(lat, lon)
  if (q.isPending) return <Skeleton className={compact ? 'h-5' : 'h-14'} />
  if (q.error)
    return <p className="text-[11px] text-fg-3">{t('explorer2.elevationUnavailable')}</p>
  const d = q.data
  if (compact)
    return (
      <span className="font-mono text-[11px] text-fg-2">
        {d.covered && d.surface_z_m != null ? `${d.surface_z_m.toFixed(1)} m · ${d.dem_site_id}` : t('explorer.terrainUncovered')}
      </span>
    )
  return (
    <div className="space-y-2 rounded-lg border border-line bg-bg-2/60 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-fg-2">
          <Mountain className="size-3.5 text-[#6EE7B7]" aria-hidden /> {t('explorer.terrainElevation')}
        </span>
        <Badge tone={d.covered ? 'success' : 'warning'}>{d.covered ? t('explorer.terrainCovered') : t('explorer.terrainUncovered')}</Badge>
      </div>
      {d.covered && (
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px]">
          <dt className="text-fg-3">{t('explorer2.surfaceHeight')}</dt>
          <dd className="text-right text-fg">{d.surface_z_m != null ? `${d.surface_z_m.toFixed(1)} m` : '—'}</dd>
          <dt className="text-fg-3">{t('explorer.terrainDataset')}</dt>
          <dd className="truncate text-right text-fg" title={d.dem_file ?? ''}>{d.dem_site_id}</dd>
          <dt className="text-fg-3">{t('explorer2.stereo')}</dt>
          <dd className="text-right text-fg-2">
            {(d.stereo_x_m / 1000).toFixed(3)}, {(d.stereo_y_m / 1000).toFixed(3)} km
          </dd>
        </dl>
      )}
      <p className="text-[10.5px] leading-relaxed text-fg-3">{d.covered ? t('explorer2.heightNote') : d.message}</p>
    </div>
  )
}

export function SiteInspector({
  target,
  siteA,
  siteB,
  onSavePicked,
}: {
  target: DetailTarget | null
  siteA: ResolvedSite | null
  siteB: ResolvedSite | null
  onSavePicked: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const draft = useMissionStore((s) => s.draft)
  const assign = useMissionStore((s) => s.assignSite)
  const update = useMissionStore((s) => s.updateDraft)

  const ref: SiteRef | null = target?.id && target.kind !== 'picked' ? { kind: target.kind, id: target.id } : null
  const slot = ref && draft.siteA?.id === ref.id ? 'siteA' : ref && draft.siteB?.id === ref.id ? 'siteB' : null

  const openPlanner = (s: 'siteA' | 'siteB') => {
    if (!ref) return
    assign(s, ref)
    navigate('/planner')
  }

  const sep = siteA && siteB ? greatCircleM(siteA.latitude_deg, siteA.longitude_deg, siteB.latitude_deg, siteB.longitude_deg) : null

  return (
    <Card className="h-full">
      <CardContent className="pt-4">
        <Tabs defaultValue="site">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="site" className="flex-1">{t('explorer.details')}</TabsTrigger>
            <TabsTrigger value="ab" className="flex-1">{t('explorer2.abTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="site">
            {!target ? (
              <p className="text-[13px] leading-relaxed text-fg-3">{t('explorer.noSelection')}</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={target.kind === 'reference' ? 'cyan' : target.kind === 'custom' ? 'gold' : 'neutral'}>
                      {target.kind === 'picked' ? t('explorer.pickedPoint') : target.kind}
                    </Badge>
                    {slot && <Badge tone="violet">{t('explorer.assigned', { slot: t(`common.${slot}`) })}</Badge>}
                    {target.status && <Badge tone="warning">{target.status}</Badge>}
                  </div>
                  <h3 className="mt-2 font-display text-base font-semibold text-fg">{target.name}</h3>
                  <p className="mt-0.5 font-mono text-[11px] text-fg-3">
                    {target.lat.toFixed(5)}°, {target.lon.toFixed(5)}°E
                  </p>
                </div>
                <ElevationReadout lat={target.lat} lon={target.lon} />
                {target.source && (
                  <div>
                    <div className="sel-eyebrow text-[10px]">{t('explorer.dataSource')}</div>
                    <p className="mt-1 text-xs leading-relaxed text-fg-2">{target.source}</p>
                  </div>
                )}
                <Separator />
                {target.kind === 'picked' ? (
                  <Button variant="secondary" className="w-full" onClick={onSavePicked}>
                    <Plus /> {t('explorer.saveAsSite')}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="sel-eyebrow text-[10px]">{t('explorer.addToMission')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant={slot === 'siteA' ? 'primary' : 'outline'} size="sm" onClick={() => ref && assign('siteA', ref)}>
                        {t('explorer.asSiteA')}
                      </Button>
                      <Button variant={slot === 'siteB' ? 'violet' : 'outline'} size="sm" onClick={() => ref && assign('siteB', ref)}>
                        {t('explorer.asSiteB')}
                      </Button>
                    </div>
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => openPlanner(slot ?? 'siteA')}>
                      <Rocket /> {t('explorer2.openPlanner')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ab">
            <div className="space-y-3">
              {(['siteA', 'siteB'] as const).map((s) => {
                const site = s === 'siteA' ? siteA : siteB
                return (
                  <div key={s} className="rounded-xl border border-line bg-bg-2/50 p-3">
                    <div className={s === 'siteA' ? 'sel-eyebrow text-[10px] text-cyan' : 'sel-eyebrow text-[10px] text-violet'}>
                      {t(`common.${s}`)}
                    </div>
                    {site ? (
                      <>
                        <div className="mt-1 truncate text-[13px] font-medium">{site.name}</div>
                        <div className="font-mono text-[11px] text-fg-3">{formatCoord(site.latitude_deg, site.longitude_deg, 3)}</div>
                        <div className="mt-1.5">
                          <ElevationReadout lat={site.latitude_deg} lon={site.longitude_deg} compact />
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-fg-3">{t('overview.notAssigned')}</p>
                    )}
                  </div>
                )
              })}
              {sep !== null && (
                <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="rounded-lg border border-line bg-bg-2/60 p-2.5">
                    <dt className="text-[10.5px] text-fg-3">{t('explorer2.separation')}</dt>
                    <dd className="mt-0.5 text-fg">{formatDistance(sep)}</dd>
                  </div>
                  <div className="rounded-lg border border-line bg-bg-2/60 p-2.5">
                    <dt className="text-[10.5px] text-fg-3">{t('explorer2.sphere')}</dt>
                    <dd className="mt-0.5 text-fg-2">R 1737.4 km</dd>
                  </div>
                </dl>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!draft.siteA && !draft.siteB}
                  onClick={() => update({ siteA: draft.siteB, siteB: draft.siteA })}
                >
                  <ArrowLeftRight /> {t('explorer2.swap')}
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/planner">
                    <Rocket /> {t('nav.planner')}
                  </Link>
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="w-full" asChild>
                <Link to="/simulator">
                  <SunMoon /> {t('nav.simulator')}
                </Link>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
