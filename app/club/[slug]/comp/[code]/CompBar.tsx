import Link from 'next/link'
import { IconClipboardList, IconClock, IconHome, IconTrophy } from '@/app/components/icons'
import type { CompSection } from '@/lib/compPhase'

/**
 * The competition bar (D180–D181): Tee sheet, Scoring, Leaderboard and Home,
 * drawn by the server with the page, in the club footer's place. All three
 * sections are always here — one not yet live opens on a line saying when it
 * starts. Home leaves for the club's Home, where the club footer is back.
 * The lit tab in the club's colour, as the club footer's (D125).
 */
export default function CompBar({ slug, code, active }: { slug: string; code: string; active: CompSection }) {
  const base = `/club/${slug}/comp/${code}`
  const tabs: { key: CompSection | 'home'; label: string; href: string; Icon: typeof IconHome }[] = [
    { key: 'tee', label: 'Tee sheet', href: `${base}?view=tee`, Icon: IconClock },
    { key: 'scoring', label: 'Scoring', href: `${base}?view=scoring`, Icon: IconClipboardList },
    { key: 'board', label: 'Leaderboard', href: `${base}?view=board`, Icon: IconTrophy },
    { key: 'home', label: 'Home', href: `/club/${slug}`, Icon: IconHome },
  ]
  return (
    <nav
      className="hide-with-keyboard fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Competition"
    >
      <ul className="max-w-lg mx-auto grid grid-cols-4">
        {tabs.map(({ key, label, href, Icon }) => {
          const lit = key === active
          return (
            <li key={key}>
              <Link href={href} replace={key !== 'home'} scroll={key === 'home'} aria-current={lit ? 'page' : undefined}
                className={`w-full flex flex-col items-center justify-center gap-1.5 h-16 transition-colors duration-150 ease-out ${
                  lit ? 'text-club-deep' : 'text-bark/60 hover:text-bark/80'
                }`}>
                <Icon size={22} />
                <span className="font-[family-name:var(--font-ui)] leading-none whitespace-nowrap"
                  style={{ fontSize: 13, fontStretch: '87.5%', fontWeight: lit ? 600 : 400 }}>
                  {label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
