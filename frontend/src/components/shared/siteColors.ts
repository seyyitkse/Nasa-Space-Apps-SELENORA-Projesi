/** Stable per-site series colours used across every chart (index = site order). */
export const SITE_COLORS = ['#56D9E9', '#9585FF', '#F5C674', '#6EE7B7', '#F49AC2', '#93C5FD'] as const

export function siteColor(index: number): string {
  return SITE_COLORS[index % SITE_COLORS.length] ?? '#56D9E9'
}

/** Body colours: the Sun is gold, the Earth is cyan, joint visibility violet. */
export const BODY_COLORS = { sun: '#F5C674', earth: '#56D9E9', joint: '#9585FF' } as const
