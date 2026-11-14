import { ChevronDown, HelpCircle } from 'lucide-react'
import { Popover } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { useModeStore } from '@/stores/modeStore'

export type GlossaryKey =
  | 'ephemeris'
  | 'horizon'
  | 'elevation'
  | 'azimuth'
  | 'dem'
  | 'terrainBlocked'
  | 'unknown'
  | 'partialTerrain'
  | 'directToEarth'
  | 'joint'
  | 'score'
  | 'sampledEpoch'
  | 'exaggeration'

/**
 * Inline glossary term. Opens on click/tap/Enter (works on touch screens, unlike
 * hover tooltips) and is announced to screen readers.
 */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline cursor-help rounded-sm text-inherit underline decoration-cyan/60 decoration-dotted underline-offset-[3px] hover:text-cyan focus-visible:outline-2 focus-visible:outline-cyan"
          aria-label={t('glossary.aria', { term: t(`glossary.${k}.term`) })}
        >
          {children ?? t(`glossary.${k}.term`)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-3 text-[12.5px] leading-relaxed text-fg-2 shadow-xl"
        >
          <div className="mb-1 font-medium text-fg">{t(`glossary.${k}.term`)}</div>
          {t(`glossary.${k}.def`)}
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Small "?" help button with a contextual explanation. */
export function HelpTip({ text, label }: { text: ReactNode; label: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label={label} className="inline-grid size-5 cursor-help place-items-center rounded-full text-fg-3 hover:text-cyan focus-visible:outline-2 focus-visible:outline-cyan">
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={6} collisionPadding={12} className="z-50 max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-3 text-[12.5px] leading-relaxed text-fg-2 shadow-xl">
          {text}
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * Progressive disclosure: collapsed by default in Explorer Mode, expanded in
 * Scientist Mode. Content is identical in both modes — only visibility changes.
 */
export function Advanced({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const { t } = useTranslation()
  const scientist = useModeStore((s) => s.mode === 'scientist')
  const [open, setOpen] = useState<boolean | null>(null)
  const isOpen = open ?? scientist
  return (
    <section className={cn('rounded-[var(--sel-radius)] border border-line', !isOpen && 'bg-bg-2/40', className)}>
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-[13px] font-medium text-fg">{title}</span>
          {!isOpen && <span className="block text-[11.5px] text-fg-3">{t('mode.advancedHint')}</span>}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-fg-3 transition-transform', isOpen && 'rotate-180')} aria-hidden />
      </button>
      {isOpen && <div className="space-y-5 px-1 pb-1 sm:px-0">{children}</div>}
    </section>
  )
}
