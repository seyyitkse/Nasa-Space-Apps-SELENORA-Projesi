import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'

/**
 * Original, stylized illustration of the Moon seen from above the south pole.
 * Purely decorative — it is NOT a data product and shows no real terrain.
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const C = 250 // centre
const R = 168 // moon radius

export function MoonIllustration({ caption }: { caption: string }) {
  const reduce = useReducedMotion()

  const craters = useMemo(() => {
    const rand = mulberry32(1969)
    return Array.from({ length: 46 }, () => {
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * (R - 14)
      const r = 3 + rand() ** 2.4 * 22
      // foreshortening toward the limb
      const squash = 1 - (d / R) ** 2 * 0.55
      return { x: C + Math.cos(a) * d, y: C + Math.sin(a) * d * 0.98, r, squash, rot: (a * 180) / Math.PI }
    })
  }, [])

  return (
    <figure className="relative mx-auto aspect-square w-full max-w-[480px]" aria-label={caption}>
      <svg viewBox="0 0 500 500" className="h-full w-full" role="img" aria-labelledby="moon-title">
        <title id="moon-title">{caption}</title>
        <defs>
          <radialGradient id="moonBody" cx="38%" cy="32%" r="78%">
            <stop offset="0" stopColor="#E8EDF7" />
            <stop offset="0.35" stopColor="#AEB8C9" />
            <stop offset="0.7" stopColor="#5B6679" />
            <stop offset="1" stopColor="#1D2536" />
          </radialGradient>
          <radialGradient id="crater" cx="60%" cy="62%" r="65%">
            <stop offset="0" stopColor="#0B1120" stopOpacity="0.55" />
            <stop offset="0.75" stopColor="#0B1120" stopOpacity="0.18" />
            <stop offset="1" stopColor="#F4F7FF" stopOpacity="0.22" />
          </radialGradient>
          <linearGradient id="terminator" x1="0" y1="0" x2="1" y2="0.25">
            <stop offset="0.45" stopColor="#070B16" stopOpacity="0" />
            <stop offset="0.82" stopColor="#070B16" stopOpacity="0.72" />
            <stop offset="1" stopColor="#070B16" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id="halo" cx="50%" cy="50%" r="50%">
            <stop offset="0.6" stopColor="#56D9E9" stopOpacity="0.16" />
            <stop offset="1" stopColor="#56D9E9" stopOpacity="0" />
          </radialGradient>
          <clipPath id="moonClip">
            <circle cx={C} cy={C} r={R} />
          </clipPath>
        </defs>

        <circle cx={C} cy={C} r={R + 70} fill="url(#halo)" />

        <g clipPath="url(#moonClip)">
          <circle cx={C} cy={C} r={R} fill="url(#moonBody)" />
          {craters.map((c, i) => (
            <ellipse
              key={i}
              cx={c.x}
              cy={c.y}
              rx={c.r}
              ry={c.r * c.squash}
              transform={`rotate(${c.rot} ${c.x} ${c.y})`}
              fill="url(#crater)"
            />
          ))}
          {/* latitude rings around the south pole (stylized) */}
          {[0.22, 0.45, 0.68, 0.9].map((k) => (
            <circle
              key={k}
              cx={C}
              cy={C}
              r={R * k}
              fill="none"
              stroke="#56D9E9"
              strokeOpacity={0.22}
              strokeDasharray="2 5"
            />
          ))}
          {[0, 30, 60, 90, 120, 150].map((deg) => (
            <line
              key={deg}
              x1={C - Math.cos((deg * Math.PI) / 180) * R}
              y1={C - Math.sin((deg * Math.PI) / 180) * R}
              x2={C + Math.cos((deg * Math.PI) / 180) * R}
              y2={C + Math.sin((deg * Math.PI) / 180) * R}
              stroke="#56D9E9"
              strokeOpacity={0.1}
            />
          ))}
          <rect x={0} y={0} width={500} height={500} fill="url(#terminator)" />
        </g>
        <circle cx={C} cy={C} r={R} fill="none" stroke="#F4F7FF" strokeOpacity={0.14} />

        {/* candidate site markers */}
        {[
          { x: C + 8, y: C - 6, color: '#56D9E9', delay: 0 },
          { x: C + 30, y: C + 22, color: '#9585FF', delay: 0.8 },
          { x: C - 46, y: C - 38, color: '#F5C674', delay: 1.6 },
        ].map((m, i) => (
          <g key={i}>
            {!reduce && (
              <motion.circle
                cx={m.x}
                cy={m.y}
                r={4}
                fill="none"
                stroke={m.color}
                initial={{ r: 4, opacity: 0.9 }}
                animate={{ r: 16, opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, delay: m.delay, ease: 'easeOut' }}
              />
            )}
            <circle cx={m.x} cy={m.y} r={3.5} fill={m.color} stroke="#070B16" strokeWidth={1.5} />
          </g>
        ))}

        {/* orbit ring with Sun & Earth direction markers */}
        <g transform={`rotate(-18 ${C} ${C})`}>
          <ellipse
            cx={C}
            cy={C}
            rx={228}
            ry={64}
            fill="none"
            stroke="#9585FF"
            strokeOpacity={0.35}
            strokeDasharray="1 6"
            strokeLinecap="round"
          />
        </g>
        <motion.g
          style={{ originX: `${C}px`, originY: `${C}px` }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx={C + 222} cy={C - 40} r={7} fill="#F5C674" />
          <circle cx={C + 222} cy={C - 40} r={14} fill="#F5C674" opacity={0.15} />
          <circle cx={C - 214} cy={C + 58} r={5.5} fill="#56D9E9" />
          <circle cx={C - 214} cy={C + 58} r={11} fill="#56D9E9" opacity={0.15} />
        </motion.g>
      </svg>
      <figcaption className="sel-eyebrow absolute right-2 bottom-0 text-[10px] text-fg-3">
        {caption}
      </figcaption>
    </figure>
  )
}
