'use client'

import { IconCalendar, IconChartBar, IconHome, IconTrophy, IconUser } from '@/app/components/icons'

export type HomeTab = 'home' | 'events' | 'board' | 'stats' | 'me'

export const HOME_TABS: readonly HomeTab[] = ['home', 'events', 'board', 'stats', 'me']

/**
 * The personal page's tab bar (D149): Home · Events · Board · Stats · Me —
 * the club's bar (D127) less Club, with Me in its place. No skin (D151): the
 * lit tab is emerald, as on every page outside a club. Board holds the
 * centre. The tabs switch the page in place.
 */
export default function HomeTabBar({ active, onChoose }: { active: HomeTab; onChoose: (t: HomeTab) => void }) {
  const tabs: { key: HomeTab; label: string; Icon: typeof IconHome }[] = [
    { key: 'home', label: 'Home', Icon: IconHome },
    { key: 'events', label: 'Events', Icon: IconCalendar },
    { key: 'board', label: 'Board', Icon: IconTrophy },
    { key: 'stats', label: 'Stats', Icon: IconChartBar },
    { key: 'me', label: 'Me', Icon: IconUser },
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
                className={`w-full flex flex-col items-center justify-center gap-1.5 h-16 transition-colors duration-150 ease-out ${
                  lit ? 'text-accent-deep' : 'text-bark/60 hover:text-bark/80'
                }`}>
                <Icon size={22} />
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
