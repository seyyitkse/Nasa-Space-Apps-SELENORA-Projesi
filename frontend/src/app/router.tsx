import { lazy } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'

// Route-based code splitting: OpenLayers & Recharts only load on the pages that use them.
const OverviewPage = lazy(() => import('@/pages/OverviewPage'))
const ExplorerPage = lazy(() => import('@/pages/ExplorerPage'))
const PlannerPage = lazy(() => import('@/pages/PlannerPage'))
const ComparisonPage = lazy(() => import('@/pages/ComparisonPage'))
const AnalystPage = lazy(() => import('@/pages/AnalystPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'explorer', element: <ExplorerPage /> },
      { path: 'planner', element: <PlannerPage /> },
      { path: 'comparison', element: <ComparisonPage /> },
      { path: 'comparison/:analysisId', element: <ComparisonPage /> },
      { path: 'analyst', element: <AnalystPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'reports/:analysisId', element: <ReportsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const createAppRouter = () => createBrowserRouter(routes)
