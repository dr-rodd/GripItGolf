'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  IconChartBar, IconChevronLeft, IconClipboardList, IconClock, IconHome, IconSettings, IconTrophy, IconUsers,
} from '@/app/components/icons'
import { barOf, compSectionHref, compsBack, SECTION_LABEL, SECTION_ORDER } from '@/lib/clubBar'
import type { CompSection } from '@/lib/compPhase'
import { useClubBar, type ClubTab } from './ClubBarContext'

export type { ClubTab } from './ClubBarContext'

/** On since a golfer's rounds are summarised (stage (f), migration 088). */
const STATS_READY = true

const SECTION_ICON: Record<CompSection, typeof IconHome> = { tee: IconClock, scoring: IconClipboardList, board: IconTrophy }

/**
 * The club footer (D127), and inside a competition its second set (D180
 * amended, Ross, 16 Nov 2026): Home and Comps where they are, and Tee times,
 * Scoring and Leaderboard in the slots Board, Stats and Club hold, on a tray
 * in the club's tint behind Comps and the three (D188), Comps wearing a back
 * chevron. The lit tab in the club's colour (D125); no emerald.
 *
 * **Drawn once, by the club's layout, never by a page** — so going from the
 * club's Comps into a competition is this bar changing its set, and the
 * three slide out from behind Comps (the stylesheet's `.club-bar`). A bar
 * that has just arrived — a shared link, a refresh — has changed nothing, so
 * nothing moves. Which set is the address's (`barOf`), so the server draws
 * the competition set for anybody; the club set waits for the page to say
 * this phone is on the club's list.
 *
 * Comps from a competition goes back to the club's Comps and the club
 * footer returns (Ross's answer, 16 Nov). Board, while a competition is in
 * play, opens its leaderboard (D189).
 */
export default function ClubTabBar({ slug }: { slug: string }) {
  const pathname = usePathname()
  const { members, tab, choose, setTab, going } = useClubBar()
  // Where a tap is taking this phone counts from the touch (D198).
  const state = barOf(going ?? pathname ?? '', slug) ?? barOf(pathname ?? '', slug)
  const comp = state?.set === 'comp' ? state : null
  // The last competition open, kept so its tabs still have their names
  // while they slide back behind Comps on the way out.
  const [shown, setShown] = useState(comp?.code ?? null)
  if (comp && comp.code !== shown) setShown(comp.code)
  if (!state || (state.set === 'club' && !members)) return null

  const club = `/club/${slug}`
  const hasBoard = comp !== null || (members?.events.length ?? 0) > 0
  const live = members?.events.find(e => e.competition?.phase === 'in_play') ?? null

  const own: { key: ClubTab; label: string; Icon: typeof IconHome; href?: string }[] = [
    ...(hasBoard ? [{ key: 'board' as const, label: 'Board', Icon: IconTrophy, href: live ? compSectionHref(slug, live.code, 'board') : undefined }] : []),
    ...(STATS_READY ? [{ key: 'stats' as const, label: 'Stats', Icon: IconChartBar }] : []),
    { key: 'club', label: 'Club', Icon: IconSettings },
  ]
  // A club with no events has no Board: the four tabs it always had, and no
  // competition to open, so no second set.
  const five = own.length === 3

  /** A club tab switches the page in place; one with an address of its own goes there. */
  const clubTap = (t: ClubTab, href?: string) => (e: React.MouseEvent) => {
    if (comp || href) { setTab(t); return }
    e.preventDefault()
    choose(t)
  }

  return (
    <nav
      data-set={comp ? 'comp' : 'club'}
      className="club-bar hide-with-keyboard fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={comp ? 'Competition' : 'Club'}
    >
      <div className="relative max-w-lg mx-auto">
        {five && <span aria-hidden="true" className="club-bar-tray bg-club-tint" />}
        <ul className={`relative grid ${five ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <li>
            <Tab href={club} onClick={clubTap('home')} lit={!comp && tab === 'home'} label="Home">
              <IconHome size={22} />
            </Tab>
          </li>
          <li>
            <Tab href={comp ? compsBack(slug) : `${club}?tab=comps`} onClick={clubTap('comps')}
              lit={comp ? comp.active === 'summary' : tab === 'comps'} label="Comps"
              aria={comp ? 'Comps — back to the club’s competitions' : undefined}>
              <span className="relative w-[22px] h-[22px]">
                <IconUsers size={22} className="club-bar-icon-comps absolute inset-0" />
                <IconChevronLeft size={22} className="club-bar-icon-back absolute inset-0" />
              </span>
            </Tab>
          </li>
          {own.map(({ key, label, Icon, href }) => (
            <li key={key} className="club-bar-own">
              <Tab href={href ?? `${club}?tab=${key}`} onClick={clubTap(key, href)} lit={!comp && tab === key} label={label}>
                <Icon size={22} />
              </Tab>
            </li>
          ))}
        </ul>
        {five && (
          // The competition's three, over Board, Stats and Club. Their strip
          // starts at Comps' right edge and clips, so at rest in the club set
          // they wait behind Comps and slide out from there.
          <ul className="club-bar-kids">
            {SECTION_ORDER.map((s, i) => {
              const Icon = SECTION_ICON[s]
              const code = comp?.code ?? shown
              return (
                <li key={s} className="club-bar-kid" style={{ '--k': i + 1 } as React.CSSProperties}>
                  {code && (
                    <Tab href={compSectionHref(slug, code, s)} prefetch={!!comp}
                      replace={!!comp && comp.active !== 'summary'}
                      lit={comp?.active === s} label={SECTION_LABEL[s]}>
                      <Icon size={22} />
                    </Tab>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </nav>
  )
}

function Tab({ href, onClick, lit, label, aria, replace, prefetch, children }: {
  href: string
  /** A competition's sections fetched whole ahead of the tap (D198), so moving between them is instant. */
  prefetch?: boolean
  onClick?: (e: React.MouseEvent) => void
  lit: boolean
  label: string
  aria?: string
  replace?: boolean
  children: React.ReactNode
}) {
  return (
    <Link href={href} onClick={onClick} replace={replace} prefetch={prefetch ? true : undefined} aria-current={lit ? 'page' : undefined} aria-label={aria}
      className={`club-bar-tab w-full flex flex-col items-center justify-center gap-1.5 h-16 ${
        lit ? 'text-club-deep' : 'text-bark/60 hover:text-bark/80'
      }`}>
      {children}
      <span className="font-[family-name:var(--font-ui)] leading-none whitespace-nowrap"
        style={{ fontSize: 13, fontStretch: '87.5%', fontWeight: lit ? 600 : 400 }}>
        {label}
      </span>
    </Link>
  )
}
