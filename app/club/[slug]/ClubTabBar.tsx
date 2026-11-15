'use client'

import { IconChartBar, IconHome, IconSettings, IconTrophy, IconUsers } from '@/app/components/icons'

export type ClubTab = 'home' | 'comps' | 'board' | 'stats' | 'club'

/** On once a golfer's rounds are summarised (stage (f), migration 088). */
const STATS_READY = false

/**
 * The members' tab bar (D127): Home · Comps · Board · Stats · Club, the lit
 * tab in the club's colour (D125) and every other tab as the trip bar draws
 * them. Stats is left out until a golfer's rounds are summarised (stage (f)),
 * when Board takes the centre again; a tab with nothing behind it is never
 * shown. The tabs switch the page in place: the members home is one page.
 */
export default function ClubTabBar({ active, onChoose, hasBoard }: {
  active: ClubTab
  onChoose: (t: ClubTab) => void
  hasBoard: boolean
}) {
  const tabs: { key: ClubTab; label: string; Icon: typeof IconHome }[] = [
    { key: 'home', label: 'Home', Icon: IconHome },
    { key: 'comps', label: 'Comps', Icon: IconUsers },
    ...(hasBoard ? [{ key: 'board' as const, label: 'Board', Icon: IconTrophy }] : []),
    ...(STATS_READY ? [{ key: 'stats' as const, label: 'Stats', Icon: IconChartBar }] : []),
    { key: 'club', label: 'Club', Icon: IconSettings },
  ]
  return (
    <nav
      className="hide-with-keyboard fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Club"
    >
      <ul className={`max-w-lg mx-auto grid ${tabs.length === 3 ? 'grid-cols-3' : tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
        {tabs.map(({ key, label, Icon }) => {
          const lit = key === active
          return (
            <li key={key}>
              <button type="button" onClick={() => onChoose(key)} aria-current={lit ? 'page' : undefined}
                className={`w-full flex flex-col items-center justify-center gap-1.5 h-16 transition-colors duration-150 ease-out ${
                  lit ? 'text-club-deep' : 'text-bark/60 hover:text-bark/80'
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
