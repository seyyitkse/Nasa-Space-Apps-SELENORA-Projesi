import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI mode. Both modes call the same backend endpoints and show the same verified
 * numbers — Explorer Mode only changes presentation (plain language first,
 * scientific detail on demand). It never computes simplified science.
 */
export type UiMode = 'explorer' | 'scientist'

interface ModeState {
  mode: UiMode
  setMode: (m: UiMode) => void
}

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      mode: 'explorer',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'selenora-mode' },
  ),
)

export const useIsScientist = () => useModeStore((s) => s.mode === 'scientist')
