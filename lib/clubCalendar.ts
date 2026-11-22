// A member's Calendar and "Your bookings" (D286, Ross, 22 Nov 2026) — the
// only copy of what a member is told about each thing on at their club, from
// their own point of view, and where a tap on it goes.
//
// Every line comes from here — "Booked in at 14:00 with:" and the names,
// "Book now", "Booking hasn't opened", "You aren't eligible to book this
// event", "Booking closed" — so the Calendar's month, week and day, and the
// Home's Your bookings, can never disagree. Pure: the server
// (`app/api/club/teeTimes.ts`, action `calendar`) hands it the facts, and the
// screens only draw what comes back.

import { describeShortDate, describeTime } from './itinerary'
import { compHome, compSectionHref } from './clubBar'
import type { ClubNote } from './clubEvents'

/** What a thing on the calendar is. */
export type CalKind =
  /** A club competition: first tee to last. */
  | 'comp'
  /** The casual tee sheet open for booking that day. */
  | 'open'
  /** A club event that takes the tee sheet — a course closed, a society day. */
  | 'block'
  /** One of the club's own events — a quiz night, the AGM. Nothing to book. */
  | 'event'
  /** A golf event run by the club on its own pages (D285: linked ones only). */
  | 'golf'

/** How the line reads: booked, open to book, waiting to open, not for you, or over. */
export type CalTone = 'booked' | 'open' | 'wait' | 'refused' | 'closed'

export interface CalStatus {
  line: string
  /** Who else is on the time — one a line, under "with:". */
  names?: string[]
  tone: CalTone
}

export interface CalItem {
  key: string
  kind: CalKind
  date: string
  /** A club event over several days: its last. */
  endDate?: string | null
  /** "08:00" — null for all day. */
  from: string | null
  to: string | null
  title: string
  detail?: string | null
  /** The member's own line — null where there is nothing to book. */
  status: CalStatus | null
  /** Where a tap goes; null opens the club event's sheet (`noteId`). */
  href: string | null
  noteId?: string
  /** A club event's own facts, for its sheet. */
  note?: ClubNote
}

/** The calendar's three views (D286): Month first, remembered per phone. */
export const CAL_VIEWS = ['month', 'week', 'day'] as const
export type CalView = (typeof CAL_VIEWS)[number]
export const DEFAULT_CAL_VIEW: CalView = 'month'
/** The most days one read covers — a month's grid, six weeks. */
export const CAL_MAX_DAYS = 42

/** The lines themselves — one copy. */
export const CAL_WORDS = {
  bookNow: 'Book now',
  notOpen: 'Booking hasn’t opened',
  refused: 'You aren’t eligible to book this event.',
  refusedSheet: 'You aren’t eligible to book tee times on this day.',
  closed: 'Booking closed',
  results: 'Results are in',
} as const

/** "Booked in at 14:00 with:" and the others on the time; no "with:" when alone. */
export function bookedStatus(clock: string, mates: string[]): CalStatus {
  return {
    line: `Booked in at ${describeTime(clock)}${mates.length ? ' with:' : ''}`,
    ...(mates.length ? { names: mates } : {}),
    tone: 'booked',
  }
}

/** An instant as Irish wall-clock time: the day and "HH:MM". */
export function irishParts(at: number): { day: string; clock: string } {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(at))
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '00'
  return { day: `${get('year')}-${get('month')}-${get('day')}`, clock: `${get('hour')}:${get('minute')}` }
}

/** "Opens Thu 19 Nov at 7:00 pm" for an instant. */
export function opensWords(at: number): string {
  const { day, clock } = irishParts(at)
  return `Opens ${describeShortDate(day)} at ${describeTime(clock)}`
}

export interface CompFacts {
  /** The member's own time and the others on it, or null. */
  mine: { clock: string; mates: string[] } | null
  /** Why the entry rules keep them out (or their membership does not play), or null. */
  refusal: string | null
  /** When booking opens — null: open from the start. */
  opensAt: number | null
  /** The first tee time, as an instant — booking closes then. */
  firstTeeAt: number | null
  certified: boolean
}

/**
 * A competition from the member's side. Booked first (whatever else is
 * true), then over, then not for them, then not open yet, else Book now.
 */
export function compStatus(c: CompFacts, now: number): CalStatus {
  if (c.mine) return bookedStatus(c.mine.clock, c.mine.mates)
  if (c.certified) return { line: CAL_WORDS.results, tone: 'closed' }
  if (c.firstTeeAt !== null && now >= c.firstTeeAt) return { line: CAL_WORDS.closed, tone: 'closed' }
  if (c.refusal) return { line: CAL_WORDS.refused, tone: 'refused' }
  if (c.opensAt !== null && now < c.opensAt) return { line: `${CAL_WORDS.notOpen}. ${opensWords(c.opensAt)}.`, tone: 'wait' }
  return { line: CAL_WORDS.bookNow, tone: 'open' }
}

/** Whether a competition's own tee sheet is where a tap should land: booking open, or the member's time on it. */
export function compBookingActive(c: CompFacts, now: number): boolean {
  if (c.certified) return false
  if (c.firstTeeAt !== null && now >= c.firstTeeAt) return false
  if (c.mine) return true
  return c.opensAt === null || now >= c.opensAt
}

/** Where a competition opens: straight into its tee times while booking is live, else its Summary. */
export function compHref(slug: string, code: string, c: CompFacts, now: number): string {
  return compBookingActive(c, now) ? compSectionHref(slug, code, 'tee') : compHome(slug, code)
}

export interface OpenFacts {
  /** The member's own bookings that day, earliest first. */
  mine: { clock: string; mates: string[] }[]
  /** Why they may not book that day, or null. */
  refusal: string | null
  /** "Booking opens Sat 15 Nov at 7:00 pm" while it has not — the casual sheet's own line. */
  opening: string | null
}

/** The casual tee sheet's day from the member's side. */
export function openStatus(o: OpenFacts): CalStatus {
  if (o.mine.length) return bookedStatus(o.mine[0].clock, o.mine[0].mates)
  if (o.refusal) return { line: CAL_WORDS.refusedSheet, tone: 'refused' }
  if (o.opening) return { line: `${CAL_WORDS.notOpen}. ${o.opening.replace(/^Booking opens/, 'Opens')}.`, tone: 'wait' }
  return { line: CAL_WORDS.bookNow, tone: 'open' }
}

/** The club's casual tee sheet on a day. */
export function openHref(slug: string, date: string): string {
  return `/club/${slug}?tab=tee&day=${date}`
}

/** What the member is booked into (Home's Your bookings): every booked item, soonest first. */
export function bookedItems(items: CalItem[], today: string): CalItem[] {
  return items
    .filter(i => i.status?.tone === 'booked' && i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.from ?? '').localeCompare(b.from ?? '') || a.title.localeCompare(b.title))
}

/** Home's Calendar preview: the next few things on, never the open tee sheet (that is every day). */
export function nextItems(items: CalItem[], today: string, n = 3): CalItem[] {
  return items
    .filter(i => i.kind !== 'open' && (i.endDate ?? i.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.from ?? '').localeCompare(b.from ?? '') || a.title.localeCompare(b.title))
    .slice(0, n)
}

/** Whether an item is on a day (a club event may run several). */
export function onDay(i: Pick<CalItem, 'date' | 'endDate'>, day: string): boolean {
  return day >= i.date && day <= (i.endDate ?? i.date)
}

/** The days a view shows around a day: one, Monday to Sunday, or a month's grid (Monday first, whole weeks). */
export function viewRange(view: CalView, day: string): { from: string; to: string } {
  if (view === 'day') return { from: day, to: day }
  if (view === 'week') { const m = mondayOf(day); return { from: m, to: plusDays(m, 6) } }
  const first = `${day.slice(0, 7)}-01`
  const from = mondayOf(first)
  const last = plusDays(`${nextMonth(day)}-01`, -1)
  const lastMon = mondayOf(last)
  return { from, to: plusDays(lastMon, 6) }
}

/** The day a view moves to with ‹ or ›. */
export function stepView(view: CalView, day: string, by: 1 | -1): string {
  if (view === 'day') return plusDays(day, by)
  if (view === 'week') return plusDays(day, 7 * by)
  const [y, m] = day.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 10)
}

export function plusDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export function mondayOf(day: string): string {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
  return plusDays(day, -dow)
}

function nextMonth(day: string): string {
  const [y, m] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)
}

/** Every day from one to another, both included. */
export function daysFrom(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length <= 400; d = plusDays(d, 1)) out.push(d)
  return out
}

/** A clock as minutes, for laying a day out. */
export function clockMinutes(clock: string | null): number | null {
  const m = clock ? /^(\d{2}):(\d{2})/.exec(clock) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
