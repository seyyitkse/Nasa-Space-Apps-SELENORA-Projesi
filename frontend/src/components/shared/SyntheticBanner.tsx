import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function SyntheticBanner() {
  const { t } = useTranslation()
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gradient-to-r from-gold/[0.09] to-transparent px-4 py-3 text-sm"
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
      <p className="text-fg-2">
        <span className="mr-2 font-mono text-[11px] font-semibold tracking-wider text-gold">
          SYNTHETIC_DEMO
        </span>
        {t('quality.syntheticWarning')}
      </p>
    </div>
  )
}
