import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { TooltipProvider } from '@/components/ui/misc'
import { ApiError } from '@/services/apiClient'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Do not hammer the API on client errors; retry network/5xx once.
        retry: (count, err) =>
          count < 1 && !(err instanceof ApiError && err.status !== null && err.status < 500),
      },
    },
  })
}

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? makeQueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      {/* Honour the OS "reduce motion" preference for every Motion animation. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider>{children}</TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
