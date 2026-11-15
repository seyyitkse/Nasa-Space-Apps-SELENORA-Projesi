import { Info, SunMedium } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { siteColor } from '@/components/shared/siteColors'
import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/misc'
import { formatHours } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useSolarCapability, useSolarPotential } from './api'
import {
  barSegments,
  comparisonFor,
  compassKey,
  estimateFor,
  formatIndex,
  formatIndexPct,
  HIGH_UNKNOWN_FRACTION,
  indexDisplay,
  type ParamDraft,
  type ParamField,
  parseParams,
  sameParams,
} from './logic'
import type { HorizonType, PanelKind, PanelResult, SiteSolarPotential, SolarParams, SolarPotentialResponse } from './types'

type T = ReturnType<typeof useTranslation>['t']

/** String lookup for keys assembled from contract enums (all present in phase7b.{en,tr}.ts). */
function tx(t: T, key: string, options?: Record<string, unknown>): string {
  return String((t as unknown as (k: string, o?: Record<string, unknown>) => unknown)(key, options))
}

const HATCH = 'repeating-linear-gradient(45deg, rgba(245,198,116,0.75) 0 2px, rgba(245,198,116,0.14) 2px 6px)'

function fractionPct(fraction: number | null): string {
  return fraction === null ? '—' : `${(fraction * 100).toFixed(fraction > 0 && fraction < 0.1 ? 1 : 0)}%`
}

function configDetail(t: T, config: PanelResult): string {
  const parts: string[] = []
  if (config.tilt_deg !== null) parts.push(tx(t, 'solar7b.config.tilt', { tilt: config.tilt_deg }))
  if (config.azimuth_deg !== null) {
    parts.push(tx(t, 'solar7b.config.azimuth', { azimuth: config.azimuth_deg, compass: tx(t, `solar7b.compass.${compassKey(config.azimuth_deg)}`) }))
    if (config.azimuth_source) parts.push(tx(t, `solar7b.config.${config.azimuth_source}`))
  }
  return parts.join(' · ')
}

/** One site's value for one panel: text first, bar second, caveats last. */
function SiteRow({
  site,
  config,
  horizon,
  panelLabel,
}: {
  site: SiteSolarPotential
  config: PanelResult
  horizon: HorizonType
  panelLabel: string
}) {
  const { t } = useTranslation()
  const estimate = config.available ? estimateFor(config, horizon) : null
  const display = indexDisplay(estimate)
  const text = display.kind === 'unavailable' ? t('solar7b.value.unavailable') : formatIndex(display)
  const spoken =
    display.kind === 'range' ? t('solar7b.value.rangeAria', { min: formatIndexPct(display.min), max: formatIndexPct(display.max) }) : text
  const { known, possible } = barSegments(display)
  const geometric = horizon === 'TERRAIN' && config.available ? indexDisplay(config.geometric) : null
  const detail = config.panel === 'FIXED' ? configDetail(t, config) : ''
  return (
    <li className="min-w-0 space-y-1.5" data-testid={`solar-row-${config.panel}-${site.site_index}`} data-status={estimate?.status ?? 'UNAVAILABLE'}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-fg">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: siteColor(site.site_index) }} aria-hidden />
          <span className="min-w-0 break-words">{site.label}</span>
        </span>
        <span className="font-mono text-[13px] text-fg" data-testid="solar-value">
          {display.kind === 'range' && <span className="mr-1.5 font-sans text-[11px] text-fg-3">{t('solar7b.value.range')}</span>}
          {text}
        </span>
      </div>
      <div
        role="img"
        aria-label={t('solar7b.bar', { site: site.label, panel: panelLabel, value: spoken })}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-line"
      >
        <span className="h-full bg-gold" style={{ width: `${known}%` }} />
        <span className="h-full" style={{ width: `${possible}%`, background: HATCH }} />
      </div>
      <ul className="space-y-0.5 text-[11.5px] leading-relaxed text-fg-3">
        {detail && <li>{detail}</li>}
        {!config.available && config.unavailable_reason && <li className="text-warning">{t(`solar7b.panelUnavailable.${config.unavailable_reason}`)}</li>}
        {config.available && display.kind === 'unavailable' && <li className="text-warning">{tx(t, `solar7b.unavailableReason.${display.reason}`)}</li>}
        {estimate && estimate.unknown_fraction !== null && estimate.unknown_fraction > 0 && (
          <li className="text-warning" data-testid="solar-unknown">
            {t('solar7b.unknownShare', { pct: fractionPct(estimate.unknown_fraction) })}
            {estimate.unknown_fraction > HIGH_UNKNOWN_FRACTION && display.kind === 'range' && ` — ${t('solar7b.mostlyUnknown')}`}
          </li>
        )}
        {estimate && estimate.edge_uncertain_hours > 0 && <li>{t('solar7b.edge', { hours: formatHours(estimate.edge_uncertain_hours) })}</li>}
        {geometric && geometric.kind !== 'unavailable' && (
          <li data-testid="solar-geometric-context">{t('solar7b.geometricContext', { value: formatIndex(geometric) })}</li>
        )}
      </ul>
    </li>
  )
}

function PanelSection({ data, panel }: { data: SolarPotentialResponse; panel: PanelKind }) {
  const { t } = useTranslation()
  const horizon = data.headline_horizon
  const comparison = comparisonFor(data, panel, horizon)
  const leader = comparison?.status === 'DISTINGUISHABLE' ? data.sites.find((s) => s.site_index === comparison.leading_site_index) : undefined
  const label = t(`solar7b.panel.${panel}`)
  const first = data.sites[0]?.configurations.find((c) => c.panel === panel)
  const shared = panel === 'AZIMUTH_TRACKING' && first ? configDetail(t, first) : ''
  return (
    <section aria-label={label} className="min-w-0 space-y-3 rounded-xl border border-line p-3" data-testid={`solar-panel-${panel}`}>
      <header>
        <h4 className="font-display text-[14px] font-semibold text-fg">{label}</h4>
        <p className="text-[11.5px] leading-relaxed text-fg-3">
          {t(`solar7b.panel.hint.${panel}`)}
          {shared && ` (${shared})`}
        </p>
      </header>
      <ul className="space-y-3">
        {data.sites.map((site) => {
          const config = site.configurations.find((c) => c.panel === panel)
          return config ? (
            <SiteRow key={site.site_index} site={site} config={config} horizon={horizon} panelLabel={label} />
          ) : null
        })}
      </ul>
      {comparison && data.sites.length > 1 && (
        <p
          className={cn('text-[12px] leading-relaxed', comparison.status === 'DISTINGUISHABLE' ? 'text-success' : 'text-fg-2')}
          data-testid={`solar-compare-${panel}`}
          data-status={comparison.status}
        >
          {t(`solar7b.compare.${comparison.status}`, { site: leader?.label ?? '' })}
        </p>
      )}
    </section>
  )
}

/** Layers 1 and 2: is the Sun up, and can it be seen over the terrain? Independent of any panel. */
function AvailabilityRow({ site }: { site: SiteSolarPotential }) {
  const { t } = useTranslation()
  const geo = site.sun_above_geometric_horizon
  const terrain = site.sun_terrain_visibility
  const total = site.window_hours
  const share = (hours: number) => (total > 0 ? (hours / total) * 100 : 0)
  return (
    <li className="min-w-0 space-y-2 rounded-lg border border-line bg-bg-2/40 p-3" data-testid={`solar-availability-${site.site_index}`}>
      <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: siteColor(site.site_index) }} aria-hidden />
        <span className="min-w-0 break-words">{site.label}</span>
      </p>
      <dl className="space-y-2 text-[12px] leading-relaxed">
        <div>
          <dt className="text-fg-3">{t('solar7b.layers.geometric')}</dt>
          <dd className="font-mono text-fg-2">
            {t('solar7b.layers.ofWindow', { hours: formatHours(geo.above_horizon_hours), total: formatHours(total) })}
            {geo.missing_ephemeris_hours > 0 && (
              <span className="ml-2 font-sans text-warning">
                {t('solar7b.layers.missing')}: {formatHours(geo.missing_ephemeris_hours)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-fg-3">{t('solar7b.layers.terrain')}</dt>
          {terrain ? (
            <dd className="space-y-1.5">
              <span className="block font-mono text-fg-2">
                {t('solar7b.layers.terrainRange', { min: fractionPct(terrain.visible_fraction_min), max: fractionPct(terrain.visible_fraction_max) })}
              </span>
              <span
                role="img"
                aria-label={t('solar7b.layers.split', {
                  visible: formatHours(terrain.visible_hours),
                  blocked: formatHours(terrain.blocked_hours),
                  unknown: formatHours(terrain.unknown_hours),
                })}
                className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-line"
              >
                <span className="h-full bg-gold" style={{ width: `${share(terrain.visible_hours)}%` }} />
                <span className="h-full bg-danger/45" style={{ width: `${share(terrain.blocked_hours)}%` }} />
                <span className="h-full" style={{ width: `${share(terrain.unknown_hours)}%`, background: HATCH }} />
              </span>
              <span className="block text-fg-3">
                {t('solar7b.layers.split', {
                  visible: formatHours(terrain.visible_hours),
                  blocked: formatHours(terrain.blocked_hours),
                  unknown: formatHours(terrain.unknown_hours),
                })}
              </span>
            </dd>
          ) : (
            <dd className="text-fg-3">{t('solar7b.layers.noTerrain')}</dd>
          )}
        </div>
      </dl>
    </li>
  )
}

/** Pure view over a solar-potential payload (no fetching) — unit-tested directly. */
export function SolarPotentialView({ data }: { data: SolarPotentialResponse }) {
  const { t } = useTranslation()
  const horizon = data.headline_horizon
  const panels = data.sites[0]?.configurations.map((c) => c.panel) ?? []
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-fg-2">
          <Badge tone={horizon === 'TERRAIN' ? 'gold' : 'cyan'} data-testid="solar-horizon">
            {t(`solar7b.horizon.${horizon}`)}
          </Badge>
          <span className="text-fg-3">{t('solar7b.step', { n: data.time_step_minutes })}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-fg-3">{t(`solar7b.horizon.hint.${horizon}`)}</p>
        <p className="text-[12px] leading-relaxed text-fg-3">{t('solar7b.scale')}</p>
      </div>

      <ul aria-label={t('solar7b.legend.title')} className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-fg-2">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-gold" aria-hidden /> {t('solar7b.legend.known')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm" style={{ background: HATCH }} aria-hidden /> {t('solar7b.legend.possible')}
        </li>
      </ul>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        {panels.map((panel) => (
          <PanelSection key={panel} data={data} panel={panel} />
        ))}
      </div>

      <section aria-label={t('solar7b.layers.title')} className="space-y-2">
        <h4 className="font-display text-[14px] font-semibold text-fg">{t('solar7b.layers.title')}</h4>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          {data.sites.map((site) => (
            <AvailabilityRow key={site.site_index} site={site} />
          ))}
        </ul>
      </section>

      <details className="rounded-xl border border-line p-3 text-[12px] leading-relaxed text-fg-2" data-testid="solar-notes">
        <summary className="cursor-pointer rounded font-medium text-fg-2 focus-visible:outline-2 focus-visible:outline-cyan">{t('solar7b.notes.title')}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{t('solar7b.notes.plain.relative')}</li>
          <li>{t('solar7b.notes.plain.unknown')}</li>
          <li>{t('solar7b.notes.plain.range')}</li>
          <li>{t('solar7b.notes.plain.photo')}</li>
        </ul>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          {t('solar7b.notes.provenance')}
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[11.5px] text-fg-3" lang="en">
          {data.provenance.map((p) => (
            <li key={p.source_id}>
              <span className="font-mono text-fg-2">{p.source_id}</span>
              {p.version && <span className="font-mono"> ({p.version})</span>} — {p.description}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          {t('solar7b.notes.energy')}
        </p>
        <p className="mt-1 text-[11.5px] text-fg-3">{t('solar7b.notes.energyMissing')}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11.5px] text-fg-3" lang="en">
          {data.electrical_energy.missing_inputs.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          {t('solar7b.notes.definition')} · {t('solar7b.notes.api')}
        </p>
        <p className="mt-1 text-[11.5px] text-fg-3" lang="en">
          {data.index_definition}
        </p>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          {t('solar7b.notes.assumptions')} · {t('solar7b.notes.api')}
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[11.5px] text-fg-3" lang="en">
          {data.assumptions.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
          {t('solar7b.notes.limitations')} · {t('solar7b.notes.api')}
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[11.5px] text-fg-3" lang="en">
          {data.limitations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}

const EMPTY_DRAFT: ParamDraft = { azimuth: '', tilt: '', trackingTilt: '' }
const FIELDS: { field: ParamField; label: string; help: string; placeholder?: string }[] = [
  { field: 'azimuth', label: 'solar7b.controls.azimuth', help: 'solar7b.controls.azimuthHelp', placeholder: 'solar7b.controls.azimuthPlaceholder' },
  { field: 'tilt', label: 'solar7b.controls.tilt', help: 'solar7b.controls.tiltHelp' },
  { field: 'trackingTilt', label: 'solar7b.controls.trackingTilt', help: 'solar7b.controls.tiltHelp' },
]

/** Relative solar potential for a stored analysis, with debounced panel settings. */
export function SolarPotentialPanel({
  analysisId,
  synthetic = false,
  className,
}: {
  analysisId: string | undefined
  /** Synthetic demo analyses have no JPL geometry: nothing is requested or shown. */
  synthetic?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const baseId = useId()
  const capability = useSolarCapability()
  const [draft, setDraft] = useState<ParamDraft>(EMPTY_DRAFT)
  const [params, setParams] = useState<SolarParams>({})
  const parsed = parseParams(draft)
  const valid = Object.keys(parsed.errors).length === 0
  const next = parsed.params

  // Typing changes the inputs many times per second: request only once they settle
  // and only when every field is valid, so the shared rate limiter is not flooded.
  useEffect(() => {
    if (!valid) return
    const id = window.setTimeout(() => setParams((current) => (sameParams(current, next) ? current : next)), 500)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, next.azimuthDeg, next.tiltDeg, next.trackingTiltDeg])

  const query = useSolarPotential(analysisId, params, capability.available === true && !synthetic)
  const data = query.data && query.data.analysis_id === analysisId ? query.data : undefined
  const busy = Boolean(data) && (query.isPlaceholderData || query.isFetching || (valid && !sameParams(params, next)))

  return (
    <Card className={className} data-testid="solar-potential">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SunMedium className="size-4 text-gold" aria-hidden />
          {t('solar7b.title')}
        </CardTitle>
        <CardDescription>{t('solar7b.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="note" className="flex items-start gap-2 rounded-lg border border-cyan/25 bg-cyan/[0.05] p-3 text-[12.5px] leading-relaxed text-fg-2" data-testid="solar-not-power">
          <Info className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden />
          <span>{t('solar7b.notPower')}</span>
        </p>

        {synthetic ? (
          <p role="status" className="text-[13px] text-fg-2" data-testid="solar-synthetic">
            {t('solar7b.synthetic')}
          </p>
        ) : capability.available === false ? (
          <p role="status" className="text-[13px] text-fg-2">
            {t('solar7b.unavailable')}
          </p>
        ) : capability.failed ? (
          <p role="status" className="text-[13px] text-warning">
            {t('solar7b.capabilityUnknown')}
          </p>
        ) : (
          <>
            <fieldset className="min-w-0 rounded-xl border border-line p-3">
              <legend className="px-1 text-[12px] font-medium text-fg-2">{t('solar7b.controls.title')}</legend>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
                {FIELDS.map(({ field, label, help, placeholder }) => {
                  const error = parsed.errors[field]
                  const inputId = `${baseId}-${field}`
                  return (
                    <div key={field} className="min-w-0">
                      <Label htmlFor={inputId}>{tx(t, label)}</Label>
                      <Input
                        id={inputId}
                        inputMode="decimal"
                        autoComplete="off"
                        value={draft[field]}
                        placeholder={placeholder ? tx(t, placeholder) : '90'}
                        aria-invalid={Boolean(error)}
                        aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ''}`}
                        onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                      />
                      <p id={`${inputId}-help`} className="mt-1 text-[11px] leading-snug text-fg-3">
                        {tx(t, help)}
                      </p>
                      <FieldError id={`${inputId}-error`}>{error ? t(`solar7b.controls.errors.${error}`) : null}</FieldError>
                    </div>
                  )
                })}
              </div>
            </fieldset>

            {query.error ? (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
            ) : !data ? (
              <div role="status" aria-label={t('solar7b.loading')} className="grid gap-4 lg:grid-cols-2">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            ) : (
              <div aria-busy={busy} className={cn('transition-opacity', busy && 'opacity-60')}>
                <p role="status" className={cn('mb-2 text-[11.5px] text-fg-3', !busy && 'sr-only')} data-testid="solar-updating">
                  {busy ? t('solar7b.updating') : ''}
                </p>
                <SolarPotentialView data={data} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
