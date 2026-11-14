import { ArrowRight, Compass, MapPin, ShieldQuestion, Sparkles, SunMoon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { staggerChild, staggerParent } from '@/components/shared/PageTransition'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { useIsScientist } from '@/stores/modeStore'
import { DataSourcesCard, MissionOverviewCard, SystemHealthCard } from '@/features/dashboard/DashboardCards'
import { EngineModeCard, RecentAnalyses } from '@/features/dashboard/HomeWorkspace'
import { MoonIllustration } from '@/features/dashboard/MoonIllustration'

// OpenLayers loads only for the preview, after the hero has rendered.
const SouthPolePreview = lazy(() => import('@/features/dashboard/SouthPolePreview'))

export default function OverviewPage() {
  const { t } = useTranslation()
  const scientist = useIsScientist()
  return (
    <div className="space-y-8">
      {/* ---------------- Hero ---------------- */}
      <section className="sel-card relative overflow-hidden" aria-labelledby="hero-title">
        <div className="sel-grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
        <div className="relative grid items-center gap-6 px-6 py-10 md:px-10 lg:grid-cols-[1.15fr_1fr] lg:py-12">
          <motion.div variants={staggerParent} initial="hidden" animate="show">
            <motion.div variants={staggerChild} className="sel-eyebrow flex items-center gap-2 text-cyan">
              <Sparkles className="size-3.5" aria-hidden /> <span lang="en">{t('overview.eyebrow')}</span>
            </motion.div>
            <motion.h1
              id="hero-title"
              variants={staggerChild}
              className="sel-gradient-text mt-5 font-display text-5xl leading-none font-semibold tracking-[0.08em] sm:text-6xl xl:text-7xl"
            >
              SELENORA
            </motion.h1>
            <motion.p variants={staggerChild} className="mt-4 font-display text-xl font-medium text-fg sm:text-2xl">
              {t('common.subtitle')}
            </motion.p>
            <motion.p variants={staggerChild} className="mt-2 text-[15px] text-gold/90">
              {t('common.slogan')}
            </motion.p>
            <motion.p variants={staggerChild} className="mt-5 max-w-xl text-sm leading-relaxed text-fg-2">
              {t('overview.description')}
            </motion.p>
            <motion.div variants={staggerChild} className="mt-7 flex flex-wrap gap-3">
              <Button asChild variant="primary" size="lg">
                <Link to={scientist ? '/planner' : '/mission'}>
                  {scientist ? t('overview.ctaStart') : t('home5d.startGuided')} <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link to="/explorer">
                  <Compass /> {t('overview.ctaExplore')}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link to="/simulator">
                  <SunMoon /> {t('nav.simulator')}
                </Link>
              </Button>
            </motion.div>
            <motion.div
              variants={staggerChild}
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-line bg-bg-2/60 px-3 py-1.5 text-xs text-fg-2"
            >
              <span className="size-1.5 rounded-full bg-violet" aria-hidden />
              {t('overview.principle')}
            </motion.div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <MoonIllustration caption={t('overview.illustration')} />
          </motion.div>
        </div>
      </section>

      {/* ---------------- 10-second orientation ---------------- */}
      <section aria-labelledby="tensec-title" className="sel-card p-5 md:p-6">
        <h2 id="tensec-title" className="font-display text-lg font-semibold">
          {t('home5d.tenSecTitle')}
        </h2>
        <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
          {([
            { icon: MapPin, k: 's1' },
            { icon: SunMoon, k: 's2' },
            { icon: ShieldQuestion, k: 's3' },
          ] as const).map((s, i) => (
            <li key={s.k} className="flex gap-3 rounded-xl border border-line bg-bg-2/50 p-3.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan/10 font-mono text-[12px] text-cyan">{i + 1}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-fg">
                  <s.icon className="size-4 text-cyan" aria-hidden /> {t(`home5d.${s.k}.title`)}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-fg-2">{t(`home5d.${s.k}.body`)}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px] text-fg-3">{t('home5d.modeNote')}</p>
      </section>

      {/* ---------------- Live mission workspace ---------------- */}
      <section className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-label={t('home.workspace')}>
        <Suspense fallback={<Skeleton className="h-[360px]" />}>
          <SouthPolePreview />
        </Suspense>
        <EngineModeCard />
      </section>

      <RecentAnalyses />

      {/* ---------------- Mission draft & sources ---------------- */}
      <motion.section
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 xl:grid-cols-3"
        aria-label="Mission dashboard"
      >
        <MissionOverviewCard />
        <SystemHealthCard />
        <DataSourcesCard />
      </motion.section>
    </div>
  )
}
