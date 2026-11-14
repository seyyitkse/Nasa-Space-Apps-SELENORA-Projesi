import * as React from 'react'

import { cn } from '@/lib/utils'

const fieldBase =
  'h-10 w-full rounded-[10px] border border-line-strong bg-bg-2/80 px-3 text-sm text-fg placeholder:text-fg-3 transition-colors duration-200 hover:border-fg-3 focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/25 disabled:opacity-50 aria-[invalid=true]:border-danger/70 aria-[invalid=true]:ring-danger/20'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, '[color-scheme:dark]', className)} {...props} />
}

/**
 * Native &lt;select&gt; fallback. Prefer `@/components/ui/select` (Radix) for menus —
 * OS option popups often ignore page CSS (white-on-white in dark theme).
 */
export function NativeSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        fieldBase,
        '[color-scheme:dark]',
        'appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394A3B8%27%20stroke-width=%272%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[length:14px] bg-[right_0.75rem_center] bg-no-repeat pr-9',
        // Best-effort option styling (Chromium honour; Safari/Firefox still OS-native).
        '[&>option]:bg-bg-2 [&>option]:text-fg',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label className={cn('mb-1.5 block text-[12.5px] font-medium text-fg-2', className)} {...props} />
  )
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-danger">
      {children}
    </p>
  )
}
