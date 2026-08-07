'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconHome, IconTrophy, IconClipboardList, IconSettings,
} from './icons'

/**
 * The bottom tab bar — the primary navigation for the whole app.
 *
 * Fixed to the bottom of the viewport, because the app is used one-handed on
 * a phone while holding a golf club. The padding-bottom clears the iPhone
 * home indicator; without it the labels sit under the system bar and the
 * bottom row of taps lands on nothing.
 *
 * Scoped to a trip: every destination needs the trip code, and there is no
 * app-level navigation to speak of. The last tab goes to Trip Setup, which is
 * what the copy across the app calls that screen — it was "Settings" here and
 * "Trip Setup" everywhere pointing at it. Two words, but shorter than
 * "Leaderboard" beside it, so it still fits the narrowest phone on one line.
 *
 * Deliberately not rendered on the scoring screens themselves — see the note
 * on `hide` below.
 */

const ITEMS = [
  { key: 'home',        label: 'Home',        icon: IconHome,          path: (t: string) => `/trip/${t}` },
  { key: 'leaderboard', label: 'Leaderboard', icon: IconTrophy,        path: (t: string) => `/trip/${t}/leaderboard` },
  { key: 'scoring',     label: 'Scoring',     icon: IconClipboardList, path: (t: string) => `/trip/${t}/scoring` },
  { key: 'settings',    label: 'Trip Setup',  icon: IconSettings,      path: (t: string) => `/trip/${t}/setup` },
] as const

export default function TabBar({ tripCode }: { tripCode: string }) {
  const pathname = usePathname() ?? ''
  const base = `/trip/${tripCode}`

  /**
   * Which tab is lit.
   *
   * Home is only home — an exact match — because every other route starts
   * with the same prefix and a `startsWith` check would light Home on every
   * screen in the app. The rest match their own subtree, so a round inside
   * Scoring keeps Scoring lit.
   */
  const activeKey = (() => {
    if (pathname === base || pathname === `${base}/`) return 'home'
    if (pathname.startsWith(`${base}/leaderboard`)) return 'leaderboard'
    if (pathname.startsWith(`${base}/scoring`)) return 'scoring'
    if (pathname.startsWith(`${base}/setup`) || pathname.startsWith(`${base}/teams`)) return 'settings'
    // Players, matchplay and anything else: no tab claims it rather than a
    // wrong one being lit.
    return null
  })()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-bark/12"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Trip"
    >
      <ul className="max-w-lg mx-auto grid grid-cols-4">
        {ITEMS.map(item => {
          const active = activeKey === item.key
          const Icon = item.icon
          return (
            <li key={item.key}>
              <Link
                href={item.path(tripCode)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 h-16 transition-colors duration-150 ${
                  active ? 'text-accent' : 'text-bark/60 hover:text-bark/80'
                }`}
              >
                <Icon size={20} />
                {/* The smallest type in the app, and the one place it is
                    justified: four labels across the narrowest phone, and
                    "Leaderboard" is eleven characters of it. 11px rather than
                    the 10 it was — it still fits a 320px screen with room to
                    spare, and the bar is read at arm's length like everything
                    else. Any larger and the longest label wraps. */}
                <span
                  className="font-[family-name:var(--font-ui)] leading-none whitespace-nowrap"
                  style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
