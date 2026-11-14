import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type {
  DecisionWeights,
  DemoAnalysisResponse,
  HorizonModel,
  LandingSite,
} from '@/types/api'

/** A user-defined candidate site (not from the backend reference list). */
export interface CustomSite {
  id: string
  name: string
  latitude_deg: number
  longitude_deg: number
}

export type SiteRef = { kind: 'reference' | 'custom'; id: string }

export interface MissionDraft {
  missionName: string
  siteA: SiteRef | null
  siteB: SiteRef | null
  startDate: string // YYYY-MM-DD (UTC)
  endDate: string
  timeStepMinutes: number
  horizonModel: HorizonModel
  weights: DecisionWeights
}

export const DEFAULT_WEIGHTS: DecisionWeights = {
  sun_visibility: 40,
  earth_visibility: 40,
  joint_visibility: 20,
}

export const DEFAULT_DRAFT: MissionDraft = {
  missionName: 'South Pole Reconnaissance',
  siteA: { kind: 'reference', id: 'shackleton-rim-a' },
  siteB: { kind: 'reference', id: 'malapert-massif' },
  startDate: '2026-12-01',
  endDate: '2026-12-29',
  timeStepMinutes: 60,
  horizonModel: 'GEOMETRIC',
  weights: DEFAULT_WEIGHTS,
}

interface MissionState {
  draft: MissionDraft
  customSites: CustomSite[]
  /** Last SYNTHETIC_DEMO run — kept in memory only (not persisted). */
  demo: DemoAnalysisResponse | null
  updateDraft: (patch: Partial<MissionDraft>) => void
  resetDraft: () => void
  assignSite: (slot: 'siteA' | 'siteB', ref: SiteRef) => void
  addCustomSite: (site: Omit<CustomSite, 'id'>) => CustomSite
  removeCustomSite: (id: string) => void
  setDemo: (demo: DemoAnalysisResponse | null) => void
}

export const useMissionStore = create<MissionState>()(
  persist(
    (set, get) => ({
      draft: DEFAULT_DRAFT,
      customSites: [],
      demo: null,
      updateDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
      resetDraft: () => set({ draft: DEFAULT_DRAFT }),
      assignSite: (slot, ref) => set((s) => ({ draft: { ...s.draft, [slot]: ref } })),
      addCustomSite: (site) => {
        const created: CustomSite = { ...site, id: `custom-${Date.now().toString(36)}` }
        set({ customSites: [...get().customSites, created] })
        return created
      },
      removeCustomSite: (id) =>
        set((s) => {
          const clear = (ref: SiteRef | null) =>
            ref?.kind === 'custom' && ref.id === id ? null : ref
          return {
            customSites: s.customSites.filter((c) => c.id !== id),
            draft: { ...s.draft, siteA: clear(s.draft.siteA), siteB: clear(s.draft.siteB) },
          }
        }),
      setDemo: (demo) => set({ demo }),
    }),
    {
      name: 'selenora-mission',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ draft: s.draft, customSites: s.customSites }),
    },
  ),
)

export interface ResolvedSite {
  ref: SiteRef
  name: string
  latitude_deg: number
  longitude_deg: number
  source: 'reference' | 'custom'
}

export function resolveSite(
  ref: SiteRef | null,
  reference: LandingSite[] | undefined,
  custom: CustomSite[],
): ResolvedSite | null {
  if (!ref) return null
  if (ref.kind === 'reference') {
    const s = reference?.find((r) => r.id === ref.id)
    return s
      ? { ref, name: s.name, latitude_deg: s.latitude_deg, longitude_deg: s.longitude_deg, source: 'reference' }
      : null
  }
  const c = custom.find((x) => x.id === ref.id)
  return c
    ? { ref, name: c.name, latitude_deg: c.latitude_deg, longitude_deg: c.longitude_deg, source: 'custom' }
    : null
}
