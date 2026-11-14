# Design System — "Premium Dark Space Interface"

Source of truth: `frontend/src/styles/globals.css` (CSS variables on `:root`,
exposed to Tailwind v4 via `@theme inline`).

## Colour tokens

| Token (CSS var) | Tailwind | Value | Use |
|---|---|---|---|
| `--sel-bg` | `bg-bg` | `#070B16` | App background |
| `--sel-bg-2` | `bg-bg-2` | `#101827` | Sidebar, inputs, inset panels |
| `--sel-surface` | `bg-surface` | `#151F32` | Cards |
| `--sel-surface-2` | `bg-surface-2` | `#1B2740` | Raised / active elements |
| `--sel-text` | `text-fg` | `#F4F7FF` | Primary text |
| `--sel-text-2` | `text-fg-2` | `#94A3B8` | Secondary text |
| `--sel-text-3` | `text-fg-3` | `#64748B` | Tertiary / captions |
| `--sel-cyan` | `cyan` | `#56D9E9` | Primary accent, Site A, Earth |
| `--sel-violet` | `violet` | `#9585FF` | Secondary accent, Site B, joint visibility, AI |
| `--sel-gold` | `gold` | `#F5C674` | Sun, ranking #1, `SYNTHETIC_DEMO` |
| `--sel-success/warning/danger` | `success/warning/danger` | `#4ADE80 / #FBBF24 / #F87171` | Status; danger = darkness, warning = comm gap |

**Semantic colour is fixed:** Sun = gold, Earth = cyan, Joint = violet. Site
series colours come from `components/shared/siteColors.ts` (A cyan, B violet, C gold, …).

## Typography

- Display: **Space Grotesk Variable** (`font-display`) — headings, big numbers.
- Body: **Inter Variable** (`font-sans`).
- Data/labels: **JetBrains Mono Variable** (`font-mono`) — coordinates, units, IDs, eyebrows.
- Fonts are self-hosted via `@fontsource-variable/*` (no runtime Google Fonts dependency).
- Scale: page title 28px, card title 15px, body 13–14px, captions 11px, eyebrow 11px uppercase +0.14em tracking.

## Layout & spacing

- 4px base grid; cards use 20px padding (`px-5`), grids use 20px gaps (`gap-5`).
- Content max width 1440px; sidebar 252px (collapsed 76px); top bar 64px.
- Breakpoints: Tailwind defaults. Sidebar → drawer below `lg` (1024px).
- Grids must set `grid-cols-[minmax(0,1fr)]` for the mobile track; `.sel-card` has `min-width: 0` so charts never cause horizontal scroll.

## Components

- `.sel-card` — gradient surface, 1px hairline border, 14px radius, soft inset+drop shadow.
- `Button` variants: `primary` (cyan), `secondary`, `outline`, `ghost`, `violet` (AI actions). Sizes `sm/md/lg/icon`.
- `Badge` tones mirror status semantics; always uppercase mono.
- `DataQualityBadge` / `SyntheticBanner` — mandatory wherever analysis data is shown.
- Empty, loading (skeleton) and error (`ErrorState` with request ID + retry) states exist for every API-backed view.
- Forms: label above field, error below in `text-danger` with `role="alert"`, `aria-invalid` + `aria-describedby`.

## Motion

- Motion for React; durations 200–400 ms, easing `cubic-bezier(0.22, 1, 0.36, 1)`.
- Patterns: page fade-up (10px), staggered card reveal (60 ms), sidebar width spring, active-nav `layoutId` indicator, drawer slide.
- Ambient motion only in the hero illustration (slow 120 s orbit, marker pulses).
- `MotionConfig reducedMotion="user"` + CSS `prefers-reduced-motion` override disable non-essential animation.
- No blinking, no heavy glow; charts render without entry animation for performance.

## Charts (Recharts)

- Axis text mono 11px `#64748B`; grid `rgba(148,163,184,0.10)`, horizontal only.
- Units always in axis/tooltip (`°`, `%`, `h`); times in UTC.
- Horizon reference line at 0° in danger red, dashed.
- Failure visualisation: longest darkness (red outline) and longest comm gap (amber outline) are drawn on the timeline.

## Accessibility

Skip link, landmark roles, focus-visible rings (cyan), keyboard-operable nav,
drawer closes on Escape and locks scroll, icon-only buttons have `aria-label`,
`lang` attribute follows the selected language.
