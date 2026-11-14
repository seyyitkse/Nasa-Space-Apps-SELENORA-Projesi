import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-[background,border-color,color,box-shadow,transform] duration-200 ease-premium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-cyan text-bg shadow-[0_0_0_1px_rgb(86_217_233/0.4),0_8px_24px_-8px_rgb(86_217_233/0.55)] hover:bg-[#7ae4f0]',
        secondary:
          'border border-line-strong bg-surface-2/70 text-fg hover:border-cyan/50 hover:bg-surface-2',
        ghost: 'text-fg-2 hover:bg-white/5 hover:text-fg',
        outline: 'border border-line-strong text-fg hover:border-cyan/60 hover:text-cyan',
        violet:
          'bg-violet text-white shadow-[0_8px_24px_-10px_rgb(149_133_255/0.7)] hover:bg-[#a597ff]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

// eslint-disable-next-line react-refresh/only-export-components
export { buttonVariants }
