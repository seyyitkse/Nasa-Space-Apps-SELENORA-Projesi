import { BookOpenCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DataQualityBadge } from '@/components/shared/badges'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatUtc } from '@/lib/format'
import type { AnalysisResult } from '@/types/api'

/** Jury-facing provenance panel — distinguishes real ephemeris from synthetic demos. */
export function ScienceTransparencyPanel({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation()
  const rows: [string, string][] = [
    [t('transparency.dataQuality'), result.data_quality],
    [t('transparency.algorithm'), result.algorithm_version],
    [t('transparency.horizon'), result.horizon_model],
    [t('transparency.window'), `${result.start_utc} → ${result.end_utc}`],
    [t('transparency.sampling'), `${result.time_step_minutes} min`],
    [t('transparency.created'), formatUtc(result.created_at)],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpenCheck className="size-4 text-cyan" aria-hidden />
          {t('transparency.title')}
        </CardTitle>
        <CardDescription>{t('transparency.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DataQualityBadge quality={result.data_quality} />
          {result.data_quality === 'EPHEMERIS_GEOMETRIC' && (
            <span className="text-[11px] text-fg-3">{t('transparency.realEphemerisHint')}</span>
          )}
          {(result.data_quality === 'EPHEMERIS_TERRAIN' ||
            result.data_quality === 'LOCAL_TERRAIN_PARTIAL') && (
            <span className="text-[11px] text-success/90">{t('transparency.realTerrainHint')}</span>
          )}
          {result.data_quality === 'SYNTHETIC_DEMO' && (
            <span className="text-[11px] text-gold/90">{t('quality.syntheticWarning')}</span>
          )}
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-bg-2/50 p-2.5">
              <dt className="text-[10.5px] text-fg-3">{k}</dt>
              <dd className="mt-0.5 break-words font-mono text-[11.5px] text-fg">{v}</dd>
            </div>
          ))}
        </dl>

        {result.horizon_model === 'TERRAIN' && result.sites.some((s) => s.terrain) && (
          <div>
            <div className="sel-eyebrow mb-2 text-[10px]">{t('transparency.terrainMeta')}</div>
            <ul className="space-y-1.5 font-mono text-[11.5px] text-fg-2">
              {result.sites.map(
                (s) =>
                  s.terrain && (
                    <li key={s.label}>
                      <span className="text-fg">{s.label}</span>
                      {': '}
                      {s.terrain.dem_file ?? '—'} · {t('transparency.resolution')}{' '}
                      {s.terrain.resolution_m ?? '—'} m · {t('transparency.horizonCoverage')}{' '}
                      {s.terrain.horizon_coverage_fraction != null
                        ? `${(s.terrain.horizon_coverage_fraction * 100).toFixed(0)}%`
                        : '—'}{' '}
                      · {t('transparency.observerHeight')} {s.terrain.observer_height_m ?? '—'} m · Z=
                      {s.terrain.surface_z_m?.toFixed(1) ?? '—'} m · {s.terrain.dataset_version}
                    </li>
                  ),
              )}
            </ul>
          </div>
        )}

        <div>
          <div className="sel-eyebrow mb-2 text-[10px]">{t('transparency.sites')}</div>
          <ul className="space-y-1.5 font-mono text-[11.5px] text-fg-2">
            {result.sites.map((s) => (
              <li key={s.label}>
                <span className="text-fg">{s.label}</span>
                {': '}
                {s.latitude_deg.toFixed(4)}°, {s.longitude_deg.toFixed(4)}° E
                {' · '}
                {t('transparency.coordFrame')}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="sel-eyebrow mb-2 text-[10px]">{t('reports.provenance')}</div>
          <ul className="space-y-2 text-[12px] leading-relaxed text-fg-2">
            {result.provenance.map((p) => (
              <li key={`${p.source_id}-${p.version ?? 'na'}`} className="rounded-lg border border-line p-2.5">
                <div className="font-mono text-[11px] text-fg">
                  {p.source_id}
                  {p.version ? ` · v${p.version}` : ''}
                </div>
                <p className="mt-1">{p.description}</p>
                {p.retrieved_at && (
                  <p className="mt-1 font-mono text-[10.5px] text-fg-3">
                    {t('transparency.retrieved')}: {formatUtc(p.retrieved_at)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="sel-eyebrow mb-2 text-[10px]">{t('transparency.assumptions')}</div>
          <ul className="list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-fg-2 marker:text-fg-3">
            {result.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="sel-eyebrow mb-2 text-[10px]">{t('comparison.limitations')}</div>
          <ul className="list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-fg-2 marker:text-fg-3">
            {result.limitations.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
