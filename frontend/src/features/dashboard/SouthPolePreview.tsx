import { ArrowRight, Mountain } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useSites } from '@/hooks/useApi'
import { useCapabilities, useTerrainCatalog } from '@/services/contracts'

import { DEFAULT_LAYERS, LunarMap, type MapSite } from '../lunar-explorer/LunarMap'

/** Live south-pole preview: real reference sites + real LOLA tile footprints. Lazy-loaded (OpenLayers). */
export default function SouthPolePreview() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = useSites()
  const caps = useCapabilities()
  const catalog = useTerrainCatalog(caps.has('terrainCatalog'))
  const sites: MapSite[] = useMemo(() => (data?.items ?? []).map((s) => ({ ...s, kind: 'reference' as const })), [data])
  const tiles = catalog.data?.tiles ?? []

  return (
    <Card className="relative h-full min-h-[360px] overflow-hidden">
      <LunarMap
        sites={sites}
        selectedId={null}
        layers={{ ...DEFAULT_LAYERS, labels: true }}
        tiles={tiles}
        onSelect={(id) => navigate(`/explorer?site=${encodeURIComponent(id)}`)}
        ariaLabel={t('home.previewAria')}
        focusLat={-87.5}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-bg/90 to-transparent p-4 pr-16">
        <div>
          <div className="sel-eyebrow text-[10px] text-cyan">{t('home.previewEyebrow')}</div>
          <div className="mt-1 font-display text-base font-semibold">{t('home.previewTitle')}</div>
        </div>
        {tiles.length > 0 && (
          <Badge tone="success" className="pointer-events-auto">
            <Mountain className="size-3" aria-hidden /> {t('home.lolaTiles', { n: tiles.length })}
          </Badge>
        )}
      </div>
      <div className="absolute right-3 bottom-3 left-3 flex flex-wrap items-end justify-between gap-2">
        <p className="pointer-events-none max-w-xs rounded-lg bg-bg/80 px-2.5 py-1.5 text-[10.5px] leading-snug text-fg-3 backdrop-blur">
          {t('home.previewNote')}
        </p>
        <Button asChild size="sm" variant="secondary">
          <Link to="/explorer">
            {t('overview.ctaExplore')} <ArrowRight />
          </Link>
        </Button>
      </div>
    </Card>
  )
}
