// The Clubhouse's rules — the only copy (stage (k1); D202, D207, D217,
// D224). The desktop office where a club's Clubhouse holders and Green Dot
// staff keep the list: its standings, filters and order, the search, the
// page size, the file it downloads, and what "Needs you" says. Pure: the
// server (`app/api/club/clubhouse.ts`) and the screens (`app/clubhouse/`)
// both read it. Who may do what is lib/clubMay.ts, never here.
//
// The list is a list (D217, D224): names, emails, the club's member number,
// the GUI number, the handicap index, credentials. No categories, fees,
// renewals or Green Dot numbers.

import { indexLabel } from './handicapIndex'
import type { Credentials } from './clubMay'
import type { CompPhase } from './compPhase'

/** Rows a page of the grid (D207). */
export const PAGE_SIZE = 50

/** Where a row stands: linked to an account, its code emailed, neither, or taken off. */
export type Standing = 'joined' | 'invited' | 'not_invited' | 'off'

export const STANDING_WORDS: Record<Standing, string> = {
  joined: 'Joined',
  invited: 'Invited',
  not_invited: 'Not invited',
  off: 'Taken off',
}

export function standingOf(r: { linked: boolean; removed: boolean; invitedAt: string | null }): Standing {
  if (r.removed) return 'off'
  if (r.linked) return 'joined'
  return r.invitedAt ? 'invited' : 'not_invited'
}

/** What the grid can be narrowed to, read on the server. */
export type ListFilter = 'all' | 'joined' | 'invited' | 'not_invited' | 'plays' | 'not_playing' | 'officer' | 'clubhouse' | 'off'

export const LIST_FILTERS: { key: ListFilter; label: string }[] = [
  { key: 'all', label: 'Everyone on the list' },
  { key: 'joined', label: 'Joined' },
  { key: 'invited', label: 'Invited' },
  { key: 'not_invited', label: 'Not invited' },
  { key: 'plays', label: 'Plays here' },
  { key: 'not_playing', label: 'Doesn’t play here' },
  { key: 'officer', label: 'Officers' },
  { key: 'clubhouse', label: 'Clubhouse' },
  { key: 'off', label: 'Taken off' },
]

export function readFilter(v: unknown): ListFilter {
  return LIST_FILTERS.some(f => f.key === v) ? v as ListFilter : 'all'
}

/** The columns the grid sorts by — what the database can order on its own. */
export type ListSort = 'name' | 'memberNumber' | 'guiNumber' | 'email'
export const SORT_COLUMN: Record<ListSort, string> = {
  name: 'name', memberNumber: 'member_number', guiNumber: 'gui_number', email: 'email',
}

export function readSort(v: unknown): ListSort {
  return v === 'memberNumber' || v === 'guiNumber' || v === 'email' ? v : 'name'
}

/**
 * A search as the server may put it in a filter: trimmed, at most 60
 * characters, and without the characters the database reads as its own
 * (the separators of an or-filter and the wildcards).
 */
export function cleanSearch(q: unknown): string {
  return (typeof q === 'string' ? q : '').replace(/[,()%_*\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

/** "1–50 of 312", or the count alone when it fits on one page. */
export function pageLine(page: number, total: number, size = PAGE_SIZE): string {
  if (total === 0) return 'Nobody'
  const from = page * size + 1
  const to = Math.min(total, (page + 1) * size)
  return total <= size ? `${total} ${total === 1 ? 'person' : 'people'}` : `${from}–${to} of ${total}`
}

export function lastPage(total: number, size = PAGE_SIZE): number {
  return Math.max(0, Math.ceil(total / size) - 1)
}

/** A row of the grid, as the server answers it. Numbers whole: the Clubhouse sees them in full. */
export interface GridRow {
  id: string
  name: string
  email: string | null
  memberNumber: string | null
  guiNumber: string | null
  handicapIndex: number | null
  credentials: Credentials
  linked: boolean
  removed: boolean
  invitedAt: string | null
  onBoards: boolean
}

/** A cell as a spreadsheet would read it back: formulas defused, quoted where it must be. */
function csvCell(v: string): string {
  // A formula is defused; a plain number (a plus index, "+1.5") is a number.
  const safe = /^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !/^[+-]?\d+(\.\d+)?$/.test(v)) ? `'${v}` : v
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * The list as a file (D207): one line a person, headed so pasting it back
 * brings the list up to date (Name, Email, Member number and GUI number are
 * the columns the paste reads; the rest are for reading).
 */
export function listCsv(rows: GridRow[]): string {
  const head = ['Name', 'Email', 'Member number', 'GUI number', 'Handicap index', 'Standing', 'Plays here', 'Officer', 'Clubhouse']
  const yes = (b: boolean) => (b ? 'Yes' : 'No')
  const lines = rows.map(r => [
    r.name, r.email ?? '', r.memberNumber ?? '', r.guiNumber ?? '',
    r.handicapIndex === null ? '' : indexLabel(r.handicapIndex),
    STANDING_WORDS[standingOf(r)],
    yes(r.credentials.playsHere), yes(r.credentials.officer), yes(r.credentials.clubhouse || r.credentials.owner),
  ].map(csvCell).join(','))
  return [head.join(','), ...lines].join('\r\n') + '\r\n'
}

/** The download's name: the club's address and the day. */
export function listFileName(slug: string, today: string): string {
  return `${slug}-list-${today}.csv`
}

/** The counts the Overview and the filters show. Invited is null before migration 093. */
export interface ListCounts {
  onList: number
  joined: number
  invited: number | null
  notJoined: number
  off: number
  playsHere: number
  officer: number
  clubhouse: number
  noEmail: number
}

/** One line of "Needs you", and where it goes. */
export interface Need { key: string; line: string; href: string }

/**
 * What needs the office (the Overview's "Needs you"): competitions waiting
 * to be certified, people who could be emailed their code and never have
 * been, and people with no email to send one to. Only what is there; none
 * is "Nothing needs you."
 */
export function needsYou(o: {
  base: string
  counts: ListCounts
  phases: { code: string; name: string; phase: CompPhase }[]
  clubSlug: string
  officer: boolean
}): Need[] {
  const out: Need[] = []
  for (const c of o.phases.filter(p => p.phase === 'awaiting')) {
    out.push({
      key: `certify-${c.code}`,
      line: `${c.name}: every card is in. ${o.officer ? 'Certify the results.' : 'An Officer certifies the results.'}`,
      href: `/club/${o.clubSlug}/comp/${c.code}/scoring`,
    })
  }
  const neverAsked = o.counts.invited === null ? null : Math.max(0, o.counts.notJoined - o.counts.invited - o.counts.noEmail)
  if (neverAsked && neverAsked > 0) {
    out.push({
      key: 'not-invited',
      line: `${neverAsked} ${neverAsked === 1 ? 'person has' : 'people have'} an email and no code yet.`,
      href: `${o.base}/members?filter=not_invited`,
    })
  }
  if (o.counts.noEmail > 0) {
    out.push({
      key: 'no-email',
      line: `${o.counts.noEmail} ${o.counts.noEmail === 1 ? 'person has' : 'people have'} no email, so no code can reach them.`,
      href: `${o.base}/members?filter=not_invited`,
    })
  }
  return out
}

/** The sections of the Clubhouse, in the sidebar's order (only those built are listed). */
export const SECTIONS = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'members', label: 'Members', path: '/members' },
  { key: 'competitions', label: 'Competitions', path: '/competitions' },
  { key: 'calendar', label: 'Calendar', path: '/calendar' },
  { key: 'settings', label: 'Club settings', path: '/settings' },
] as const

export type SectionKey = (typeof SECTIONS)[number]['key']

/** A club's Clubhouse address, and a section's under it. */
export function clubhouseHref(slug: string, section: SectionKey = 'overview'): string {
  return `/clubhouse/${slug}${SECTIONS.find(s => s.key === section)?.path ?? ''}`
}

/** Which section an address is in — the sidebar lights it. */
export function sectionAt(pathname: string, slug: string): SectionKey {
  const rest = pathname.slice(`/clubhouse/${slug}`.length)
  return SECTIONS.find(s => s.path && (rest === s.path || rest.startsWith(`${s.path}/`)))?.key ?? 'overview'
}

/** "Green Dot staff" — what a club is shown for a staff change (D222), never who. */
export const STAFF_NAME = 'Green Dot staff'
