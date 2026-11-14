import { Switch as SwitchPrimitive, Tabs as TabsPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

/* ---------------- Skeleton ---------------- */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-md bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04]',
        className,
      )}
      {...props}
    />
  )
}

/* ---------------- Separator ---------------- */
export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-line', className)} />
}

/* ---------------- Switch ---------------- */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-cyan/50 data-[state=checked]:bg-cyan/25',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-fg-2 transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-cyan" />
    </SwitchPrimitive.Root>
  )
}

/* ---------------- Tabs ---------------- */
export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex items-center gap-1 rounded-[10px] border border-line bg-bg-2/70 p-1',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'cursor-pointer rounded-[7px] px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-cyan data-[state=active]:bg-surface-2 data-[state=active]:text-fg data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export const TabsContent = TabsPrimitive.Content

/* ---------------- Tooltip ---------------- */
export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  content,
  children,
  side = 'right',
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className="z-50 max-w-xs rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-fg shadow-xl"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
