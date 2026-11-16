'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ClubEvent, ClubRole } from '@/lib/clubs'
import type { SeasonRow } from '@/lib/cardSummary'

export type ClubTab = 'home' | 'comps' | 'board' | 'stats' | 'club'

/** What the members home holds once the club has said this phone is on its list. */
export interface ClubMembers {
  clubId: string
  /** D161: the club's home course, for New competition (owners and admins). */
  homeCourseId: string | null
  role: ClubRole
  name: string
  events: ClubEvent[]
  entries: string[]
  season: SeasonRow[]
  courses: Record<string, string>
  outside: ClubEvent[]
  tops: Record<string, { name: string; points: number }>
  /** Stage (d3): competitions with a card waiting on this member — to approve or to mark. */
  toSign: { code: string; name: string; count: number }[]
}

interface ClubBar {
  /** The members home, kept while this phone moves between the club and its competitions. */
  members: ClubMembers | null
  setMembers: (m: ClubMembers | null) => void
  tab: ClubTab
  /** A club tab tapped: switched in place, the address following. */
  choose: (t: ClubTab) => void
  /** The tab the club page will open on, set before a link takes this phone there. */
  setTab: (t: ClubTab) => void
}

const Context = createContext<ClubBar | null>(null)

/**
 * The club area's footer state (D180 amended), held by the club's layout so
 * it outlives a page change: the club page and every competition page under
 * it share one footer, which is what lets the competition's tabs slide out
 * of Comps rather than a new bar arriving. It also keeps the members home,
 * so coming back from a competition the club footer and the page are there
 * at once while the page asks again.
 */
export function ClubBarProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<ClubMembers | null>(null)
  const [tab, setTab] = useState<ClubTab>('home')

  const choose = useCallback((t: ClubTab) => {
    setTab(t)
    const url = t === 'home' ? window.location.pathname : `${window.location.pathname}?tab=${t}`
    window.history.replaceState(window.history.state, '', url)
    window.scrollTo({ top: 0 })
  }, [])

  const value = useMemo<ClubBar>(() => ({
    members, setMembers, tab, choose, setTab,
  }), [members, tab, choose])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useClubBar(): ClubBar {
  const c = useContext(Context)
  if (!c) throw new Error('useClubBar outside the club layout')
  return c
}

/**
 * Drawn by a page that must show no footer — the members-only door. A mark
 * the stylesheet reads (`:has([data-no-club-bar])`), so the server's HTML
 * already has no bar and nothing flashes before the page is live.
 */
export function NoBar() {
  return <span data-no-club-bar hidden />
}
