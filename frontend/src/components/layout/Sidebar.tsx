import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'

import { Tooltip } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/uiStore'

import { LogoMark } from './Logo'
import { NAV_ITEMS } from './navItems'

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation()
  return (
    <nav aria-label="Primary" className="flex flex-col gap-6">
      {(['mission', 'intelligence'] as const).map((group) => (
        <div key={group}>
          <div
            className={cn(
              'sel-eyebrow mb-2 px-3 text-[10px] text-fg-3 transition-opacity',
              collapsed && 'opacity-0',
            )}
            aria-hidden={collapsed}
          >
            {t(`nav.${group}`)}
          </div>
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
              const link = (
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  aria-label={collapsed ? t(`nav.${item.key}`) : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors duration-200',
                      isActive
                        ? 'bg-gradient-to-r from-cyan/[0.12] to-transparent text-fg'
                        : 'text-fg-2 hover:bg-white/[0.04] hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-indicator"
                          className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-cyan"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                      <item.icon
                        className={cn(
                          'size-[18px] shrink-0 transition-colors',
                          isActive ? 'text-cyan' : 'text-fg-3 group-hover:text-fg-2',
                        )}
                        aria-hidden
                      />
                      <span className={cn('truncate', collapsed && 'sr-only')}>
                        {t(`nav.${item.key}`)}
                      </span>
                    </>
                  )}
                </NavLink>
              )
              return (
                <li key={item.to}>
                  {collapsed ? <Tooltip content={t(`nav.${item.key}`)}>{link}</Tooltip> : link}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  return (
    <NavLink to="/" className="flex items-center gap-2.5 px-1.5" aria-label="SELENORA home">
      <LogoMark className="size-8 shrink-0" />
      {!collapsed && (
        <div className="min-w-0 leading-none">
          <div className="font-display text-[15px] font-semibold tracking-[0.18em]">SELENORA</div>
          <div className="mt-1 truncate text-[10.5px] text-fg-3">{t('common.subtitle')}</div>
        </div>
      )}
    </NavLink>
  )
}

export function DesktopSidebar() {
  const { t } = useTranslation()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)
  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 252 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-bg-2/60 px-3 py-5 backdrop-blur-xl lg:flex"
    >
      <Brand collapsed={collapsed} />
      <div className="mt-8 flex-1 overflow-y-auto overflow-x-hidden">
        <NavList collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={toggle}
        className="mt-4 flex h-9 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-xs text-fg-3 transition-colors hover:bg-white/[0.04] hover:text-fg"
        aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        aria-expanded={!collapsed}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        {!collapsed && <span>{t('nav.collapse')}</span>}
      </button>
    </motion.aside>
  )
}

export function MobileDrawer() {
  const { t } = useTranslation()
  const open = useUiStore((s) => s.mobileNavOpen)
  const setOpen = useUiStore((s) => s.setMobileNavOpen)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname, setOpen])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.openMenu')}>
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-line bg-bg-2 px-3 py-5"
          >
            <div className="flex items-center justify-between">
              <Brand collapsed={false} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 cursor-pointer place-items-center rounded-lg text-fg-2 hover:bg-white/5"
                aria-label={t('nav.closeMenu')}
                autoFocus
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-8 flex-1 overflow-y-auto">
              <NavList collapsed={false} onNavigate={() => setOpen(false)} />
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
