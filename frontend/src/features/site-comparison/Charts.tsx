import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { BODY_COLORS, siteColor } from '@/components/shared/siteColors'
import { formatUtc, formatUtcDate } from '@/lib/format'
import type { SiteResult, SiteTimeline } from '@/types/api'

import { cumulativeJointRows, elevationRows } from './derive'

const AXIS = { stroke: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono Variable, monospace' }
const GRID = 'rgba(148,163,184,0.10)'
const tooltipStyle = {
  contentStyle: {
    background: 'rgba(16,24,39,0.96)',
    border: '1px solid rgba(148,163,184,0.24)',
    borderRadius: 10,
    fontSize: 12,
    color: '#F4F7FF',
  },
  labelStyle: { color: '#94A3B8', fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 11 },
}

const dayTick = (v: number) => formatUtcDate(v).replace(/ \d{4}$/, '')

export const ElevationChart = memo(function ElevationChart({
  timelines,
  body,
}: {
  timelines: SiteTimeline[]
  body: 'sun' | 'earth'
}) {
  const { t } = useTranslation()
  const data = useMemo(() => elevationRows(timelines, body), [timelines, body])
  return (
    <div className="h-[280px] w-full sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={dayTick} {...AXIS} minTickGap={36} />
          <YAxis {...AXIS} unit="°" width={52} tickFormatter={(v: number) => v.toFixed(1)} />
          <ReferenceLine
            y={0}
            stroke="#F87171"
            strokeDasharray="4 4"
            label={{ value: t('comparison.horizon'), fill: '#F87171', fontSize: 10, position: 'insideTopRight' }}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => formatUtc(Number(v))}
            formatter={(v, name) => [`${Number(v).toFixed(3)}°`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {timelines.map((tl, i) => (
            <Line
              key={tl.label}
              type="monotone"
              dataKey={`s${i}`}
              name={tl.label}
              stroke={siteColor(i)}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
})

export const CumulativeJointChart = memo(function CumulativeJointChart({
  timelines,
  stepMinutes,
}: {
  timelines: SiteTimeline[]
  stepMinutes: number
}) {
  const { t } = useTranslation()
  const data = useMemo(() => cumulativeJointRows(timelines, stepMinutes), [timelines, stepMinutes])
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <defs>
            {timelines.map((_, i) => (
              <linearGradient key={i} id={`cum-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={siteColor(i)} stopOpacity={0.35} />
                <stop offset="1" stopColor={siteColor(i)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={dayTick} {...AXIS} minTickGap={36} />
          <YAxis {...AXIS} unit=" h" width={58} />
          <Tooltip {...tooltipStyle} labelFormatter={(v) => formatUtc(Number(v))} formatter={(v, name) => [`${v} ${t('comparison.hours')}`, name]} />
          {timelines.map((tl, i) => (
            <Area
              key={tl.label}
              type="monotone"
              dataKey={`s${i}`}
              name={tl.label}
              stroke={siteColor(i)}
              fill={`url(#cum-${i})`}
              strokeWidth={1.6}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
})

export const VisibilityBarChart = memo(function VisibilityBarChart({ sites }: { sites: SiteResult[] }) {
  const { t } = useTranslation()
  const data = [
    { metric: t('comparison.sunVisibility'), ...Object.fromEntries(sites.map((s, i) => [`s${i}`, s.metrics.sun_visibility_pct])) },
    { metric: t('comparison.earthVisibility'), ...Object.fromEntries(sites.map((s, i) => [`s${i}`, s.metrics.earth_visibility_pct])) },
    { metric: t('comparison.jointVisibility'), ...Object.fromEntries(sites.map((s, i) => [`s${i}`, s.metrics.joint_visibility_pct])) },
  ]
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={4}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="metric" {...AXIS} tick={{ fill: '#94A3B8', fontSize: 11 }} interval={0} />
          <YAxis {...AXIS} domain={[0, 100]} unit="%" width={48} />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.06)' }} formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {sites.map((s, i) => (
            <Bar key={s.label} dataKey={`s${i}`} name={s.label} fill={siteColor(i)} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
})

export { BODY_COLORS }
