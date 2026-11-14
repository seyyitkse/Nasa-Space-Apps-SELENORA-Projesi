import { Slider as SliderPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

export function Slider({
  className,
  accent = 'var(--sel-cyan)',
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { accent?: string }) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex h-5 w-full touch-none items-center select-none', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/8">
        <SliderPrimitive.Range className="absolute h-full rounded-full" style={{ background: accent }} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={props['aria-label']}
        className="block size-4 cursor-grab rounded-full border-2 bg-bg shadow-md transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-cyan/25 focus-visible:outline-none active:cursor-grabbing"
        style={{ borderColor: accent }}
      />
    </SliderPrimitive.Root>
  )
}
