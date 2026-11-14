import { FlaskConical, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { ComponentState, DataQuality, IntegrationStatus } from '@/types/api'

const QUALITY_TONE: Record<DataQuality, BadgeProps['tone']> = {
  EPHEMERIS_GEOMETRIC: 'cyan',
  EPHEMERIS_TERRAIN: 'success',
  LOCAL_TERRAIN_PARTIAL: 'warning',
  SYNTHETIC_DEMO: 'gold',
  PARTIAL: 'warning',
  UNAVAILABLE: 'danger',
}

export function DataQualityBadge({ quality }: { quality: DataQuality }) {
  const { t } = useTranslation()
  const Icon = quality === 'SYNTHETIC_DEMO' ? FlaskConical : ShieldCheck
  return (
    <Badge tone={QUALITY_TONE[quality]} title={t(`quality.${quality}`)}>
      <Icon className="size-3" aria-hidden />
      {quality}
    </Badge>
  )
}

const STATE_TONE: Record<ComponentState | IntegrationStatus, BadgeProps['tone']> = {
  OK: 'success',
  READY: 'cyan',
  DEGRADED: 'warning',
  DOWN: 'danger',
  NOT_CONFIGURED: 'warning',
  NOT_IMPLEMENTED: 'neutral',
  CLIENT_READY: 'cyan',
  INTEGRATED: 'success',
  PLANNED: 'violet',
}

export function StateBadge({ state }: { state: ComponentState | IntegrationStatus }) {
  const { t } = useTranslation()
  return <Badge tone={STATE_TONE[state]}>{t(`status.${state}`)}</Badge>
}
