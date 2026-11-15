import { Check, ChevronRight, MapPinPlus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/misc'
import { useGlobeSites } from '@/hooks/useApi'
import { cn } from '@/lib/utils'
import { MissionPanel } from '@/features/lunar-missions/MissionPanel'
import {
  missionToGlobeMarker,
  type MissionGlobeMarker,
  type MissionItem,
} from '@/features/lunar-missions/types'
import { HIGH_MODEL_ID, MOON_MODELS } from '@/features/moon-globe/asset'
import { customAsLandingSite } from '@/features/moon-globe/customSiteAdapter'
import { MoonExplorer } from '@/features/moon-globe/MoonExplorer'
import type { CameraCommand, CameraIntent, DraftPick, GlobeSite } from '@/features/moon-globe/MoonScene'
import { isValidLatLon, validateCustomSiteName } from '@/features/moon-globe/pickHelpers'
import { type Coverage, NasaRegions, SiteCard, SiteList } from '@/features/moon-globe/SitePanel'
import { Terrain3DPanel } from '@/features/terrain3d/Terrain3DPanel'
import { useArtemisRegions, useCapabilities, useTerrainCatalog } from '@/services/contracts'
import type { LandingSite } from '@/types/api'
import { useMissionStore } from '@/stores/missionStore'

type Step = 0 | 1 | 2 | 3 | 4 | 5

export default function MoonPage() {
  const { t } = useTranslation()
  // Phase 6C: 3D Moon markers come from /api/v1/globe/sites (Planner keeps /api/v1/sites).
  const { data, isPending, error } = useGlobeSites()
  const sites = useMemo(() => data?.items ?? [], [data])
  const draft = useMissionStore((s) => s.draft)
  const customSites = useMissionStore((s) => s.customSites)
  const assignSite = useMissionStore((s) => s.assignSite)
  const addCustomSite = useMissionStore((s) => s.addCustomSite)
  const caps = useCapabilities()
  const artemis = useArtemisRegions(caps.has('artemisRegions'))
  const catalog = useTerrainCatalog(caps.has('terrainCatalog'))
  const tiles = useMemo(() => catalog.data?.tiles ?? [], [catalog.data])

  const [params, setParams] = useSearchParams()
  const selectedId = params.get('site')
  const customAsSites = useMemo(() => customSites.map(customAsLandingSite), [customSites])
  const selectedRef = sites.find((s) => s.id === selectedId) ?? null
  const selectedCustom = customAsSites.find((s) => s.id === selectedId) ?? null
  const selected: LandingSite | null = selectedRef ?? selectedCustom
  const selectedKind: 'reference' | 'custom' | null = selectedRef ? 'reference' : selectedCustom ? 'custom' : null

  const [terrainOpen, setTerrainOpen] = useState(false)
  const [atSouth, setAtSouth] = useState(false)
  const terrainRef = useRef<HTMLDivElement>(null)

  const [createMode, setCreateMode] = useState(false)
  const [draftPick, setDraftPick] = useState<DraftPick | null>(null)
  const [pointName, setPointName] = useState('')
  const [nameError, setNameError] = useState<'empty' | 'duplicate' | 'coords' | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Phase 7E — optional Lunar Missions layer (global 3D Moon only).
  const [missionsLayer, setMissionsLayer] = useState(false)
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [missionMarkers, setMissionMarkers] = useState<MissionGlobeMarker[]>([])
  const [missionItems, setMissionItems] = useState<MissionItem[]>([])

  const seq = useRef(0)
  const [command, setCommand] = useState<CameraCommand | null>(null)
  const send = useCallback((c: CameraIntent) => {
    seq.current += 1
    if (c.kind === 'preset') setAtSouth(c.preset === 'south')
    setCommand({ ...c, seq: seq.current })
  }, [])

  // Deep link (/moon?site=…): fly to the site once, as soon as the site list is known.
  const deepLinked = useRef(false)
  useEffect(() => {
    if (deepLinked.current || !selected) return
    deepLinked.current = true
    send({ kind: 'site', lat: selected.latitude_deg, lon: selected.longitude_deg })
  }, [selected, send])

  useEffect(() => {
    if (draftPick) {
      nameInputRef.current?.focus()
    }
  }, [draftPick])

  useEffect(() => {
    if (!savedFlash) return
    const id = window.setTimeout(() => setSavedFlash(null), 3500)
    return () => window.clearTimeout(id)
  }, [savedFlash])

  // Prefer Phase 6B local_lola_* flags over N+1 /terrain/coverage round-trips.
  const coverage = useCallback(
    (id: string): Coverage => {
      const s = sites.find((x) => x.id === id)
      if (s) return s.local_lola_coverage ? 'covered' : 'not-covered'
      if (customSites.some((c) => c.id === id)) return 'unknown'
      return 'unknown'
    },
    [sites, customSites],
  )
  const slotOf = useCallback(
    (id: string): 'A' | 'B' | null =>
      draft.siteA?.id === id ? 'A' : draft.siteB?.id === id ? 'B' : null,
    [draft.siteA, draft.siteB],
  )

  const globeSites: GlobeSite[] = useMemo(
    () => [
      ...sites.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.latitude_deg,
        lon: s.longitude_deg,
        slot: slotOf(s.id),
        kind: 'reference' as const,
      })),
      ...customSites.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.latitude_deg,
        lon: s.longitude_deg,
        slot: slotOf(s.id),
        kind: 'custom' as const,
      })),
    ],
    [sites, customSites, slotOf],
  )

  const select = useCallback(
    (id: string) => {
      const ref = sites.find((x) => x.id === id)
      const custom = customSites.find((x) => x.id === id)
      const lat = ref?.latitude_deg ?? custom?.latitude_deg
      const lon = ref?.longitude_deg ?? custom?.longitude_deg
      deepLinked.current = true
      setTerrainOpen(false)
      setCreateMode(false)
      setDraftPick(null)
      setNameError(null)
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          n.set('site', id)
          return n
        },
        { replace: true },
      )
      if (lat !== undefined && lon !== undefined) send({ kind: 'site', lat, lon })
    },
    [sites, customSites, setParams, send],
  )

  const cancelCreate = useCallback(() => {
    setCreateMode(false)
    setDraftPick(null)
    setPointName('')
    setNameError(null)
  }, [])

  const startCreate = useCallback(() => {
    setCreateMode(true)
    setDraftPick(null)
    setPointName('')
    setNameError(null)
    setTerrainOpen(false)
    setSavedFlash(null)
  }, [])

  const onSurfacePick = useCallback(
    (lat: number, lon: number) => {
      if (!isValidLatLon(lat, lon)) {
        setNameError('coords')
        return
      }
      setDraftPick({ lat, lon })
      setNameError(null)
      if (!pointName.trim()) {
        setPointName(t('moon.create.defaultName', { n: customSites.length + 1 }))
      }
      send({ kind: 'site', lat, lon })
    },
    [customSites.length, pointName, send, t],
  )

  const savePoint = useCallback(() => {
    if (!draftPick || !isValidLatLon(draftPick.lat, draftPick.lon)) {
      setNameError('coords')
      return
    }
    const existing = [...sites.map((s) => s.name), ...customSites.map((s) => s.name)]
    const checked = validateCustomSiteName(pointName, existing)
    if (!checked.ok) {
      setNameError(checked.error)
      return
    }
    const created = addCustomSite({
      name: checked.name,
      latitude_deg: draftPick.lat,
      longitude_deg: draftPick.lon,
    })
    setSavedFlash(created.name)
    setCreateMode(false)
    setDraftPick(null)
    setPointName('')
    setNameError(null)
    // Select without relying on a stale customSites closure from before addCustomSite.
    deepLinked.current = true
    setTerrainOpen(false)
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.set('site', created.id)
        return n
      },
      { replace: true },
    )
    send({ kind: 'site', lat: created.latitude_deg, lon: created.longitude_deg })
  }, [draftPick, pointName, sites, customSites, addCustomSite, setParams, send])

  const openTerrain = useCallback(() => {
    if (!selected) return
    setTerrainOpen(true)
    requestAnimationFrame(() => terrainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [selected])

  const selectMission = useCallback(
    (mission: MissionItem) => {
      setSelectedMissionId(mission.id)
      const marker = missionToGlobeMarker(mission)
      if (marker) send({ kind: 'site', lat: marker.lat, lon: marker.lon })
    },
    [send],
  )

  const selectMissionById = useCallback(
    (id: string) => {
      const mission = missionItems.find((m) => m.id === id)
      if (mission) selectMission(mission)
      else setSelectedMissionId(id)
    },
    [missionItems, selectMission],
  )

  const onMissionMarkersChange = useCallback((markers: MissionGlobeMarker[], items: MissionItem[]) => {
    setMissionMarkers(markers)
    setMissionItems(items)
  }, [])

  const step: Step = terrainOpen ? 4 : selected ? 3 : atSouth ? 2 : 1
  const steps = [
    { label: t('moon.journey.control'), to: '/' },
    { label: t('moon.journey.globe'), action: () => send({ kind: 'preset', preset: 'near' }) },
    { label: t('moon.journey.south'), action: () => send({ kind: 'preset', preset: 'south' }) },
    { label: t('moon.journey.site'), action: selected ? () => select(selected.id) : undefined },
    { label: t('moon.journey.terrain'), action: selected ? openTerrain : undefined },
    { label: t('moon.journey.analysis'), to: draft.siteA && draft.siteB ? '/planner' : '/mission' },
  ]

  const regions = artemis.data?.current_2024_shortlist ?? artemis.data?.regions ?? []
  const regionSource = artemis.data?.official_sources.find((s) => s.id === 'nasa-regions-2024')?.url
  const disclaimer = data?.sites_disclaimer || data?.disclaimer

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="sel-eyebrow text-[10px] text-cyan">{t('moon.eyebrow')}</div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{t('moon.title')}</h1>
          <p className="max-w-3xl text-sm text-fg-2">{t('moon.lede')}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 sm:mt-0">
          {createMode ? (
            <Button type="button" variant="outline" size="sm" onClick={cancelCreate} data-testid="moon-create-cancel-mode">
              <X /> {t('common.cancel')}
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={startCreate} data-testid="moon-create-start">
              <MapPinPlus /> {t('moon.create.start')}
            </Button>
          )}
        </div>
      </header>

      {savedFlash && (
        <p className="rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-[12.5px] text-fg" role="status" aria-live="polite" data-testid="moon-create-saved">
          {t('moon.create.saved', { name: savedFlash })}
        </p>
      )}

      <nav aria-label={t('moon.journey.label')} className="-mx-1 overflow-x-auto px-1">
        <ol className="flex min-w-max items-center gap-1 text-[12px]">
          {steps.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'current' : 'todo'
            const cls = cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors',
              state === 'current' ? 'border-cyan/60 bg-cyan/10 text-fg' : state === 'done' ? 'border-line text-fg-2' : 'border-line/60 text-fg-3',
            )
            const inner = (
              <>
                <span className={cn('grid size-4 place-items-center rounded-full text-[9.5px]', state === 'done' ? 'bg-success/20 text-success' : 'bg-white/5')}>
                  {state === 'done' ? <Check className="size-2.5" aria-hidden /> : i + 1}
                </span>
                {s.label}
              </>
            )
            return (
              <li key={i} className="flex items-center gap-1" aria-current={state === 'current' ? 'step' : undefined}>
                {s.to ? (
                  <Link to={s.to} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" className={cn(cls, !s.action && 'cursor-not-allowed opacity-60')} onClick={s.action} disabled={!s.action}>
                    {inner}
                  </button>
                )}
                {i < steps.length - 1 && <ChevronRight className="size-3.5 text-fg-3" aria-hidden />}
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <MoonExplorer
          sites={globeSites}
          selectedId={selectedId}
          onSelect={select}
          pickMode={createMode && !draftPick}
          onSurfacePick={onSurfacePick}
          draftPick={draftPick}
          command={command}
          onCommand={send}
          onOpenLocalTerrain={selected ? openTerrain : undefined}
          tiles={tiles}
          missions={missionMarkers}
          selectedMissionId={selectedMissionId}
          onSelectMission={selectMissionById}
          className="h-[min(60vh,560px)] min-h-[340px] lg:h-[min(72vh,640px)]"
        />

        <Card className="space-y-4 p-4">
          <MissionPanel
            enabled={missionsLayer}
            selectedId={selectedMissionId}
            onSelect={selectMission}
            onToggleLayer={(on) => {
              setMissionsLayer(on)
              if (!on) {
                setMissionMarkers([])
                setSelectedMissionId(null)
              }
            }}
            onMarkersChange={onMissionMarkersChange}
          />
          <div className="border-t border-line" />
          {draftPick ? (
            <section className="space-y-3" aria-labelledby="moon-create-title" data-testid="moon-create-dialog">
              <div>
                <div className="sel-eyebrow text-[10px] text-cyan">{t('moon.create.eyebrow')}</div>
                <h3 id="moon-create-title" className="mt-1 font-display text-base font-semibold text-fg">
                  {t('moon.create.title')}
                </h3>
                <p className="mt-1 text-[12px] leading-snug text-fg-3">{t('moon.create.persistNote')}</p>
              </div>
              <div>
                <Label htmlFor="moon-point-name">{t('moon.create.name')}</Label>
                <Input
                  id="moon-point-name"
                  ref={nameInputRef}
                  value={pointName}
                  maxLength={120}
                  aria-invalid={nameError === 'empty' || nameError === 'duplicate'}
                  aria-describedby={nameError ? 'moon-point-name-err' : undefined}
                  onChange={(e) => {
                    setPointName(e.target.value)
                    setNameError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      savePoint()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelCreate()
                    }
                  }}
                  data-testid="moon-create-name"
                />
                <FieldError id="moon-point-name-err">
                  {nameError === 'empty'
                    ? t('moon.create.errEmpty')
                    : nameError === 'duplicate'
                      ? t('moon.create.errDuplicate')
                      : nameError === 'coords'
                        ? t('moon.create.errCoords')
                        : undefined}
                </FieldError>
              </div>
              <div className="rounded-xl border border-line bg-bg-2/60 px-3 py-2 font-mono text-[12px] text-fg-2" data-testid="moon-create-coords">
                <div>
                  {t('moon.create.lat')}: {draftPick.lat.toFixed(5)}°
                </div>
                <div>
                  {t('moon.create.lon')}: {draftPick.lon.toFixed(5)}°E
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={cancelCreate} data-testid="moon-create-cancel">
                  {t('common.cancel')}
                </Button>
                <Button type="button" variant="primary" onClick={savePoint} data-testid="moon-create-save">
                  {t('moon.create.save')}
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => setDraftPick(null)}>
                {t('moon.create.repick')}
              </Button>
            </section>
          ) : selected ? (
            <SiteCard
              site={selected}
              slot={slotOf(selected.id)}
              coverage={coverage(selected.id)}
              onAssign={(slot) => assignSite(slot, { kind: selectedKind ?? 'reference', id: selected.id })}
              onOpenTerrain={openTerrain}
              onFly={() => send({ kind: 'site', lat: selected.latitude_deg, lon: selected.longitude_deg })}
            />
          ) : (
            <p className="text-[12.5px] leading-relaxed text-fg-2">{createMode ? t('moon.create.pickHint') : t('moon.pickPrompt')}</p>
          )}
          <div>
            <h2 className="mb-1.5 text-[12.5px] font-medium text-fg">{t('moon.sitesTitle')}</h2>
            {isPending ? (
              <Skeleton className="h-40" />
            ) : error ? (
              <p className="text-[12px] text-danger">{t('common.apiUnreachable')}</p>
            ) : (
              <>
                <SiteList sites={sites} slotOf={slotOf} coverage={coverage} selectedId={selectedId} onSelect={select} />
                {customAsSites.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <h3 className="text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">{t('explorer.custom')}</h3>
                      <Badge tone="gold">{customAsSites.length}</Badge>
                    </div>
                    <SiteList sites={customAsSites} slotOf={slotOf} coverage={coverage} selectedId={selectedId} onSelect={select} />
                    <p className="mt-1.5 text-[10.5px] leading-snug text-fg-3">{t('moon.create.persistNote')}</p>
                  </div>
                )}
              </>
            )}
            {disclaimer && <p className="mt-2 text-[10.5px] leading-snug text-fg-3">{disclaimer}</p>}
          </div>
          <NasaRegions regions={regions} sourceUrl={regionSource} />
        </Card>
      </div>

      <p className="text-[11.5px] leading-relaxed text-fg-3">{t('moon.scienceNote')}</p>

      {selected && terrainOpen && (
        <div ref={terrainRef} className="scroll-mt-20 space-y-2">
          <h2 className="font-display text-lg font-semibold">{t('moon.localTitle', { name: selected.name })}</h2>
          <p className="text-[12.5px] text-fg-2">{t('moon.localLede')}</p>
          <ResolutionLadder />
          <Terrain3DPanel key={selected.id} latitude={selected.latitude_deg} longitude={selected.longitude_deg} siteLabel={selected.name} autoOpen />
        </div>
      )}
    </div>
  )
}

/** Global globe tiers vs local LOLA: real ground sizes, on a log scale. */
function ResolutionLadder() {
  const { t } = useTranslation()
  const rows = [
    { label: t('moon.ladderStandard'), m: MOON_MODELS.small.kmPerTexel.southPole * 1000, tone: 'bg-fg-3' },
    { label: t('moon.ladderHigh'), m: MOON_MODELS[HIGH_MODEL_ID].kmPerTexel.southPole * 1000, tone: 'bg-violet' },
    { label: t('moon.ladderLola'), m: 5, tone: 'bg-cyan' },
  ]
  const max = Math.log10(rows[0]!.m)
  return (
    <figure className="sel-card space-y-2 p-3" aria-labelledby="ladder-title" data-testid="resolution-ladder">
      <figcaption id="ladder-title" className="text-[12.5px] font-medium text-fg">
        {t('moon.ladderTitle')}
      </figcaption>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[11.5px]">
            <span className="text-fg-2">{r.label}</span>
            <span className="h-2 rounded-full bg-white/5">
              <span className={cn('block h-2 rounded-full', r.tone)} style={{ width: `${Math.max(2, (Math.log10(r.m) / max) * 100)}%` }} />
            </span>
            <span className="text-right font-mono text-fg-2">{r.m >= 1000 ? `${(r.m / 1000).toFixed(1)} km` : `${r.m} m`}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-snug text-fg-3">{t('moon.ladderNote', { x: Math.round((MOON_MODELS[HIGH_MODEL_ID].kmPerTexel.southPole * 1000) / 5) })}</p>
      <p className="text-[10.5px] text-fg-3">{t('moon.tileFootprint')} · {t('moon.logScale')}</p>
    </figure>
  )
}
