import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-medium tracking-wide uppercase whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-line-strong bg-white/[0.03] text-fg-2',
        cyan: 'border-cyan/30 bg-cyan/10 text-cyan',
        violet: 'border-violet/30 bg-violet/10 text-violet',
        gold: 'border-gold/35 bg-gold/10 text-gold',
        success: 'border-success/30 bg-success/10 text-success',
        warning: 'border-warning/35 bg-warning/10 text-warning',
        danger: 'border-danger/35 bg-danger/10 text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
