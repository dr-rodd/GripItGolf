'use client'

import { IconCalendar, IconChartBar, IconHome, IconStream, IconTrophy } from '@/app/components/icons'
import { useStreamDot } from '@/app/components/feed/useStreamDot'

export type HomeTab = 'home' | 'events' | 'stream' | 'board' | 'stats'

export const HOME_TABS: readonly HomeTab[] = ['home', 'events', 'stream', 'board', 'stats']

/**
 * The personal page's tab bar (D149, amended by D318): Home · Events ·
 * Stream · Board · Stats — Stream holds the centre, Me went (the profile
 * circle and gear at the top of Home, D319). No skin (D151): the lit tab is
 * emerald, as on every page outside a club. The tabs switch the page in place.
 * The comment dot rides on Stream (D320), asked once the page is idle.
 */
export default function HomeTabBar({ active, onChoose, signedIn = false }: { active: HomeTab; onChoose: (t: HomeTab) => void; signedIn?: boolean }) {
  const dot = useStreamDot(signedIn)
  const tabs: { key: HomeTab; label: string; Icon: typeof IconHome }[] = [
    { key: 'home', label: 'Home', Icon: IconHome },
    { key: 'events', label: 'Events', Icon: IconCalendar },
    { key: 'stream', label: 'Stream', Icon: IconStream },
    { key: 'board', label: 'Board', Icon: IconTrophy },
    { key: 'stats', label: 'Stats', Icon: IconChartBar },
  ]
  return (
    <nav
      className="hide-with-keyboard fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Your page"
    >
      <ul className="max-w-lg mx-auto grid grid-cols-5">
        {tabs.map(({ key, label, Icon }) => {
          const lit = key === active
          return (
            <li key={key}>
              <button type="button" onClick={() => onChoose(key)} aria-current={lit ? 'page' : undefined}
                aria-label={key === 'stream' && dot ? 'Stream — new comments on your cards' : undefined}
                className={`w-full flex flex-col items-center justify-center gap-1.5 h-16 transition-colors duration-150 ease-out ${
                  lit ? 'text-accent-deep' : 'text-bark/60 hover:text-bark/80'
                }`}>
                <span className="relative">
                  <Icon size={22} />
                  {key === 'stream' && dot && <span aria-hidden="true" className="stream-dot absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-accent ring-2 ring-surface" />}
                </span>
                <span className="font-[family-name:var(--font-ui)] leading-none whitespace-nowrap"
                  style={{ fontSize: 13, fontStretch: '87.5%', fontWeight: lit ? 600 : 400 }}>
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
