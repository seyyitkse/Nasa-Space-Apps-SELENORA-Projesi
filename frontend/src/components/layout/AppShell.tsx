import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'

import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Skeleton } from '@/components/ui/misc'

import { DesktopSidebar, MobileDrawer } from './Sidebar'
import { Topbar } from './Topbar'

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  )
}

export function AppShell() {
  const { t } = useTranslation()
  const location = useLocation()
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-cyan px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('nav.skipToContent')}
      </a>
      <DesktopSidebar />
      <MobileDrawer />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 outline-none md:px-8 md:py-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <footer className="no-print border-t border-line px-4 py-4 text-[11.5px] text-fg-3 md:px-8">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-1 sm:flex-row sm:justify-between">
            <span>{t('common.researchOnly')}</span>
            <span className="font-mono">NASA Space Apps Challenge 2026 · SELENORA</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
