'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  IconHome, IconTrophy, IconClipboardList, IconSettings, IconChartBar,
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
 * app-level navigation to speak of. "Trip Setup" is what the copy across the
 * app calls that screen — it was "Settings" here and "Trip Setup" everywhere
 * pointing at it.
 *
 * **Five tabs** — Stats earned a place once the hub became an instrument.
 * The leaderboard holds the centre, which is emphasis enough: the emerald
 * circle around it was tried and retired in the same day — first the label
 * had to go, then it came back and dragged the alignment sideways, and Big
 * Dog called it: more trouble than it was worth. Five identical tabs, the
 * board in the middle because the middle is where the thumb rests.
 *
 * Rendered once, by `app/trip/[tripCode]/layout.tsx`, and never by a page.
 * That is what keeps it on screen through a navigation instead of unmounting
 * with the page that drew it — see the note in that file.
 *
 * Deliberately not rendered on the scoring screens themselves — see the note
 * on `hide` below.
 */

const ITEMS = [
  { key: 'home',        label: 'Home',        icon: IconHome,          path: (t: string) => `/trip/${t}` },
  { key: 'scoring',     label: 'Scoring',     icon: IconClipboardList, path: (t: string) => `/trip/${t}/scoring` },
  { key: 'leaderboard', label: 'Leaderboard', icon: IconTrophy,        path: (t: string) => `/trip/${t}/leaderboard` },
  { key: 'stats',       label: 'Stats',       icon: IconChartBar,      path: (t: string) => `/trip/${t}/stats` },
  { key: 'settings',    label: 'Trip Setup',  icon: IconSettings,      path: (t: string) => `/trip/${t}/setup` },
] as const

/**
 * What one tab looks like, once it knows whether it is the page you are on
 * and whether it is the page you are on your way to.
 *
 * Its own component because `useLinkStatus` reads the `<Link>` above it —
 * there is no way to ask "is *that* link mid-navigation" from outside it, so
 * the hook has to sit in a child of the link rather than in the list.
 *
 * `pending` is the whole point of the bar having any motion at all. `active`
 * comes from the pathname, and the pathname does not change until the new
 * page has been rendered and handed back — which on these screens is a
 * database round trip away. Lighting the tab on `active` alone means the tap
 * appears to do nothing for as long as the server takes, and the second tap
 * that gets is the real cost. `pending` is true from the touch.
 */
function Tab({
  label, active, Icon,
}: {
  label: string
  active: boolean
  Icon: (typeof ITEMS)[number]['icon']
}) {
  const { pending } = useLinkStatus()

  // Lit while you are there, and while you are on your way there.
  const lit = active || pending

  /**
   * Held down, tracked in React rather than left to CSS `:active`.
   *
   * Two reasons, and either would be enough. `:active` matches the element
   * being activated and its *ancestors* — never its descendants — so a rule
   * on this span would never fire for a press on the link above it. And iOS
   * Safari does not apply `:active` to an element with no touch handler
   * anywhere near it, which is exactly this bar on exactly the phone the app
   * is built for. A pointer handler is true on every browser that has one.
   */
  const [pressed, setPressed] = useState(false)
  const release = () => setPressed(false)

  return (
    <span
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      // Both, because a press can end without a release: a finger that slides
      // off the tab before lifting, or a scroll that claims the gesture, each
      // leave the tab held down forever otherwise.
      onPointerCancel={release}
      onPointerLeave={release}
      className={`flex flex-col items-center justify-center gap-1 h-16 transition-[color,transform] duration-150 ease-out ${
        lit ? 'text-accent' : 'text-bark/60 hover:text-bark/80'
      } ${pressed ? 'tab-pressed' : ''} ${pending ? 'tab-pending' : ''}`}
    >
      <Icon size={20} />
      {/* The smallest type in the app, and the one place it is
          justified: five labels across the narrowest phone. 11px,
          read at arm's length; "Leaderboard" is the tight one and
          it is measured, not assumed, to clear its column. */}
      <span
        className="font-[family-name:var(--font-ui)] leading-none whitespace-nowrap"
        style={{ fontSize: 11, fontWeight: lit ? 600 : 400 }}
      >
        {label}
      </span>
    </span>
  )
}

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
    if (pathname.startsWith(`${base}/stats`)) return 'stats'
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
      <ul className="max-w-lg mx-auto grid grid-cols-5">
        {ITEMS.map(item => {
          const active = activeKey === item.key
          const Icon = item.icon
          return (
            <li key={item.key}>
              <Link
                href={item.path(tripCode)}
                aria-current={active ? 'page' : undefined}
                // Left on the default, which warms the loading skeleton and
                // the layout around it and stops there.
                //
                // **Not `prefetch` outright, and this is a correctness rule
                // rather than a tuning one.** That fetches the whole payload
                // of a dynamic route, and the hub is personalised on the
                // server from a cookie — so what lands in the cache is the
                // hub *as this device was when the prefetch went out*. The
                // bar is on the join screen too, which is the worst possible
                // moment for it: it warms the hub as a stranger while
                // somebody is standing on the page about to claim a name,
                // and the claim then arrives at a cached "Claim your spot".
                // It would also re-poison the cache that
                // players/PlayersClient.tsx has just cleared.
                //
                // The skeleton is what makes the tap feel instant, and a
                // skeleton has nobody's name in it. Warming that is the
                // whole benefit and it costs nothing to be wrong about.
                className="block touch-manipulation"
              >
                <Tab label={item.label} active={active} Icon={Icon} />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
