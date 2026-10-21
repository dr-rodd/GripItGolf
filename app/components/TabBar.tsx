'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  IconHome, IconTrophy, IconClipboardList, IconSettings, IconChartBar,
  IconClock,
} from './icons'
import { RUN_TABS, runActiveKey } from './runTabs'

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
 *
 * **A run challenge draws this same bar** (`sport="run"`, from
 * `app/run/[tripCode]/layout.tsx`) with its own five destinations from
 * runTabs.ts — Home, Add, Leaderboard, Stats, Settings — so the two sports
 * share one bar rather than two that drift.
 */

const ITEMS = [
  { key: 'home',        label: 'Home',        icon: IconHome,          path: (t: string) => `/trip/${t}` },
  { key: 'scoring',     label: 'Scoring',     icon: IconClipboardList, path: (t: string) => `/trip/${t}/scoring` },
  { key: 'leaderboard', label: 'Leaderboard', icon: IconTrophy,        path: (t: string) => `/trip/${t}/leaderboard` },
  { key: 'stats',       label: 'Stats',       icon: IconChartBar,      path: (t: string) => `/trip/${t}/stats` },
  { key: 'settings',    label: 'Trip Setup',  icon: IconSettings,      path: (t: string) => `/trip/${t}/setup` },
  // Events only, at the right — where Trip Setup stands on a trip. A trip
  // never shows it: tee times are competition furniture, and the trip bar
  // is the five tabs it has always been.
  { key: 'teesheet',    label: 'Tee Sheet',   icon: IconClock,         path: (t: string) => `/trip/${t}/teesheet` },
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
  Icon: (typeof ITEMS)[number]['icon'] | (typeof RUN_TABS)[number]['icon']
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
      className={`flex flex-col items-center justify-center gap-1.5 h-16 transition-[color,transform] duration-150 ease-out ${
        lit ? 'text-accent' : 'text-bark/60 hover:text-bark/80'
      } ${pressed ? 'tab-pressed' : ''} ${pending ? 'tab-pending' : ''}`}
    >
      {/* 22px with 6px to its label: at 20 and 4 the bar read as cramped on
          a phone (Ross, 19 Oct). 22 + 6 + 13 still leaves the 64px bar
          11px of air above and below. */}
      <Icon size={22} />
      {/* Five labels at the 13px floor everything else in the app keeps.
          Archivo's width axis buys the room: at 87.5% "Leaderboard" is
          66px (69 lit, at 600) against 73 at full width — measured in
          Chromium, not assumed. A column is 75px from a 375px phone up,
          so it fits outright; on a 320px screen (an SE, or Display Zoom)
          it is 64px, and the label, centred and never clipped, borrows a
          couple of pixels each side from the empty margins beside
          Scoring and Stats, which are 42px words in the same 64. */}
      <span
        className="font-[family-name:var(--font-ui)] leading-none whitespace-nowrap"
        style={{ fontSize: 13, fontStretch: '87.5%', fontWeight: lit ? 600 : 400 }}
      >
        {label}
      </span>
    </span>
  )
}

export default function TabBar({ tripCode, isEvent = false, sport = 'golf' }: {
  tripCode: string
  /**
   * An event's field never sees Trip Setup — the organiser reaches it
   * through the organiser area, behind the PIN, where the rest of the
   * running of the event already lives. Four tabs then; the leaderboard
   * still holds the centre of what remains. Decided by the layout, which
   * is the one place that knows the kind before the bar first paints.
   */
  isEvent?: boolean
  /** A run challenge's bar: running's five tabs, under /run/. */
  sport?: 'golf' | 'run'
}) {
  const pathname = usePathname() ?? ''
  const base = `/trip/${tripCode}`

  // An event trades Trip Setup for the tee sheet; a trip keeps its five.
  // A run challenge has its own five.
  const items: readonly { key: string; label: string; icon: typeof IconHome; path: (t: string) => string }[] =
    sport === 'run' ? RUN_TABS
      : isEvent ? ITEMS.filter(i => i.key !== 'settings')
      : ITEMS.filter(i => i.key !== 'teesheet')

  /**
   * Which tab is lit.
   *
   * Home is only home — an exact match — because every other route starts
   * with the same prefix and a `startsWith` check would light Home on every
   * screen in the app. The rest match their own subtree, so a round inside
   * Scoring keeps Scoring lit.
   */
  const activeKey = sport === 'run' ? runActiveKey(pathname, tripCode) : (() => {
    if (pathname === base || pathname === `${base}/`) return 'home'
    // The bracket is the leaderboard's own — reached from its strip on a
    // trip, and the tab itself on a match play event.
    if (pathname.startsWith(`${base}/leaderboard`) || pathname.startsWith(`${base}/matchplay`)) return 'leaderboard'
    if (pathname.startsWith(`${base}/scoring`)) return 'scoring'
    if (pathname.startsWith(`${base}/stats`)) return 'stats'
    if (pathname.startsWith(`${base}/teesheet`)) return 'teesheet'
    if (pathname.startsWith(`${base}/setup`) || pathname.startsWith(`${base}/teams`)) return 'settings'
    // Players and anything else: no tab claims it rather than a wrong one
    // being lit.
    return null
  })()

  return (
    <nav
      // print:hidden — navigation has no business on paper. The export page
      // is what makes this real: it prints the trip to PDF, and the bar was
      // otherwise pinned across the bottom of every page of it.
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line print:hidden"
      // The bar occupies exactly what it shows: its height plus the home
      // indicator's inset, and not a pixel of paint beyond the viewport.
      //
      // It briefly painted 80px below itself — padding grown, margin taking
      // the same back — so Safari's toolbar-collapse lag would expose more
      // bar instead of the page behind it. Two things retired that. iOS 26
      // clips fixed content that extends below the browser controls, so the
      // extra paint no longer shows where it was needed; and the deploy that
      // carried it (with the root overscroll rule beside it) is when every
      // trip screen on a real iPhone gained scroll range past the end of its
      // content — see the html comment in globals.css. A bar that flickers
      // short of the edge for a frame or two is a smaller cost than either.
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={sport === 'run' ? 'Challenge' : 'Trip'}
    >
      <ul className="max-w-lg mx-auto grid grid-cols-5">
        {items.map(item => {
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
