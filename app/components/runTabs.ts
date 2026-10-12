import { IconHome, IconPlus, IconTrophy, IconChartBar, IconSettings } from './icons'

/**
 * A run challenge's five tabs — the same bar golf draws (TabBar.tsx), with
 * running's destinations. Kept out of TabBar.tsx so golf's own list there
 * stays exactly golf's.
 *
 * The leaderboard holds the centre, as on golf: position is the emphasis.
 * Add is where a run is logged — and where Strava is connected, once it is.
 * Settings is the runner's own (who this phone is) with the way into the
 * organiser area, so the PIN is never a wall in front of the whole tab.
 */
export const RUN_TABS = [
  { key: 'home',        label: 'Home',        icon: IconHome,     path: (t: string) => `/run/${t}` },
  { key: 'add',         label: 'Add',         icon: IconPlus,     path: (t: string) => `/run/${t}/add` },
  { key: 'leaderboard', label: 'Leaderboard', icon: IconTrophy,   path: (t: string) => `/run/${t}/leaderboard` },
  { key: 'stats',       label: 'Stats',       icon: IconChartBar, path: (t: string) => `/run/${t}/stats` },
  { key: 'settings',    label: 'Settings',    icon: IconSettings, path: (t: string) => `/run/${t}/settings` },
] as const

/**
 * Which run tab is lit. Home only on an exact match; the organiser area
 * lights Settings, which is the door to it; joining lights nothing.
 */
export function runActiveKey(pathname: string, tripCode: string): string | null {
  const base = `/run/${tripCode}`
  if (pathname === base || pathname === `${base}/`) return 'home'
  if (pathname.startsWith(`${base}/add`)) return 'add'
  if (pathname.startsWith(`${base}/leaderboard`)) return 'leaderboard'
  if (pathname.startsWith(`${base}/stats`)) return 'stats'
  if (pathname.startsWith(`${base}/settings`) || pathname.startsWith(`${base}/organiser`)) return 'settings'
  return null
}
