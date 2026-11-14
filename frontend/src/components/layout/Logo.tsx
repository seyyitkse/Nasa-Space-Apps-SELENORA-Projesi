export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id="lm" cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="#F4F7FF" />
          <stop offset=".55" stopColor="#94A3B8" />
          <stop offset="1" stopColor="#1B2538" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="17" fill="url(#lm)" />
      <ellipse
        cx="32"
        cy="32"
        rx="28"
        ry="9"
        fill="none"
        stroke="#56D9E9"
        strokeWidth="2.2"
        transform="rotate(-24 32 32)"
      />
      <circle cx="55" cy="21" r="3.2" fill="#F5C674" />
    </svg>
  )
}
