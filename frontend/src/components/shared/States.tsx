import { AlertTriangle, type LucideIcon, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ApiError } from '@/services/apiClient'

export function EmptyState({
  icon: Icon,
  title,
  body,
  actions,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  body?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'sel-grid-bg flex flex-col items-center justify-center rounded-[var(--sel-radius)] border border-dashed border-line-strong px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-line-strong bg-surface-2/70 text-cyan">
        <Icon className="size-5" aria-hidden />
      </div>
      <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
      {body && <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-2">{body}</p>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  compact = false,
}: {
  error: ApiError | Error | null
  onRetry?: () => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const requestId = error && 'requestId' in error ? error.requestId : null
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.06] text-sm',
        compact ? 'p-3' : 'p-4',
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{error?.message ?? t('common.unavailable')}</p>
        {requestId && (
          <p className="mt-0.5 font-mono text-[11px] text-fg-3">
            {t('common.requestId')}: {requestId}
          </p>
        )}
      </div>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          <RefreshCw /> {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
