import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { BODY_COLORS } from '@/components/shared/siteColors'
import { formatUtc, formatUtcDate } from '@/lib/format'

import type { EpochState } from '../analysis-data/adapter'

const AXIS = { stroke: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono Variable, monospace' }

/** Sun & Earth sampled elevations for one site; click a point to move the shared cursor. */
export const SimElevationChart = memo(function SimElevationChart({
  epochs,
  cursorT,
  onIndex,
}: {
  epochs: EpochState[]
  cursorT: number | null
  onIndex: (i: number) => void
}) {
  const { t } = useTranslation()
  const data = useMemo(() => epochs.map((e) => ({ t: e.t, sun: e.sunElevation, earth: e.earthElevation })), [epochs])
  return (
    <div className="h-[230px] w-full sm:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
          onClick={(s) => {
            const i = Number((s as { activeTooltipIndex?: number | string | null })?.activeTooltipIndex)
            if (Number.isFinite(i)) onIndex(i)
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatUtcDate(v).replace(/ \d{4}$/, '')}
            minTickGap={40}
            {...AXIS}
          />
          <YAxis {...AXIS} unit="°" width={54} tickFormatter={(v: number) => v.toFixed(1)} />
          <ReferenceLine y={0} stroke="#F87171" strokeDasharray="4 4" />
          {cursorT !== null && <ReferenceLine x={cursorT} stroke="#F4F7FF" strokeWidth={1.5} />}
          <Tooltip
            contentStyle={{ background: 'rgba(16,24,39,0.96)', border: '1px solid rgba(148,163,184,0.24)', borderRadius: 10, fontSize: 12 }}
            labelFormatter={(v) => formatUtc(Number(v))}
            formatter={(v, name) => [v === null || v === undefined ? '—' : `${Number(v).toFixed(3)}°`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="linear" dataKey="sun" name={t('sim.sunElevation')} stroke={BODY_COLORS.sun} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line type="linear" dataKey="earth" name={t('sim.earthElevation')} stroke={BODY_COLORS.earth} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
})
