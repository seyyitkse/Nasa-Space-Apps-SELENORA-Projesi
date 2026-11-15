import { ExternalLink, Rocket } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useMissions, useMissionsCapability } from './api'
import {
  MISSION_COLORS,
  missionToGlobeMarker,
  outcomeVisual,
  type MissionGlobeMarker,
  type MissionItem,
  type MissionProgram,
  type OutcomeFilter,
} from './types'

const PROGRAMS: (MissionProgram | 'ALL')[] = ['ALL', 'APOLLO', 'CLPS']
/** UI chips only — excludes the legacy combined unsuccessful_or_aborted bucket. */
type OutcomeChip = 'successful' | 'partial' | 'unsuccessful' | 'aborted' | 'planned'
const OUTCOMES: (OutcomeChip | 'ALL')[] = [
  'ALL',
  'successful',
  'partial',
  'unsuccessful',
  'aborted',
  'planned',
]

function fmtCoord(lat: number | null | undefined, lon: number | null | undefined): string {
  if (lat == null || lon == null) return '—'
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`
}

export interface MissionPanelProps {
  enabled: boolean
  selectedId: string | null
  onSelect: (mission: MissionItem) => void
  onToggleLayer: (on: boolean) => void
  /** Filtered globe markers for the current program/outcome chips. */
  onMarkersChange?: (markers: MissionGlobeMarker[], items: MissionItem[]) => void
  className?: string
}

export function MissionPanel({
  enabled,
  selectedId,
  onSelect,
  onToggleLayer,
  onMarkersChange,
  className,
}: MissionPanelProps) {
  const { t } = useTranslation()
  const caps = useMissionsCapability()
  const [program, setProgram] = useState<MissionProgram | 'ALL'>('ALL')
  const [outcome, setOutcome] = useState<OutcomeChip | 'ALL'>('ALL')

  const query = useMemo(
    () => ({
      program: program === 'ALL' ? null : program,
      outcome: (outcome === 'ALL' ? null : outcome) as OutcomeFilter | null,
    }),
    [program, outcome],
  )
  const { data, isPending, isError, refetch } = useMissions(query, enabled && caps.available !== false)

  const markers = useMemo(() => {
    if (!enabled || !data) return []
    return data.items.map(missionToGlobeMarker).filter((m): m is MissionGlobeMarker => m != null)
  }, [enabled, data])

  useEffect(() => {
    onMarkersChange?.(markers, data?.items ?? [])
  }, [markers, data, onMarkersChange])

  const selected = data?.items.find((m) => m.id === selectedId) ?? null

  return (
    <section className={cn('space-y-3', className)} aria-labelledby="missions-title" data-testid="missions-panel">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="sel-eyebrow text-[10px] text-cyan">{t('missions7e.eyebrow')}</div>
          <h3 id="missions-title" className="mt-1 flex items-center gap-1.5 font-display text-base font-semibold text-fg">
            <Rocket className="size-4 text-cyan" aria-hidden />
            {t('missions7e.title')}
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-fg-2">{t('missions7e.lede')}</p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-fg-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleLayer(e.target.checked)}
            data-testid="missions-layer-toggle"
            className="accent-cyan"
          />
          {t('missions7e.layer')}
        </label>
      </div>

      {caps.available === false && (
        <p className="rounded-lg border border-line bg-white/5 px-2.5 py-2 text-[12px] text-fg-3" role="status">
          {t('missions7e.unavailable')}
        </p>
      )}

      {enabled && caps.available !== false && (
        <>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('missions7e.filters.program')}>
            {PROGRAMS.map((p) => (
              <Chip key={p} active={program === p} onClick={() => setProgram(p)} testId={`missions-program-${p}`}>
                {p === 'ALL' ? t('missions7e.filters.all') : p}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('missions7e.filters.outcome')}>
            {OUTCOMES.map((o) => (
              <Chip key={o} active={outcome === o} onClick={() => setOutcome(o)} testId={`missions-outcome-${o}`}>
                {o === 'ALL' ? t('missions7e.filters.all') : t(`missions7e.outcome.${o}`)}
              </Chip>
            ))}
          </div>

          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-fg-3" aria-hidden>
            {(Object.keys(MISSION_COLORS) as (keyof typeof MISSION_COLORS)[]).map((k) => (
              <li key={k} className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full" style={{ background: MISSION_COLORS[k] }} />
                {t(`missions7e.outcome.${k}`)}
              </li>
            ))}
          </ul>

          {isPending && <p className="text-[12px] text-fg-3">{t('missions7e.loading')}</p>}
          {isError && (
            <div className="space-y-2">
              <p className="text-[12px] text-danger">{t('missions7e.error')}</p>
              <Button size="sm" variant="secondary" onClick={() => refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          )}

          {data && (
            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1" data-testid="missions-list">
              {data.items.map((m) => {
                const visual = outcomeVisual(m.landing_outcome)
                const hasMarker = missionToGlobeMarker(m) != null
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(m)}
                      data-testid={`mission-row-${m.id}`}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                        selectedId === m.id ? 'border-cyan/50 bg-cyan/10' : 'border-transparent hover:bg-white/5',
                      )}
                    >
                      <span
                        className={cn('mt-1.5 size-2 shrink-0 rounded-full', !hasMarker && 'opacity-40')}
                        style={{
                          background: MISSION_COLORS[visual],
                          boxShadow: m.marker_kind === 'PLANNED_TARGET_REGION' ? `0 0 0 1.5px ${MISSION_COLORS[visual]}` : undefined,
                          backgroundClip: m.marker_kind === 'PLANNED_TARGET_REGION' ? 'padding-box' : undefined,
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-fg">{m.name}</span>
                        <span className="block text-[10.5px] text-fg-3">
                          {m.program} · {t(`missions7e.outcome.${visual}`)}
                          {!hasMarker ? ` · ${t('missions7e.listOnly')}` : m.marker_kind === 'PLANNED_TARGET_REGION' ? ` · ${t('missions7e.plannedRegion')}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {selected && <MissionDetail mission={selected} />}

          {data && (
            <p className="text-[10.5px] leading-snug text-fg-3" data-testid="missions-disclaimer">
              {data.disclaimer}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'rounded-md border px-2 py-0.5 text-[10.5px] transition-colors',
        active ? 'border-cyan/50 bg-cyan/15 text-cyan' : 'border-line text-fg-3 hover:text-fg-2',
      )}
    >
      {children}
    </button>
  )
}

function MissionDetail({ mission }: { mission: MissionItem }) {
  const { t } = useTranslation()
  const visual = outcomeVisual(mission.landing_outcome)
  const actual = fmtCoord(mission.latitude_deg, mission.longitude_deg)
  const planned = mission.planned_target
    ? fmtCoord(mission.planned_target.latitude_deg, mission.planned_target.longitude_deg)
    : null

  return (
    <article className="space-y-2 rounded-xl border border-line bg-white/[0.03] p-3" data-testid="mission-detail">
      <div className="flex flex-wrap items-center gap-1.5">
        <h4 className="font-display text-sm font-semibold text-fg">{mission.name}</h4>
        <Badge tone="cyan">{mission.program}</Badge>
        <Badge tone="neutral" style={{ borderColor: MISSION_COLORS[visual], color: MISSION_COLORS[visual] }}>
          {t(`missions7e.outcome.${visual}`)}
        </Badge>
      </div>
      <dl className="grid grid-cols-1 gap-1.5 text-[11.5px] sm:grid-cols-2">
        <Field label={t('missions7e.fields.operator')} value={mission.operator} />
        <Field label={t('missions7e.fields.status')} value={mission.status} />
        <Field label={t('missions7e.fields.landingOutcome')} value={mission.landing_outcome} />
        <Field label={t('missions7e.fields.launch')} value={mission.launch_date ?? '—'} />
        <Field label={t('missions7e.fields.landing')} value={mission.landing_date ?? '—'} />
        <Field label={t('missions7e.fields.actualSite')} value={actual} />
        {planned && (
          <Field
            label={t('missions7e.fields.plannedTarget')}
            value={`${mission.planned_target!.name} (${planned})`}
          />
        )}
        <Field label={t('missions7e.fields.frame')} value={mission.source_frame_label} />
        <Field
          label={t('missions7e.fields.uncertainty')}
          value={
            mission.coordinate_uncertainty_m != null
              ? `±${mission.coordinate_uncertainty_m} m`
              : mission.coordinate_precision_note ?? '—'
          }
        />
        <Field label={t('missions7e.fields.confidence')} value={mission.confidence} />
      </dl>
      {mission.planned_target?.note && (
        <p className="text-[11px] leading-snug text-fg-3">{mission.planned_target.note}</p>
      )}
      <p className="text-[11px] leading-snug text-fg-2">{mission.notes}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={mission.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-cyan underline decoration-dotted underline-offset-2"
        >
          {t('missions7e.source')} <ExternalLink className="size-3" aria-hidden />
        </a>
        {mission.lroc_source_url && (
          <a
            href={mission.lroc_source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-cyan underline decoration-dotted underline-offset-2"
          >
            {t('missions7e.lroc')} <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
    </article>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-fg-3 uppercase">{label}</dt>
      <dd className="font-mono text-fg-2 break-words">{value}</dd>
    </div>
  )
}
