import {
  BrainCircuit,
  FileText,
  GitCompareArrows,
  Globe2,
  LayoutDashboard,
  type LucideIcon,
  Rocket,
} from 'lucide-react'

export interface NavItem {
  to: string
  key: 'overview' | 'explorer' | 'planner' | 'comparison' | 'analyst' | 'reports'
  icon: LucideIcon
  group: 'mission' | 'intelligence'
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', key: 'overview', icon: LayoutDashboard, group: 'mission' },
  { to: '/explorer', key: 'explorer', icon: Globe2, group: 'mission' },
  { to: '/planner', key: 'planner', icon: Rocket, group: 'mission' },
  { to: '/comparison', key: 'comparison', icon: GitCompareArrows, group: 'intelligence' },
  { to: '/analyst', key: 'analyst', icon: BrainCircuit, group: 'intelligence' },
  { to: '/reports', key: 'reports', icon: FileText, group: 'intelligence' },
]
