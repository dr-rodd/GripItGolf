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

/**
 * A club match play's three, in the same slots and at the same addresses
 * (Ross, 17 Nov 2026): who is in, the matches being played, the draw.
 */
export const MATCH_PLAY_SECTION_LABEL: Record<CompSection, string> = {
  tee: 'Field',
  scoring: 'Matches',
  board: 'Draw',
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

/**
 * The screens a club competition plays inside its club (D284, Ross, 21 Nov
 * 2026: all of it — scoring, matches, the bracket, managing it), at the
 * same paths under the competition's address as under the event's own, so
 * every link those screens build lands inside the club. Each maps to the
 * footer tab lit on it.
 */
const PLAY_PATHS: readonly [RegExp, 'summary' | CompSection][] = [
  [/^scoring\/\d+$/, 'scoring'],
  [/^match\/[A-Za-z0-9-]+(?:\/card)?$/, 'scoring'],
  [/^matchplay$/, 'board'],
  [/^organiser(?:\/(?:tags|days|sessions|bracket|draw))?$/, 'summary'],
  [/^setup(?:\/sessions)?$/, 'summary'],
  [/^teesheet\/[A-Za-z0-9-]+\/setup$/, 'tee'],
]

/** A path under a competition's address that the club mounts (D284), cleaned, or null. */
export function clubPathOf(path: string | null | undefined): string | null {
  const p = (path ?? '').replace(/^\/+|\/+$/g, '')
  if (!p) return null
  if (Object.values(SECTION_PATH).includes(p)) return p
  return PLAY_PATHS.some(([re]) => re.test(p)) ? p : null
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
  // D286: the Calendar is Home's — the club set, Home lit.
  if (path === base || path === `${base}/calendar`) return { set: 'club' }
  const m = path.slice(base.length).match(/^\/comp\/([A-Za-z0-9]{4,12})(?:\/(.+))?$/)
  if (!path.startsWith(`${base}/`) || !m) return null
  const code = m[1].toUpperCase()
  if (!m[2]) return { set: 'comp', code, active: 'summary' }
  const section = SECTION_ORDER.find(s => SECTION_PATH[s] === m[2])
  if (section) return { set: 'comp', code, active: section }
  // A screen the competition plays inside the club (D284): the tab it belongs to.
  const play = PLAY_PATHS.find(([re]) => re.test(m[2]))
  return play ? { set: 'comp', code, active: play[1] } : null
}

/** The header's club picker (D223, D280): the account's clubs, this one ticked, a dot where a card waits. */
export interface ClubSwitch {
  clubs: { slug: string; name: string; crestUrl: string | null; here: boolean; dot: boolean }[]
  /** A card waits at another club — the dot on this club's crest. */
  dot: boolean
  all: string[]
}

/**
 * The picker (MO1, M1 — Ross, 21 Nov 2026: a list to choose from, never a
 * tap that cycles), from the account's clubs in name order — none for one club.
 */
export function clubSwitch(clubs: { slug: string; name: string; toSign: number; crestUrl?: string | null }[] | undefined, here: string): ClubSwitch | null {
  if (!clubs || clubs.length < 2 || !clubs.some(c => c.slug === here)) return null
  const list = clubs.map(c => ({ slug: c.slug, name: c.name, crestUrl: c.crestUrl ?? null, here: c.slug === here, dot: c.slug !== here && c.toSign > 0 }))
  return { clubs: list, dot: list.some(c => c.dot), all: clubs.map(c => c.slug) }
}
