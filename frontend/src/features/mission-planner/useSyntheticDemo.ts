import { useMutation } from '@tanstack/react-query'

import { selenoraApi } from '@/services/selenoraApi'
import { useMissionStore } from '@/stores/missionStore'
import type { AnalysisCreate } from '@/types/api'

/** Runs the deterministic pipeline on SYNTHETIC_DEMO data and stores the result in memory. */
export function useSyntheticDemo() {
  const setDemo = useMissionStore((s) => s.setDemo)
  return useMutation({
    mutationFn: (body: AnalysisCreate) => selenoraApi.syntheticAnalysis(body),
    onSuccess: (data) => setDemo(data),
  })
}
