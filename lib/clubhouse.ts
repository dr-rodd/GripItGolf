// The Clubhouse's rules — the only copy (stage (k1); D202, D207, D217,
// D224). The desktop office where a club's Clubhouse holders and Green Dot
// staff keep the list: its standings, filters and order, the search, the
// page size, the file it downloads, and what the Alerts say (was "Needs you", Ross, 18 Nov 2026). Pure: the
// server (`app/api/club/clubhouse.ts`) and the screens (`app/clubhouse/`)
// both read it. Who may do what is lib/clubMay.ts, never here.
//
// The list is a list (D217, D224): names, emails, the club's member number,
// the GUI number, the handicap index, credentials. No categories, fees,
// renewals or Green Dot numbers.

import { indexLabel } from './handicapIndex'
import type { Credentials } from './clubMay'
import type { CompPhase } from './compPhase'
import { GENDER_WORDS, birthDateLabel, type Category, type Gender } from './clubMembership'
import type { ClubNote, EventType } from './clubEvents'

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
export type ListFilter = 'all' | 'joined' | 'invited' | 'not_invited' | 'officer' | 'clubhouse' | 'off'

export const LIST_FILTERS: { key: ListFilter; label: string }[] = [
  { key: 'all', label: 'Everyone on the list' },
  { key: 'joined', label: 'Joined' },
  { key: 'invited', label: 'Invited' },
  { key: 'not_invited', label: 'Not invited' },
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
  /** Stage (m): the person's gender and date of birth, and the row's membership. */
  gender: Gender | null
  birthDate: string | null
  categoryId: string | null
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
export function listCsv(rows: GridRow[], categories: Pick<Category, 'id' | 'code'>[] = []): string {
  const head = ['Name', 'Email', 'Member number', 'GUI number', 'Gender', 'Date of birth', 'Category', 'Handicap index', 'Standing', 'Officer', 'Clubhouse']
  const yes = (b: boolean) => (b ? 'Yes' : 'No')
  const lines = rows.map(r => [
    r.name, r.email ?? '', r.memberNumber ?? '', r.guiNumber ?? '',
    r.gender ? GENDER_WORDS[r.gender] : '', birthDateLabel(r.birthDate), categories.find(c => c.id === r.categoryId)?.code ?? '',
    r.handicapIndex === null ? '' : indexLabel(r.handicapIndex),
    STANDING_WORDS[standingOf(r)],
    yes(r.credentials.officer), yes(r.credentials.clubhouse || r.credentials.owner),
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
  officer: number
  clubhouse: number
  noEmail: number
  /** Stage (m): people with no gender recorded, and each membership's head count (null before 094). */
  noGender?: number | null
  noCategory?: number | null
  byCategory?: Record<string, number>
}

/** One line of the Alerts, and where it goes. */
export interface Need { key: string; line: string; href: string }

/**
 * What needs the office (the Overview's Alerts — "Needs you" until Ross, 18 Nov 2026): competitions waiting
 * to be certified, people who could be emailed their code and never have
 * been, and people with no email to send one to. Only what is there; none
 * is "No alerts."
 */
export function needsYou(o: {
  base: string
  counts: ListCounts
  phases: { code: string; name: string; phase: CompPhase }[]
  clubSlug: string
  officer: boolean
  /** Stage (m): whether the club has any memberships yet. */
  hasCategories?: boolean
  /** Stage 3 (D271): each club match play's matches past their play-by date. */
  overdue?: { code: string; name: string; count: number }[]
}): Need[] {
  const out: Need[] = []
  for (const c of (o.overdue ?? []).filter(x => x.count > 0)) {
    out.push({
      key: `overdue-${c.code}`,
      line: `${c.name}: ${c.count} ${c.count === 1 ? 'match is' : 'matches are'} past the play-by date. ${o.officer ? 'Decide them on the match pages.' : 'An Officer decides them.'}`,
      href: `${o.base}/events/${c.code}`,
    })
  }
  for (const c of o.phases.filter(p => p.phase === 'awaiting')) {
    out.push({
      key: `certify-${c.code}`,
      line: `${c.name}: every card is in. ${o.officer ? 'Certify the results.' : 'An Officer certifies the results.'}`,
      // The Clubhouse's own page for it, never the members app (Ross, 17 Nov 2026).
      href: `${o.base}/events/${c.code}`,
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
  // Stage (m): only once the club has memberships is anybody "without" one.
  if (o.hasCategories && o.counts.noCategory) {
    out.push({
      key: 'no-category',
      line: `${o.counts.noCategory} ${o.counts.noCategory === 1 ? 'person has' : 'people have'} no membership, so they play any day.`,
      href: `${o.base}/members?category=none`,
    })
  }
  if (o.counts.noGender) {
    out.push({
      key: 'no-gender',
      line: `${o.counts.noGender} ${o.counts.noGender === 1 ? 'person has' : 'people have'} no gender recorded, so they can’t enter men’s or ladies’ competitions.`,
      href: `${o.base}/members?gender=none`,
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
  { key: 'memberships', label: 'Memberships', path: '/memberships' },
  { key: 'events', label: 'Events', path: '/events' },
  { key: 'calendar', label: 'Calendar', path: '/calendar' },
  { key: 'teesheet', label: 'Tee sheet', path: '/tee-sheet' },
  { key: 'awards', label: 'Golfer of the Year', path: '/awards' },
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

/** How long a club's activity log keeps a change (D210): two seasons. The nightly cleanup and the privacy notice both read it. */
export const ACTIVITY_KEEP_MONTHS = 24

/** "Green Dot staff" — what a club is shown for a staff change (D222), never who. */
export const STAFF_NAME = 'Green Dot staff'

// ─── Stage (k2): the season and the calendar (D214, D215) ──────

/** One of the club's events as the Competitions table and the Calendar read it. */
export interface SeasonEvent {
  code: string
  name: string
  /** `club` — one of the club's own events (`club_events`, stage c1), its facts on `note`. */
  kind: 'trip' | 'tournament' | 'run' | 'club'
  /** Its type (lib/clubEvents.ts) — absent on an event read before types: `seasonType` works it out. */
  type?: EventType
  /** A club event's own facts. */
  note?: ClubNote
  startDate: string | null
  endDate: string | null
  /** D285: unlinked from the members app — still read here, greyed, never shown to members. */
  unlinked?: true
  /** D288: its label's colour (else its type's default label's). */
  colour?: string
  /** A club competition's facts; null for any other event under the club. */
  competition: {
    phase: CompPhase
    courseName: string | null
    /** D277: its course, and its first and last tee time — the day view's block. Absent on a match play. */
    courseId?: string | null
    firstTee?: string | null
    lastTee?: string | null
    scoring: 'stableford' | 'strokes'
    allowance: number
    booked: number
    capacity: number
    membersOnly: boolean
    /** Stage (m): who may enter, said short — absent, everybody. */
    entry?: string
    /** A club match play (Ross, 17 Nov 2026): its format, biggest field, entries so far, and the days the calendar marks. */
    matchPlay?: { format: import('./clubMatchPlay').MatchPlayFormat; cap: number | null; entered: number; keyDates: string[] }
  } | null
}

/** An event's type: its own, else a competition's, a run challenge's Other sport, any other golf event's Golf. */
export function seasonType(e: Pick<SeasonEvent, 'type' | 'competition' | 'kind'>): EventType {
  return e.type ?? (e.competition ? 'COMP' : e.kind === 'run' ? 'SPORT' : 'GOLF')
}

/** A club event as the season table and the calendar read it. */
export function noteAsSeason(n: ClubNote, colour?: string): SeasonEvent {
  return { code: `ev-${n.id}`, name: n.title, kind: 'club', type: n.type, startDate: n.startsOn, endDate: n.endsOn ?? n.startsOn, competition: null, note: n, ...(colour ? { colour } : {}) }
}

/** Whether an event is Office only — the Clubhouse alone (only a club event can be). */
export function isOfficeOnly(e: Pick<SeasonEvent, 'note'>): boolean {
  return e.note?.visibility === 'office'
}

/** The format as the table says it: "Stableford · 95%". */
export function formatLine(c: { scoring: 'stableford' | 'strokes'; allowance: number; matchPlay?: { format: string } }): string {
  if (c.matchPlay) {
    const f = c.matchPlay.format
    return `${f === 'singles' ? 'Singles' : f === 'fourball' ? 'Fourball' : 'Foursomes'} match play${c.allowance !== 100 ? ` · ${c.allowance}%` : ''}`
  }
  return `${c.scoring === 'strokes' ? 'Strokes' : 'Stableford'}${c.allowance !== 100 ? ` · ${c.allowance}%` : ''}`
}

/** The events of one year, in date order (an undated one last). */
export function seasonOfYear(events: SeasonEvent[], year: number): SeasonEvent[] {
  return events
    .filter(e => (e.startDate ?? '').startsWith(`${year}-`) || (e.endDate ?? '').startsWith(`${year}-`))
    .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || a.name.localeCompare(b.name))
}

/** The years a season table offers: the ones with events, and this one. */
export function seasonYears(events: SeasonEvent[], thisYear: number): number[] {
  const ys = new Set<number>([thisYear])
  for (const e of events) if (e.startDate) ys.add(Number(e.startDate.slice(0, 4)))
  return [...ys].sort((a, b) => b - a)
}

/** A month as the Calendar draws it: weeks from Monday, each day its date (or null outside the month). */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** The events on a day: starting on it, or running across it. */
export function eventsOn(events: SeasonEvent[], day: string): SeasonEvent[] {
  // A match play runs for months: the calendar marks only its own days — entries closing, the draw, each play-by date.
  return events.filter(e => e.competition?.matchPlay
    ? e.competition.matchPlay.keyDates.includes(day)
    : e.startDate && e.startDate <= day && (e.endDate ?? e.startDate) >= day)
}

/** The month after or before, as [year, month]. */
export function stepMonth(year: number, month: number, by: 1 | -1): [number, number] {
  const m = month + by
  return m === 0 ? [year - 1, 12] : m === 13 ? [year + 1, 1] : [year, m]
}

/** At most this many competitions made by one Copy or Repeat weekly. */
export const MAX_COPIES = 26

/** Every week from a date, `count` times — Repeat weekly's dates. */
export function weeklyFrom(start: string, count: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(count) || count < 1) return []
  const [y, m, d] = start.split('-').map(Number)
  return Array.from({ length: Math.min(count, MAX_COPIES) }, (_, i) => new Date(Date.UTC(y, m - 1, d + 7 * i)).toISOString().slice(0, 10))
}

/**
 * Where an event opens from the Clubhouse — **never the members app** (Ross,
 * 17 Nov 2026: all the Clubhouse's admin stays in the Clubhouse): a
 * competition on the Clubhouse's own page for it, a club event in place
 * (null), and anything else — a trip or event the club runs on its own pages
 * — by its code, in a tab of its own (`opensOutside`).
 */
export function eventHref(e: Pick<SeasonEvent, 'code' | 'competition' | 'kind'>, slug: string): string | null {
  if (e.kind === 'club') return null
  return e.competition ? `/clubhouse/${slug}/events/${e.code}` : `/${e.code}`
}

/** An event that is neither a competition nor the club's own: it lives on its own pages, opened in a new tab so the Clubhouse stays. */
export function opensOutside(e: Pick<SeasonEvent, 'competition' | 'kind'>): boolean {
  return e.kind !== 'club' && !e.competition
}

/**
 * D285 (Ross, 22 Nov 2026): an event that opens outside the members app is
 * the one kind that can be unlinked from it — linked, it shows to members as
 * an event of the club; unlinked it stays under the club, read here and
 * greyed, and members never see it. Its status is the chain-link, not a
 * phase: an event outside the app has no status the club tracks. A
 * competition and the club's own events are the club's and never unlink.
 */
export function linkable(e: Pick<SeasonEvent, 'competition' | 'kind'>): boolean {
  return opensOutside(e)
}
