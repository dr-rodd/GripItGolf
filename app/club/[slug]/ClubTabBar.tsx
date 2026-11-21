'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { startTransition, useEffect, useRef, useState } from 'react'
import {
  IconChartBar, IconChevronLeft, IconClipboardList, IconClock, IconHome, IconSettings, IconTrophy, IconUsers,
} from '@/app/components/icons'
import { barOf, compSectionHref, compsBack, MATCH_PLAY_SECTION_LABEL, SECTION_LABEL, SECTION_ORDER } from '@/lib/clubBar'
import type { CompSection } from '@/lib/compPhase'
import { useClubBar, type ClubTab } from './ClubBarContext'
import { CLUB_MEMBER_ATTR } from '@/lib/clubHomeCopy'

export type { ClubTab } from './ClubBarContext'

/** On since a golfer's rounds are summarised (stage (f), migration 088). */
const STATS_READY = true

const SECTION_ICON: Record<CompSection, typeof IconHome> = { tee: IconClock, scoring: IconClipboardList, board: IconTrophy }

/**
 * The club footer (D127), and inside a competition its second set (D180
 * amended, Ross, 16 Nov 2026): Home and Comps where they are, and Tee times,
 * Scoring and Leaderboard in the slots the club's Tee times, Stats and Club hold, on a tray
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
 * footer returns (Ross's answer, 16 Nov). Tee times took Board's slot (Ross,
 * 17 Nov 2026) — the club's casual tee sheet; the competition in play is on Comps.
 */
export default function ClubTabBar({ slug }: { slug: string }) {
  const pathname = usePathname()
  const { members, tab, choose, setTab, going, matchPlays } = useClubBar()
  // Where a tap is taking this phone counts from the touch (D198).
  const state = barOf(going ?? pathname ?? '', slug) ?? barOf(pathname ?? '', slug)
  const comp = state?.set === 'comp' ? state : null
  // The last competition open, kept so its tabs still have their names
  // while they slide back behind Comps on the way out.
  const [shown, setShown] = useState(comp?.code ?? null)
  if (comp && comp.code !== shown) setShown(comp.code)

  // Inside a competition's open pages this phone is a member (the door let it
  // through). Say so for the stylesheet, so Comps — back to the club — brings
  // the club footer with it at once, even when this phone came straight to the
  // competition by a link or code and has not loaded the club's home yet.
  const inComp = !!comp
  useEffect(() => {
    if (!inComp || document.querySelector('[data-no-club-bar]')) return
    document.documentElement.setAttribute(CLUB_MEMBER_ATTR, '')
  }, [inComp, comp?.code])

  if (!state) return null
  // The club set before the page has said this phone is on the list: drawn,
  // but shown only to a phone hinted to this club (D197), with the stand-in.
  const waiting = state.set === 'club' && !members

  const club = `/club/${slug}`

  // Tee times holds Board's old place (Ross, 17 Nov 2026): the club's casual
  // tee sheet; Board's job — the competition in play — is Comps' now.
  const own: { key: ClubTab; label: string; Icon: typeof IconHome; href?: string }[] = [
    { key: 'tee', label: 'Tee times', Icon: IconClock },
    ...(STATS_READY ? [{ key: 'stats' as const, label: 'Stats', Icon: IconChartBar }] : []),
    { key: 'club', label: 'Club', Icon: IconSettings },
  ]
  const five = own.length === 3

  const router = useRouter()
  // MO1, M6 (D280): leaving a competition is asked for outright, and checked —
  // the bar keeps its set until the address has left the competition, so the
  // page and the footer change together; a move that never lands is made whole.
  const leaving = useRef<number | null>(null)
  useEffect(() => () => { if (leaving.current) clearTimeout(leaving.current) }, [])
  useEffect(() => { if (!comp && leaving.current) { clearTimeout(leaving.current); leaving.current = null } }, [comp])

  /** A club tab switches the page in place; one with an address of its own goes there. */
  const clubTap = (t: ClubTab, href?: string) => (e: React.MouseEvent) => {
    if (comp) {
      e.preventDefault()
      setTab(t)
      const to = t === 'home' ? club : `${club}?tab=${t}`
      startTransition(() => router.push(to))
      if (leaving.current) clearTimeout(leaving.current)
      leaving.current = window.setTimeout(() => {
        if (window.location.pathname !== club) window.location.assign(to)
      }, 4000)
      return
    }
    if (href) { setTab(t); return }
    e.preventDefault()
    choose(t)
  }

  return (
    <nav
      data-set={comp ? 'comp' : 'club'}
      className={`club-bar ${waiting ? 'club-bar-wait' : ''} hide-with-keyboard fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line print:hidden`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={comp ? 'Competition' : 'Club'}
    >
      <div className="relative max-w-lg mx-auto">
        {five && <span aria-hidden="true" className="club-bar-tray bg-club-tint" />}
        <ul className={`relative grid ${five ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <li>
            <Tab href={club} onClick={clubTap('home')} keepSet={!!comp} lit={!comp && tab === 'home'} label="Home">
              <IconHome size={22} />
            </Tab>
          </li>
          <li>
            <Tab href={comp ? compsBack(slug) : `${club}?tab=comps`} onClick={clubTap('comps')} keepSet={!!comp}
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
                      lit={comp?.active === s} label={(code && matchPlays.has(code) ? MATCH_PLAY_SECTION_LABEL : SECTION_LABEL)[s]}>
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

function Tab({ href, onClick, lit, label, aria, replace, prefetch, keepSet, children }: {
  href: string
  /** Leaving a competition: the bar keeps its set until the address leaves (M6). */
  keepSet?: boolean
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
    <Link href={href} onClick={onClick} replace={replace} data-keep-set={keepSet ? '' : undefined} prefetch={prefetch ? true : undefined} aria-current={lit ? 'page' : undefined} aria-label={aria}
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
