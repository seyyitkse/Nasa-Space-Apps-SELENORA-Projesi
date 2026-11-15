import { Clock, Globe2, Sun } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/shared/States'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { formatUtc } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useEventsCapability, useOperationalEvents } from './api'
import {
  clockInsideSamples,
  countdownAt,
  type CountdownRange,
  countdownFromServer,
  formatSpan,
  stateLabelKey,
  stateTone,
  usableReference,
} from './logic'
import type { BodyEvents, EventBody, EventSample, EventsResponse, EventTrack, HorizonType, VisibilityEvent } from './types'

type T = ReturnType<typeof useTranslation>['t']

/** String lookup for keys assembled from contract enums (all present in phase7a.{en,tr}.ts). */
function tx(t: T, key: string, options?: Record<string, unknown>): string {
  return String((t as unknown as (k: string, o?: Record<string, unknown>) => unknown)(key, options))
}

function eventTitle(t: T, body: EventBody, horizon: HorizonType, event: VisibilityEvent): string {
  if (event.kind === 'RISE' || event.kind === 'SET') return tx(t, `events7a.kind.${body}.${horizon}.${event.kind}`)
  return tx(t, `events7a.kind.${event.kind}`)
}

function StateBadge({ sample }: { sample: EventSample }) {
  const { t } = useTranslation()
  const key = stateLabelKey(sample)
  return <Badge tone={stateTone(key)}>{t(`events7a.state.${key}`)}</Badge>
}

function CountdownText({ range }: { range: CountdownRange }) {
  const { t } = useTranslation()
  const units = { d: t('events7a.units.d'), h: t('events7a.units.h'), min: t('events7a.units.min') }
  if (range.passed) return <span className="text-fg-3">{t('events7a.countdown.passed')}</span>
  if (range.mayHaveOccurred || range.earliestMinutes <= 0)
    return <>{t('events7a.countdown.within', { latest: formatSpan(range.latestMinutes, units) })}</>
  return (
    <>
      {t('events7a.countdown.range', {
        earliest: formatSpan(range.earliestMinutes, units),
        latest: formatSpan(range.latestMinutes, units),
      })}
    </>
  )
}

function EventBlock({
  heading,
  event,
  body,
  horizon,
  range,
}: {
  heading: string
  event: VisibilityEvent
  body: EventBody
  horizon: HorizonType
  range: CountdownRange | null
}) {
  const { t } = useTranslation()
  const units = { d: t('events7a.units.d'), h: t('events7a.units.h'), min: t('events7a.units.min') }
  return (
    <div className="rounded-lg border border-line bg-bg-2/50 p-3">
      <p className="text-[10.5px] font-medium tracking-wide text-fg-3 uppercase">{heading}</p>
      <p className="mt-1 text-[13.5px] font-medium text-fg">{eventTitle(t, body, horizon, event)}</p>
      <p className="mt-1 font-mono text-[11.5px] break-words text-fg-2">
        {t('events7a.between', { start: formatUtc(event.bracket_start_utc), end: formatUtc(event.bracket_end_utc) })}
      </p>
      {range && (
        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-cyan" data-testid="countdown">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <CountdownText range={range} />
          </span>
        </p>
      )}
      <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-fg-3">
        <li>{t('events7a.uncertainty', { span: formatSpan(event.bracket_minutes, units) })}</li>
        {event.approx_disc_crossing_hours !== null && <li>{t('events7a.disc', { hours: event.approx_disc_crossing_hours })}</li>}
        {event.kind === 'BECOMES_UNKNOWN' && (
          <li className="text-warning">
            {t('events7a.notARise')}
            {event.after.unknown_reason && ` ${t('events7a.because', { reason: t(`events7a.unknownReason.${event.after.unknown_reason}`) })}`}
          </li>
        )}
        {event.earlier_events_excluded === false && <li className="text-warning">{t('events7a.earlierNotExcluded')}</li>}
      </ul>
    </div>
  )
}

/** Screen-reader summary. Deliberately free of ticking numbers so it only changes with the state. */
function trackSummary(t: T, body: EventBody, track: EventTrack): string {
  const horizon = track.horizon
  if (track.status === 'INSUFFICIENT_DATA') return tx(t, 'events7a.status.INSUFFICIENT_DATA')
  if (track.status === 'UNKNOWN_AT_REFERENCE') return tx(t, 'events7a.status.UNKNOWN_AT_REFERENCE')
  if (track.status === 'NO_EVENT_IN_WINDOW')
    return tx(t, 'events7a.status.NO_EVENT_IN_WINDOW', { time: track.no_change_through_utc ? formatUtc(track.no_change_through_utc) : '' })
  const event = track.status === 'EVENT_CONFIRMED' ? track.next_confirmed_event : track.next_change
  if (!event) return ''
  return `${eventTitle(t, body, horizon, event)} ${tx(t, 'events7a.between', {
    start: formatUtc(event.bracket_start_utc),
    end: formatUtc(event.bracket_end_utc),
  })}`
}

function TrackBlock({ body, track, rangeFor }: { body: EventBody; track: EventTrack; rangeFor: (e: VisibilityEvent) => CountdownRange | null }) {
  const { t } = useTranslation()
  const horizon = track.horizon
  const current = track.current
  return (
    <section
      aria-label={`${t(`events7a.body.${body}`)} · ${t(`events7a.horizon.${horizon}`)}`}
      className="min-w-0 space-y-3 rounded-xl border border-line p-3"
      data-testid={`track-${body}-${horizon}`}
      data-status={track.status}
    >
      <header className="space-y-1">
        <Badge tone={horizon === 'TERRAIN' ? 'gold' : 'cyan'}>{t(`events7a.horizon.${horizon}`)}</Badge>
        <p className="text-[11.5px] leading-relaxed text-fg-3">{t(`events7a.horizon.hint.${horizon}`)}</p>
      </header>

      {current && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-2">
          <span className="text-fg-3">{t('events7a.current')}:</span>
          <StateBadge sample={current} />
          <span className="font-mono text-[11px] text-fg-3">{t('events7a.asOf', { time: formatUtc(current.t) })}</span>
        </div>
      )}
      {current?.state === 'UNKNOWN' && current.unknown_reason && (
        <p className="text-[12px] text-warning">{t('events7a.because', { reason: t(`events7a.unknownReason.${current.unknown_reason}`) })}</p>
      )}

      {track.status === 'EVENT_CONFIRMED' && track.next_confirmed_event && (
        <EventBlock
          heading={t('events7a.nextConfirmed')}
          event={track.next_confirmed_event}
          body={body}
          horizon={horizon}
          range={rangeFor(track.next_confirmed_event)}
        />
      )}
      {track.status === 'UNKNOWN_AHEAD' && track.next_change && (
        <>
          <EventBlock heading={t('events7a.nextChange')} event={track.next_change} body={body} horizon={horizon} range={rangeFor(track.next_change)} />
          {track.next_confirmed_event && (
            <EventBlock
              heading={t('events7a.laterConfirmed')}
              event={track.next_confirmed_event}
              body={body}
              horizon={horizon}
              range={rangeFor(track.next_confirmed_event)}
            />
          )}
        </>
      )}
      {track.status === 'NO_EVENT_IN_WINDOW' && (
        <div className="rounded-lg border border-line bg-bg-2/50 p-3 text-[12.5px] leading-relaxed">
          <p className="text-fg">
            {t('events7a.status.NO_EVENT_IN_WINDOW', { time: track.no_change_through_utc ? formatUtc(track.no_change_through_utc) : '' })}
          </p>
          <p className="mt-1 text-fg-3">{t('events7a.status.noEventHint')}</p>
        </div>
      )}
      {track.status === 'UNKNOWN_AT_REFERENCE' && (
        <div className="rounded-lg border border-warning/30 bg-warning/[0.06] p-3 text-[12.5px] leading-relaxed">
          <p className="text-fg">{t('events7a.status.UNKNOWN_AT_REFERENCE')}</p>
          <p className="mt-1 text-fg-3">
            {track.next_known
              ? t('events7a.status.nextKnown', { state: t(`events7a.state.${stateLabelKey(track.next_known)}`), time: formatUtc(track.next_known.t) })
              : t('events7a.status.noNextKnown')}
          </p>
        </div>
      )}
      {track.status === 'INSUFFICIENT_DATA' && (
        <p className="rounded-lg border border-warning/30 bg-warning/[0.06] p-3 text-[12.5px] text-fg">{t('events7a.status.INSUFFICIENT_DATA')}</p>
      )}

      {track.unknown_sample_count > 0 && (
        <p className="text-[11.5px] text-warning" data-testid="unknown-count">
          {t('events7a.unknownCount', { n: track.unknown_sample_count, total: track.sample_count })}
        </p>
      )}

      <details className="text-[12px] text-fg-2">
        <summary className="cursor-pointer rounded text-fg-3 hover:text-fg-2 focus-visible:outline-2 focus-visible:outline-cyan">
          {t('events7a.allEvents', { n: track.transitions.length })}
        </summary>
        {track.transitions.length === 0 ? (
          <p className="mt-2 text-fg-3">{t('events7a.noChanges')}</p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {track.transitions.map((e) => (
              <li key={`${e.kind}-${e.bracket_end_utc}`} className="rounded-lg border border-line bg-bg-2/40 px-2.5 py-1.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-fg">{eventTitle(t, body, horizon, e)}</span>
                  <Badge tone={e.confirmed ? 'success' : 'warning'}>{e.confirmed ? t('events7a.confirmedTag') : t('events7a.notConfirmedTag')}</Badge>
                </span>
                <span className="mt-0.5 block font-mono text-[11px] break-words text-fg-3">
                  {t('events7a.between', { start: formatUtc(e.bracket_start_utc), end: formatUtc(e.bracket_end_utc) })}
                </span>
                {e.differs_from_last_known && e.last_known_before_unknown && (
                  <span className="mt-0.5 block text-[11.5px] text-warning">
                    {t('events7a.differs', { time: formatUtc(e.last_known_before_unknown.t) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {track.transitions_truncated && <p className="mt-1 text-warning">{t('events7a.truncated')}</p>}
      </details>

      <p className="sr-only" role="status" aria-live="polite">
        {t('events7a.announce', { body: t(`events7a.body.${body}`), horizon: t(`events7a.horizon.${horizon}`), summary: trackSummary(t, body, track) })}
      </p>
    </section>
  )
}

function BodyColumn({ events, rangeFor }: { events: BodyEvents; rangeFor: (e: VisibilityEvent) => CountdownRange | null }) {
  const { t } = useTranslation()
  const Icon = events.body === 'SUN' ? Sun : Globe2
  return (
    <div className="min-w-0 space-y-3" data-testid={`body-${events.body}`}>
      <h4 className="flex items-center gap-2 font-display text-[14px] font-semibold text-fg">
        <Icon className={cn('size-4', events.body === 'SUN' ? 'text-gold' : 'text-cyan')} aria-hidden />
        {t(`events7a.body.${events.body}`)}
      </h4>
      <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-3', events.terrain && 'xl:grid-cols-2')}>
        <TrackBlock body={events.body} track={events.geometric} rangeFor={rangeFor} />
        {events.terrain && <TrackBlock body={events.body} track={events.terrain} rangeFor={rangeFor} />}
      </div>
    </div>
  )
}

/** Pure view over an events payload (no fetching) — unit-tested directly. */
export function OperationalEventsView({
  data,
  siteIndex,
  live,
  clockMs,
}: {
  data: EventsResponse
  siteIndex: number
  /** Live countdown from `clockMs`; only honoured when the backend reference is NOW. */
  live: boolean
  clockMs: number
}) {
  const { t } = useTranslation()
  const site = data.sites[Math.min(Math.max(siteIndex, 0), data.sites.length - 1)]
  const ticking = live && data.reference_mode === 'NOW'
  const rangeFor = (e: VisibilityEvent) => (ticking ? countdownAt(e, clockMs) : countdownFromServer(e))
  if (!site) return null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-fg-2">
        <Badge tone={data.horizon_model === 'TERRAIN' ? 'gold' : 'cyan'}>{data.horizon_model}</Badge>
        <span data-testid="reference-mode">{t(`events7a.ref.mode.${data.reference_mode}`)}</span>
        <span className="font-mono text-[11px] text-fg-3">{formatUtc(data.reference_utc)}</span>
        <span className="text-fg-3">· {t('events7a.sampleStep', { n: data.time_step_minutes })}</span>
      </div>
      <p className="text-[11.5px] text-fg-3">{ticking ? t('events7a.ref.liveNote') : t('events7a.ref.staticNote')}</p>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <BodyColumn events={site.sun} rangeFor={rangeFor} />
        <BodyColumn events={site.earth} rangeFor={rangeFor} />
      </div>

      <details className="rounded-xl border border-line p-3 text-[12px] leading-relaxed text-fg-2">
        <summary className="cursor-pointer rounded font-medium text-fg-2 focus-visible:outline-2 focus-visible:outline-cyan">{t('events7a.notes.title')}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{t('events7a.notes.bracket')}</li>
          <li>{t('events7a.notes.centre')}</li>
          <li>{t('events7a.notes.earth')}</li>
          <li>{t('events7a.notes.unknown')}</li>
        </ul>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-fg-3 uppercase">{t('events7a.notes.api')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[11.5px] text-fg-3" lang="en">
          {data.limitations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}

/**
 * Operational events for the workspace analysis. The reference is the wall
 * clock when it lies inside the analysis (live), otherwise the selected sample.
 */
export function OperationalEventsPanel({
  analysisId,
  siteIndex,
  cursorMs,
  startUtc,
  endUtc,
  className,
}: {
  analysisId: string | undefined
  siteIndex: number
  cursorMs: number | null
  startUtc: string | undefined
  endUtc: string | undefined
  className?: string
}) {
  const { t } = useTranslation()
  const hintId = useId()
  const capability = useEventsCapability()
  const [clockMs, setClockMs] = useState(() => Date.now())
  const [preferLive, setPreferLive] = useState(true)

  const liveAllowed = Boolean(startUtc && endUtc && clockInsideSamples(clockMs, startUtc, endUtc))
  const live = preferLive && liveAllowed
  useEffect(() => {
    // Minute-level source data: a 30 s tick is ample and keeps the display honest.
    const id = window.setInterval(() => setClockMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const reference = live ? undefined : usableReference(cursorMs, startUtc, endUtc)
  const query = useOperationalEvents(analysisId, reference, capability.available === true)

  const modes = [
    { key: 'live' as const, label: t('events7a.ref.live'), disabled: !liveAllowed },
    { key: 'selected' as const, label: t('events7a.ref.selected'), disabled: false },
  ]

  return (
    <Card className={className} data-testid="operational-events">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('events7a.title')}</CardTitle>
          <CardDescription>{t('events7a.description')}</CardDescription>
        </div>
        <div className="shrink-0">
          <div role="radiogroup" aria-label={t('events7a.ref.group')} aria-describedby={liveAllowed ? undefined : hintId} className="flex gap-1.5">
            {modes.map((m) => {
              const checked = m.key === 'live' ? live : !live
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={m.disabled}
                  onClick={() => setPreferLive(m.key === 'live')}
                  className={cn(
                    'min-h-9 cursor-pointer rounded-lg border px-3 text-[12.5px] focus-visible:outline-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-50',
                    checked ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-line text-fg-2 hover:border-line-strong',
                  )}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
          {!liveAllowed && (
            <p id={hintId} className="mt-1.5 max-w-64 text-[11px] leading-snug text-fg-3">
              {t('events7a.ref.liveUnavailable')}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {capability.available === false ? (
          <p role="status" className="text-[13px] text-fg-2">
            {t('events7a.unavailable')}
          </p>
        ) : capability.failed ? (
          <p role="status" className="text-[13px] text-warning">
            {t('events7a.capabilityUnknown')}
          </p>
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
        ) : !query.data ? (
          <div role="status" aria-label={t('events7a.loading')} className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <OperationalEventsView data={query.data} siteIndex={siteIndex} live={live} clockMs={clockMs} />
        )}
      </CardContent>
    </Card>
  )
}
