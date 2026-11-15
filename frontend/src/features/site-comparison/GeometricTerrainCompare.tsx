import { useTranslation } from 'react-i18next'

import { siteColor } from '@/components/shared/siteColors'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatHours, formatPct } from '@/lib/format'
import type { SiteResult } from '@/types/api'

/** Jury-facing geometric vs LOLA terrain deltas (only when TERRAIN analysis). */
export function GeometricTerrainCompare({ sites }: { sites: SiteResult[] }) {
  const { t } = useTranslation()
  const rows = sites.filter((s) => s.geometric_comparison)
  if (rows.length === 0) return null

  const keys = [
    {
      label: t('comparison.sunVisibility'),
      geo: (s: SiteResult) => s.geometric_comparison!.geometric.sun_visibility_pct,
      ter: (s: SiteResult) => s.metrics.sun_visibility_pct,
      delta: (s: SiteResult) => s.geometric_comparison!.sun_visibility_pct_delta,
      fmt: formatPct,
    },
    {
      label: t('comparison.earthVisibility'),
      geo: (s: SiteResult) => s.geometric_comparison!.geometric.earth_visibility_pct,
      ter: (s: SiteResult) => s.metrics.earth_visibility_pct,
      delta: (s: SiteResult) => s.geometric_comparison!.earth_visibility_pct_delta,
      fmt: formatPct,
    },
    {
      label: t('comparison.jointVisibility'),
      geo: (s: SiteResult) => s.geometric_comparison!.geometric.joint_visibility_pct,
      ter: (s: SiteResult) => s.metrics.joint_visibility_pct,
      delta: (s: SiteResult) => s.geometric_comparison!.joint_visibility_pct_delta,
      fmt: formatPct,
    },
    {
      label: t('comparison.longestDarkness'),
      geo: (s: SiteResult) => s.geometric_comparison!.geometric.longest_darkness_hours,
      ter: (s: SiteResult) => s.metrics.longest_darkness_hours,
      delta: (s: SiteResult) => s.geometric_comparison!.longest_darkness_hours_delta,
      fmt: formatHours,
    },
    {
      label: t('comparison.commGap'),
      geo: (s: SiteResult) => s.geometric_comparison!.geometric.longest_communication_gap_hours,
      ter: (s: SiteResult) => s.metrics.longest_communication_gap_hours,
      delta: (s: SiteResult) => s.geometric_comparison!.longest_communication_gap_hours_delta,
      fmt: formatHours,
    },
  ] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('terrainCompare.title')}</CardTitle>
        <CardDescription>{t('terrainCompare.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[12px] text-fg-3">{t('terrainCompare.coverageWarn')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-line text-fg-3">
                <th className="py-2 pr-3 font-medium">Site</th>
                <th className="py-2 pr-3 font-medium">Metric</th>
                <th className="py-2 pr-3 font-medium">{t('terrainCompare.geometric')}</th>
                <th className="py-2 pr-3 font-medium">{t('terrainCompare.terrain')}</th>
                <th className="py-2 font-medium">{t('terrainCompare.delta')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, si) =>
                keys.map((k) => (
                  <tr key={`${s.label}-${k.label}`} className="border-b border-line/60">
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-fg-2">
                        <span className="size-1.5 rounded-full" style={{ background: siteColor(si) }} aria-hidden />
                        {String.fromCharCode(65 + si)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-fg-2">{k.label}</td>
                    <td className="py-2 pr-3 font-mono text-fg-2">{k.fmt(k.geo(s))}</td>
                    <td className="py-2 pr-3 font-mono text-fg">{k.fmt(k.ter(s))}</td>
                    <td className="py-2 font-mono text-fg-2">
                      {k.delta(s) == null
                        ? '—'
                        : `${(k.delta(s) as number) > 0 ? '+' : ''}${k.fmt(k.delta(s) as number)}`}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <ul className="space-y-1 font-mono text-[11px] text-fg-3">
          {rows.map((s) =>
            s.terrain ? (
              <li key={s.label}>
                {s.label}: {s.terrain.dem_file ?? '—'} · {s.terrain.resolution_m ?? '—'} m/pix · coverage{' '}
                {s.terrain.horizon_coverage_fraction != null
                  ? `${(s.terrain.horizon_coverage_fraction * 100).toFixed(0)}%`
                  : '—'}{' '}
                · Z={s.terrain.surface_z_m?.toFixed(1) ?? '—'} m · h_obs=
                {s.terrain.observer_height_m ?? '—'} m
              </li>
            ) : null,
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
