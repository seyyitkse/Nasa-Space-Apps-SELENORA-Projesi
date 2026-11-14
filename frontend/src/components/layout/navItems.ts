import {
  BrainCircuit,
  CalendarRange,
  Compass,
  FileText,
  GitCompareArrows,
  Globe2,
  Orbit,
  LayoutDashboard,
  type LucideIcon,
  Rocket,
  SunMoon,
} from 'lucide-react'

import type { UiMode } from '@/stores/modeStore'

export interface NavItem {
  to: string
  key: 'overview' | 'moon' | 'guided' | 'explorer' | 'simulator' | 'planner' | 'comparison' | 'windows' | 'analyst' | 'reports'
  icon: LucideIcon
  group: 'mission' | 'intelligence'
  /** Modes in which the item appears in the sidebar (all routes stay reachable by URL). */
  modes: UiMode[]
}

const BOTH: UiMode[] = ['explorer', 'scientist']

export const NAV_ITEMS: NavItem[] = [
  { to: '/', key: 'overview', icon: LayoutDashboard, group: 'mission', modes: BOTH },
  { to: '/moon', key: 'moon', icon: Orbit, group: 'mission', modes: BOTH },
  { to: '/mission', key: 'guided', icon: Compass, group: 'mission', modes: BOTH },
  { to: '/explorer', key: 'explorer', icon: Globe2, group: 'mission', modes: BOTH },
  { to: '/simulator', key: 'simulator', icon: SunMoon, group: 'mission', modes: BOTH },
  { to: '/planner', key: 'planner', icon: Rocket, group: 'mission', modes: ['scientist'] },
  { to: '/comparison', key: 'comparison', icon: GitCompareArrows, group: 'intelligence', modes: BOTH },
  { to: '/windows', key: 'windows', icon: CalendarRange, group: 'intelligence', modes: ['scientist'] },
  { to: '/analyst', key: 'analyst', icon: BrainCircuit, group: 'intelligence', modes: BOTH },
  { to: '/reports', key: 'reports', icon: FileText, group: 'intelligence', modes: ['scientist'] },
]
