import { useTranslation } from 'react-i18next'

import { siteColor } from '@/components/shared/siteColors'
import { Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatUtcDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { AnalysisResult } from '@/types/api'

import { useAnalysisCatalog } from './useWorkspaceAnalysis'

export function analysisLabel(a: AnalysisResult) {
  return `${a.mission_name} · ${a.horizon_model} · ${formatUtcDate(a.start_utc)} → ${formatUtcDate(a.end_utc)}`
}

/** Selects the shared workspace analysis (+ optional site). Dark-theme Radix listbox. */
export function AnalysisPicker({
  current,
  showSites = true,
  className,
}: {
  current: AnalysisResult | undefined
  showSites?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const catalog = useAnalysisCatalog()
  const setAnalysis = useWorkspaceStore((s) => s.setAnalysis)
  const siteIndex = useWorkspaceStore((s) => s.siteIndex)
  const setSiteIndex = useWorkspaceStore((s) => s.setSiteIndex)
  const items = catalog.items.some((a) => a.id === current?.id) || !current ? catalog.items : [current, ...catalog.items]
  const disabled = catalog.isPending && items.length === 0

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end', className)}>
      <div className="min-w-0 flex-1">
        <Label htmlFor="ws-analysis">{t('lab.analysis')}</Label>
        <Select
          key={current?.id ?? 'none'}
          value={current?.id}
          onValueChange={(id) => setAnalysis(id || null)}
          disabled={disabled}
        >
          <SelectTrigger id="ws-analysis" aria-label={t('lab.analysis')} className="w-full">
            <SelectValue placeholder={catalog.isPending ? t('common.loading') : t('lab.noAnalyses')} />
          </SelectTrigger>
          <SelectContent>
            {items.length === 0 ? (
              <SelectItem value="__empty" disabled>
                {catalog.isPending ? t('common.loading') : t('lab.noAnalyses')}
              </SelectItem>
            ) : (
              items.map((a) => (
                <SelectItem key={a.id} value={a.id} textValue={analysisLabel(a)}>
                  {analysisLabel(a)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      {showSites && current && current.sites.length > 0 && (
        <div role="radiogroup" aria-label={t('lab.site')} className="flex shrink-0 gap-1.5">
          {current.sites.map((s, i) => (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={siteIndex === i}
              title={s.label}
              onClick={() => setSiteIndex(i)}
              className={cn(
                'flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-xs font-medium transition-colors',
                siteIndex === i ? 'border-line-strong bg-surface-2 text-fg' : 'border-line text-fg-2 hover:text-fg',
              )}
            >
              <span className="size-2 rounded-full" style={{ background: siteColor(i) }} aria-hidden />
              {String.fromCharCode(65 + i)}
              <span className="hidden max-w-[11rem] truncate md:inline">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
