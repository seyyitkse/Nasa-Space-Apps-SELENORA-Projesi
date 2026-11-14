import { useQueries } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { useAnalyses, useAnalysis, useTimeline } from '@/hooks/useApi'
import { queryKeys, selenoraApi } from '@/services/selenoraApi'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { AnalysisResult } from '@/types/api'

import { buildEpochs, type EpochState, nearestSampleIndex } from './adapter'

const CATALOG_LIMIT = 12

/** Stored analyses with their full results (for names, sites, quality). Newest first. */
export function useAnalysisCatalog() {
  const list = useAnalyses()
  const ids = (list.data ?? []).filter((a) => a.status === 'COMPLETED').slice(0, CATALOG_LIMIT).map((a) => a.id)
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.analysis(id),
      queryFn: () => selenoraApi.getAnalysis(id),
      staleTime: 5 * 60_000,
    })),
  })
  const items = details.map((d) => d.data).filter((d): d is AnalysisResult => Boolean(d))
  return {
    items,
    isPending: list.isPending || details.some((d) => d.isPending),
    error: list.error ?? details.find((d) => d.error)?.error ?? null,
    refetch: list.refetch,
  }
}

export interface SiteEpochs {
  label: string
  index: number
  epochs: EpochState[]
}

/**
 * The analysis currently selected in the shared workspace, plus per-site
 * epoch states. Auto-selects the newest completed analysis if none is chosen.
 */
export function useWorkspaceAnalysis(preferredId?: string) {
  const storeId = useWorkspaceStore((s) => s.analysisId)
  const setAnalysis = useWorkspaceStore((s) => s.setAnalysis)
  const catalog = useAnalyses()
  const fallback = catalog.data?.find((a) => a.status === 'COMPLETED')?.id ?? null
  const id = preferredId ?? storeId ?? fallback ?? undefined

  useEffect(() => {
    if (preferredId && preferredId !== storeId) setAnalysis(preferredId)
    else if (!storeId && fallback) setAnalysis(fallback)
  }, [preferredId, storeId, fallback, setAnalysis])

  const analysis = useAnalysis(id)
  const completed = analysis.data?.status === 'COMPLETED'
  const timeline = useTimeline(id, completed)

  const sites: SiteEpochs[] = useMemo(() => {
    if (!analysis.data || !timeline.data) return []
    return analysis.data.sites.map((s, index) => {
      const tl = timeline.data.sites.find((x) => x.label === s.label) ?? timeline.data.sites[index]
      return { label: s.label, index, epochs: tl ? buildEpochs(analysis.data, s, tl.points) : [] }
    })
  }, [analysis.data, timeline.data])

  return {
    id,
    result: analysis.data,
    timeline: timeline.data,
    sites,
    isPending: catalog.isPending || (Boolean(id) && (analysis.isPending || (completed && timeline.isPending))),
    error: analysis.error ?? timeline.error ?? catalog.error,
    noAnalyses: catalog.isSuccess && !fallback && !preferredId && !storeId,
    refetch: () => {
      void analysis.refetch()
      void timeline.refetch()
    },
  }
}

/** Cursor index into a site's epochs, snapped to a real sample. */
export function useCursorIndex(epochs: EpochState[]) {
  const cursorT = useWorkspaceStore((s) => s.cursorT)
  const setCursor = useWorkspaceStore((s) => s.setCursor)
  const index = cursorT === null ? 0 : Math.max(0, nearestSampleIndex(epochs, cursorT))
  const setIndex = (i: number) => {
    const e = epochs[Math.max(0, Math.min(epochs.length - 1, i))]
    if (e) setCursor(e.t)
  }
  return { index, epoch: epochs[index], setIndex }
}
