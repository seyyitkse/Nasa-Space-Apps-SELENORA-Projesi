import {
  Activity,
  ArrowRight,
  ExternalLink,
  MapPin,
  Rocket,
  Satellite,
  Telescope,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { StateBadge } from '@/components/shared/badges'
import { staggerChild } from '@/components/shared/PageTransition'
import { ErrorState } from '@/components/shared/States'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { useDataSources, useHealth, useSites } from '@/hooks/useApi'
import { formatCoord, formatUptime, formatUtcDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { resolveSite, useMissionStore } from '@/stores/missionStore'

function DashCard({
  icon: Icon,
  title,
  description,
  children,
  className,
  action,
}: {
  icon: typeof Activity
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <motion.div variants={staggerChild} className={className}>
      <Card className="h-full transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line-strong">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-bg-2/80 text-cyan">
              <Icon className="size-4" aria-hidden />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              {description && <CardDescription className="mt-0.5 text-xs">{description}</CardDescription>}
            </div>
          </div>
          {action}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
  )
}

export function SystemHealthCard() {
  const { t } = useTranslation()
  const { data, isPending, error, refetch } = useHealth()
  return (
    <DashCard
      icon={Activity}
      title={t('overview.systemHealth')}
      description={t('overview.systemHealthText')}
      action={data && <StateBadge state={data.status === 'ok' ? 'OK' : 'DEGRADED'} />}
    >
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {data.components.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 py-2" title={c.detail}>
                <span className="truncate text-[13px] text-fg-2">
                  {t(`components.${c.name as 'database'}`, { defaultValue: c.name })}
                </span>
                <StateBadge state={c.status} />
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
            {[
              [t('overview.version'), data.version],
              [t('overview.algorithm'), data.algorithm_version],
              [t('overview.uptime'), formatUptime(data.uptime_seconds)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-bg-2/60 px-2 py-1.5">
                <dt className="text-fg-3">{k}</dt>
                <dd className="truncate text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </DashCard>
  )
}

export function DataSourcesCard() {
  const { t } = useTranslation()
  const { data, isPending, error, refetch } = useDataSources()
  return (
    <DashCard icon={Satellite} title={t('overview.dataSources')} description={t('overview.dataSourcesText')}>
      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      ) : (
        <ul className="space-y-2.5">
          {data.items.map((s) => (
            <li key={s.id} className="rounded-xl border border-line bg-bg-2/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={s.documentation_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-fg hover:text-cyan"
                >
                  {s.name}
                  <ExternalLink className="size-3 opacity-50 group-hover:opacity-100" aria-hidden />
                </a>
                <StateBadge state={s.integration_status} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-3">{s.notes}</p>
              <div className="mt-2 font-mono text-[10.5px] text-fg-3">
                {s.provider} · {t('common.phase', { n: s.phase })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  )
}

export function ExampleSitesCard() {
  const { t } = useTranslation()
  const { data, isPending, error, refetch } = useSites()
  return (
    <DashCard
      icon={MapPin}
      title={t('overview.exampleSites')}
      description={t('overview.exampleSitesText')}
      action={
        <Button asChild size="sm" variant="ghost">
          <Link to="/explorer">
            {t('overview.viewOnMap')} <ArrowRight />
          </Link>
        </Button>
      }
    >
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.items.map((s) => (
            <li key={s.id}>
              <Link
                to={`/explorer?site=${encodeURIComponent(s.id)}`}
                className="group flex h-full flex-col rounded-xl border border-line bg-bg-2/50 px-3 py-2.5 transition-colors hover:border-cyan/40"
              >
                <span className="line-clamp-2 text-[13px] leading-snug font-medium text-fg group-hover:text-cyan">{s.name}</span>
                <span className="mt-0.5 font-mono text-[11px] text-fg-3">
                  {formatCoord(s.latitude_deg, s.longitude_deg, 2)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  )
}

export function MissionOverviewCard() {
  const { t } = useTranslation()
  const draft = useMissionStore((s) => s.draft)
  const custom = useMissionStore((s) => s.customSites)
  const { data } = useSites()
  const a = resolveSite(draft.siteA, data?.items, custom)
  const b = resolveSite(draft.siteB, data?.items, custom)
  return (
    <DashCard icon={Telescope} title={t('overview.missionOverview')} description={t('overview.missionDraft')}>
      <div className="font-display text-lg font-semibold text-fg">{draft.missionName}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[
          { label: t('common.siteA'), site: a, color: 'text-cyan' },
          { label: t('common.siteB'), site: b, color: 'text-violet' },
        ].map(({ label, site, color }) => (
          <div key={label} className="rounded-xl border border-line bg-bg-2/50 p-3">
            <div className={cn('sel-eyebrow text-[10px]', color)}>{label}</div>
            <div className="mt-1 truncate text-[13px] font-medium">{site?.name ?? t('overview.notAssigned')}</div>
            {site && (
              <div className="font-mono text-[11px] text-fg-3">
                {formatCoord(site.latitude_deg, site.longitude_deg, 2)}
              </div>
            )}
          </div>
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-fg-3">{t('overview.window')}</dt>
          <dd className="mt-0.5 font-mono text-[11px] text-fg">
            {formatUtcDate(draft.startDate)} → {formatUtcDate(draft.endDate)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-3">{t('overview.resolution')}</dt>
          <dd className="mt-0.5 font-mono text-[11px] text-fg">{draft.timeStepMinutes} min</dd>
        </div>
        <div>
          <dt className="text-fg-3">{t('overview.weights')}</dt>
          <dd className="mt-0.5 font-mono text-[11px] text-fg">
            {draft.weights.sun_visibility}/{draft.weights.earth_visibility}/{draft.weights.joint_visibility}
          </dd>
        </div>
      </dl>
    </DashCard>
  )
}

export function PlannerAccessCard() {
  const { t } = useTranslation()
  return (
    <DashCard icon={Rocket} title={t('overview.plannerAccess')}>
      <p className="text-[13px] leading-relaxed text-fg-2">{t('overview.plannerAccessText')}</p>
      <Button asChild variant="primary" className="mt-4 w-full">
        <Link to="/planner">
          {t('overview.openPlanner')} <ArrowRight />
        </Link>
      </Button>
    </DashCard>
  )
}
