import {
  BrainCircuit,
  CalendarRange,
  SunMoon,
  FileText,
  GitCompareArrows,
  Globe2,
  LayoutDashboard,
  type LucideIcon,
  Rocket,
} from 'lucide-react'

export interface NavItem {
  to: string
  key: 'overview' | 'explorer' | 'simulator' | 'planner' | 'comparison' | 'windows' | 'analyst' | 'reports'
  icon: LucideIcon
  group: 'mission' | 'intelligence'
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', key: 'overview', icon: LayoutDashboard, group: 'mission' },
  { to: '/explorer', key: 'explorer', icon: Globe2, group: 'mission' },
  { to: '/simulator', key: 'simulator', icon: SunMoon, group: 'mission' },
  { to: '/planner', key: 'planner', icon: Rocket, group: 'mission' },
  { to: '/comparison', key: 'comparison', icon: GitCompareArrows, group: 'intelligence' },
  { to: '/windows', key: 'windows', icon: CalendarRange, group: 'intelligence' },
  { to: '/analyst', key: 'analyst', icon: BrainCircuit, group: 'intelligence' },
  { to: '/reports', key: 'reports', icon: FileText, group: 'intelligence' },
]
