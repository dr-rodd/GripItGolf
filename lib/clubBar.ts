// The club footer and its competition set (D180 amended, D186–D190; Ross,
// 16 Nov 2026) — the one copy of which set a club address wears, which tab
// is lit, and where a competition's pages live. Pure: the bar
// (`app/club/[slug]/ClubTabBar.tsx`) and the pages read it.
//
// A competition's own address is its Summary; its three sections are pages
// under it. On all four the footer is the club footer with Home and Comps
// where they are and Tee times, Scoring and Leaderboard in the slots Board,
// Stats and Club hold — chosen from the address alone, so the server draws
// it and nobody need be signed in.

import type { CompSection } from './compPhase'

/** Where each section lives under a competition's address. */
export const SECTION_PATH: Record<CompSection, string> = {
  tee: 'tee-times',
  scoring: 'scoring',
  board: 'leaderboard',
}

/** The bar's order for the three sections, left to right after Comps. */
export const SECTION_ORDER: readonly CompSection[] = ['tee', 'scoring', 'board']

export const SECTION_LABEL: Record<CompSection, string> = {
  tee: 'Tee times',
  scoring: 'Scoring',
  board: 'Leaderboard',
}

/** A competition's Summary address. */
export function compHome(slug: string, code: string): string {
  return `/club/${slug}/comp/${code.toUpperCase()}`
}

/** A section's address. */
export function compSectionHref(slug: string, code: string, section: CompSection): string {
  return `${compHome(slug, code)}/${SECTION_PATH[section]}`
}

/**
 * An old `?view=` (the four-slot bar's, a shared link, the card's way back)
 * as the section it named, or null.
 */
export function sectionOfView(view: string | null | undefined): CompSection | null {
  return view === 'tee' || view === 'scoring' || view === 'board' ? view : null
}

/** Where Comps goes from a competition (Ross's answer, 16 Nov): back to the club's Comps, the club footer returning. */
export function compsBack(slug: string): string {
  return `/club/${slug}?tab=comps`
}

export type BarState =
  | { set: 'club' }
  | { set: 'comp'; code: string; active: 'summary' | CompSection }
  | null

/**
 * Which set the footer wears at `pathname` under `/club/<slug>`: the
 * competition set on a competition's Summary or a section of it, the club
 * set on the club's own page (drawn only for a member, which the bar asks
 * the page), and none anywhere else (the list).
 */
export function barOf(pathname: string, slug: string): BarState {
  const base = `/club/${slug}`
  const path = pathname.replace(/\/+$/, '')
  if (path === base) return { set: 'club' }
  const m = path.slice(base.length).match(/^\/comp\/([A-Za-z0-9]{4,12})(?:\/([a-z-]+))?$/)
  if (!path.startsWith(`${base}/`) || !m) return null
  const code = m[1].toUpperCase()
  if (!m[2]) return { set: 'comp', code, active: 'summary' }
  const section = SECTION_ORDER.find(s => SECTION_PATH[s] === m[2])
  return section ? { set: 'comp', code, active: section } : null
}

/** Where this club sits among the account's clubs: which of how many, the next, and whether a card waits at another. */
export interface ClubSwitch {
  position: number
  count: number
  next: { slug: string; name: string }
  dot: boolean
  all: string[]
}

/** The header's switch (D223), from the account's clubs in name order — none for one club. */
export function clubSwitch(clubs: { slug: string; name: string; toSign: number }[] | undefined, here: string): ClubSwitch | null {
  if (!clubs || clubs.length < 2) return null
  const i = clubs.findIndex(c => c.slug === here)
  if (i < 0) return null
  const next = clubs[(i + 1) % clubs.length]
  return {
    position: i + 1, count: clubs.length, next: { slug: next.slug, name: next.name },
    dot: clubs.some(c => c.slug !== here && c.toSign > 0), all: clubs.map(c => c.slug),
  }
}
