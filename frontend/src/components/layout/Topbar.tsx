import { FlaskConical, GraduationCap, Languages, Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'

import { useHealth } from '@/hooks/useApi'
import { cn } from '@/lib/utils'
import { useModeStore } from '@/stores/modeStore'
import { useUiStore } from '@/stores/uiStore'

import { LogoMark } from './Logo'
import { NAV_ITEMS } from './navItems'

function ApiStatusPill() {
  const { t } = useTranslation()
  const { data, isPending, isError } = useHealth()
  const state = isPending ? 'checking' : isError ? 'offline' : data?.status === 'ok' ? 'online' : 'degraded'
  const dot = {
    checking: 'bg-fg-3',
    online: 'bg-success',
    degraded: 'bg-warning',
    offline: 'bg-danger',
  }[state]
  return (
    <div
      className="flex h-8 items-center gap-2 rounded-full border border-line bg-surface/60 px-3 text-xs text-fg-2"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {state === 'online' && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60 motion-reduce:hidden" />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', dot)} />
      </span>
      <span className="hidden sm:inline">{t(`status.${state}`)}</span>
      {data && <span className="hidden font-mono text-[10.5px] text-fg-3 md:inline">v{data.version}</span>}
    </div>
  )
}

function LanguageToggle() {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage === 'tr' ? 'tr' : 'en'
  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      className="flex h-8 items-center rounded-full border border-line bg-surface/60 p-0.5"
    >
      <Languages className="mx-1.5 size-3.5 text-fg-3" aria-hidden />
      {(['en', 'tr'] as const).map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => void i18n.changeLanguage(lng)}
          aria-pressed={current === lng}
          className={cn(
            'h-7 cursor-pointer rounded-full px-2.5 font-mono text-[11px] font-medium uppercase transition-colors',
            current === lng ? 'bg-surface-2 text-fg' : 'text-fg-3 hover:text-fg',
          )}
        >
          {lng}
        </button>
      ))}
    </div>
  )
}

/** Explorer (guided, plain language) ↔ Scientist (full controls). Same backend data in both. */
export function ModeToggle() {
  const { t } = useTranslation()
  const mode = useModeStore((s) => s.mode)
  const setMode = useModeStore((s) => s.setMode)
  return (
    <div role="radiogroup" aria-label={t('mode.label')} className="flex h-8 items-center rounded-full border border-line bg-surface/60 p-0.5">
      {(['explorer', 'scientist'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          title={t(`mode.${m}Hint`)}
          onClick={() => setMode(m)}
          className={cn(
            'flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium transition-colors',
            mode === m ? (m === 'explorer' ? 'bg-cyan/15 text-cyan' : 'bg-violet/15 text-violet') : 'text-fg-3 hover:text-fg',
          )}
        >
          {m === 'explorer' ? <GraduationCap className="size-3.5" aria-hidden /> : <FlaskConical className="size-3.5" aria-hidden />}
          <span className="hidden sm:inline">{t(`mode.${m}`)}</span>
        </button>
      ))}
    </div>
  )
}

export function Topbar() {
  const { t } = useTranslation()
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen)
  const { pathname } = useLocation()
  const current = NAV_ITEMS.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/70 px-4 backdrop-blur-xl md:px-8">
      <button
        type="button"
        className="grid size-9 cursor-pointer place-items-center rounded-lg text-fg-2 hover:bg-white/5 lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label={t('nav.openMenu')}
      >
        <Menu className="size-5" />
      </button>
      <LogoMark className="size-7 lg:hidden" />
      <div className="min-w-0 flex-1">
        <div className="sel-eyebrow hidden text-[10px] sm:block">SELENORA / {t('nav.mission')}</div>
        <div className="truncate font-display text-sm font-medium text-fg">
          {current ? t(`nav.${current.key}`) : 'SELENORA'}
        </div>
      </div>
      <ModeToggle />
      <span className="hidden md:contents">
        <ApiStatusPill />
      </span>
      <LanguageToggle />
    </header>
  )
}
