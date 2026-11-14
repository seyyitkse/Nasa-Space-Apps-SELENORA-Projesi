import { ArrowRight, Compass, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { staggerChild, staggerParent } from '@/components/shared/PageTransition'
import { Button } from '@/components/ui/button'
import {
  AnalysisStatusCard,
  DataSourcesCard,
  ExampleSitesCard,
  MissionOverviewCard,
  PlannerAccessCard,
  SystemHealthCard,
} from '@/features/dashboard/DashboardCards'
import { MoonIllustration } from '@/features/dashboard/MoonIllustration'

export default function OverviewPage() {
  const { t } = useTranslation()
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
                <Link to="/planner">
                  {t('overview.ctaStart')} <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link to="/explorer">
                  <Compass /> {t('overview.ctaExplore')}
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

      {/* ---------------- Dashboard ---------------- */}
      <motion.section
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
        aria-label="Mission dashboard"
      >
        <MissionOverviewCard />
        <PlannerAccessCard />
        <SystemHealthCard />
        <ExampleSitesCard />
        <DataSourcesCard />
        <AnalysisStatusCard />
      </motion.section>
    </div>
  )
}
