import { Scale } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BODY_COLORS } from '@/components/shared/siteColors'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { DecisionWeights, WeightKey } from '@/types/api'

import { normalizeWeights, weightsTotal } from './validation'

export function WeightsEditor({
  value,
  onChange,
  error,
  compact = false,
}: {
  value: DecisionWeights
  onChange: (w: DecisionWeights) => void
  error?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const total = weightsTotal(value)
  const rows: { key: WeightKey; label: string; color: string }[] = [
    { key: 'sun_visibility', label: t('planner.weightSun'), color: BODY_COLORS.sun },
    { key: 'earth_visibility', label: t('planner.weightEarth'), color: BODY_COLORS.earth },
    { key: 'joint_visibility', label: t('planner.weightJoint'), color: BODY_COLORS.joint },
  ]
  return (
    <fieldset className="space-y-4" aria-describedby="weights-hint">
      {!compact && (
        <legend className="mb-1 flex w-full items-center gap-2 text-[13px] font-medium text-fg">
          <Scale className="size-4 text-cyan" aria-hidden /> {t('planner.priorities')}
        </legend>
      )}
      {rows.map((r) => (
        <div key={r.key}>
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-2 text-fg-2">
              <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />
              {r.label}
            </span>
            <span className="font-mono text-xs text-fg">{value[r.key]}%</span>
          </div>
          <Slider
            aria-label={r.label}
            min={0}
            max={100}
            step={1}
            accent={r.color}
            value={[value[r.key]]}
            onValueChange={([v]) => onChange({ ...value, [r.key]: v ?? 0 })}
          />
        </div>
      ))}
      {/* stacked total bar */}
      <div className="flex items-center gap-3">
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-white/5" aria-hidden>
          {rows.map((r) => (
            <div key={r.key} style={{ width: `${Math.min(100, value[r.key])}%`, background: r.color }} />
          ))}
        </div>
        <span
          className={cn('font-mono text-xs', Math.abs(total - 100) > 0.01 ? 'text-danger' : 'text-success')}
          aria-live="polite"
        >
          {t('planner.total')}: {total}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p id="weights-hint" className="text-xs text-fg-3">
          {t('planner.prioritiesHint')}
        </p>
        {Math.abs(total - 100) > 0.01 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(normalizeWeights(value))}>
            {t('planner.normalize')}
          </Button>
        )}
      </div>
      <FieldError>{error}</FieldError>
    </fieldset>
  )
}
