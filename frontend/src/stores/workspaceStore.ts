import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Shared mission workspace state that keeps the Explorer map, Horizon Simulator,
 * Comparison Lab and Mission Window Explorer synchronised.
 *
 * `cursorT` is always a *sampled epoch* (ms since epoch) — components snap to
 * the nearest returned sample and never invent intermediate ephemeris.
 */
interface WorkspaceState {
  analysisId: string | null
  siteIndex: number
  cursorT: number | null
  playing: boolean
  setAnalysis: (id: string | null) => void
  setSiteIndex: (i: number) => void
  setCursor: (t: number | null) => void
  setPlaying: (p: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      analysisId: null,
      siteIndex: 0,
      cursorT: null,
      playing: false,
      setAnalysis: (analysisId) => set({ analysisId, siteIndex: 0, cursorT: null, playing: false }),
      setSiteIndex: (siteIndex) => set({ siteIndex }),
      setCursor: (cursorT) => set({ cursorT }),
      setPlaying: (playing) => set({ playing }),
    }),
    {
      name: 'selenora-workspace',
      partialize: (s) => ({ analysisId: s.analysisId, siteIndex: s.siteIndex }),
    },
  ),
)
