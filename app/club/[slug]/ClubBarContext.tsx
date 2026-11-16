'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { ClubEvent } from '@/lib/clubs'
import type { Credentials } from '@/lib/clubMay'
import type { SeasonRow } from '@/lib/cardSummary'

export type ClubTab = 'home' | 'comps' | 'board' | 'stats' | 'club'

/** What the members home holds once the club has said this phone is on its list. */
export interface ClubMembers {
  /** The club's address, so a home is never drawn under another club's face (D223). */
  slug?: string
  clubId: string
  /** D161: the club's home course, for New competition (Officers). */
  homeCourseId: string | null
  /** This account's ticks here (lib/clubMay.ts). A copy kept before stage (k0) has none: read as nothing held. */
  credentials?: Credentials
  /** D218, D223: every verified club this account is on, with cards waiting at each — only when more than one. */
  myClubs?: { slug: string; name: string; toSign: number }[]
  name: string
  events: ClubEvent[]
  entries: string[]
  season: SeasonRow[]
  courses: Record<string, string>
  outside: ClubEvent[]
  tops: Record<string, { name: string; points: number }>
  /** Stage (d3): competitions with a card waiting on this member — to approve or to mark. */
  toSign: { code: string; name: string; count: number }[]
  /** Drawn from the copy kept on this phone (D193): the live parts wait for the fresh answer (D194). */
  fromCopy?: boolean
}

interface ClubBar {
  /** The members home, kept while this phone moves between the club and its competitions. */
  members: ClubMembers | null
  setMembers: React.Dispatch<React.SetStateAction<ClubMembers | null>>
  tab: ClubTab
  /** A club tab tapped: switched in place, the address following. */
  choose: (t: ClubTab) => void
  /** The tab the club page will open on, set before a link takes this phone there. */
  setTab: (t: ClubTab) => void
  /**
   * Where a tap inside the club area is taking this phone, from the touch
   * until the new page is on screen (D198) — so the footer lights the tab
   * and slides its set at once instead of waiting on the server.
   */
  going: string | null
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
  const pathname = usePathname()
  const [going, setGoing] = useState<string | null>(null)

  // Any link into the club area, tapped: noted from the touch (D198).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank') return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/club/')) return
      if (url.pathname !== window.location.pathname) setGoing(url.pathname)
    }
    // Capture, ahead of the link's own handler (which prevents the default).
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  // Arrived (or gone somewhere else): the address speaks for itself again.
  // A tap that never lands lets go after a while.
  useEffect(() => { setGoing(null) }, [pathname])
  useEffect(() => {
    if (!going) return
    const t = setTimeout(() => setGoing(null), 15_000)
    return () => clearTimeout(t)
  }, [going])

  const choose = useCallback((t: ClubTab) => {
    setTab(t)
    const url = t === 'home' ? window.location.pathname : `${window.location.pathname}?tab=${t}`
    window.history.replaceState(window.history.state, '', url)
    window.scrollTo({ top: 0 })
  }, [])

  const value = useMemo<ClubBar>(() => ({
    members, setMembers, tab, choose, setTab, going,
  }), [members, tab, choose, going])
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
