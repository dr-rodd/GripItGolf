// The Clubhouse's Overview as a control centre (D276, Ross, 21 Nov 2026) —
// the only copy of its rules. Pure: the Overview draws, the server reads.
//
// * **The period** — Today, or This week (Monday to Sunday, Irish dates, as
//   the Calendar reads them). It drives everything above the stats strip.
// * **What's on** — the competitions and the club's own events in the
//   period. A match play runs for months, so it is on only on its own days
//   (entries closing, the draw, each play-by date), as on the Calendar.
// * **Yours** — what the signed-in account is directly in: playing (on a
//   competition's tee sheet or a casual time), booked (somebody else onto a
//   time), entered (a match play), added (a club event they put on the
//   calendar — "booked by them" for an event with no bookings), and `role`,
//   in the shape now and filled by nothing until the role model exists.
// * **Search** — events and competitions matched here from the season
//   already read, members on the server through the grid's own search, and a
//   date read off what was typed ("sat", "21/11", "21 nov"). Ranked by how
//   the name matches, then the nearest date, upcoming first.

import { WEEKDAY_NAMES, weekdayOf } from './clubMembership'
import { eventsOn, type SeasonEvent } from './clubhouse'

export type Period = 'today' | 'week'

/** Monday of the week a day is in (YYYY-MM-DD). */
export function mondayOf(day: string): string {
  const d = utc(day)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return iso(d)
}

export function addDays(day: string, n: number): string {
  const d = utc(day)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** The days a period covers, first and last. */
export function periodRange(today: string, p: Period): { from: string; to: string } {
  if (p === 'today') return { from: today, to: today }
  const from = mondayOf(today)
  return { from, to: addDays(from, 6) }
}

/** Every day from `from` to `to`. */
export function daysOf(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

/** The first day in the period an event is on, or null — a match play only on its own days. */
export function firstDayIn(e: SeasonEvent, from: string, to: string): string | null {
  for (const d of daysOf(from, to)) if (eventsOn([e], d).length) return d
  return null
}

/** What's on in the period: competitions and everything else, each in date order (the day it is on in the period). */
export function whatsOn(events: SeasonEvent[], from: string, to: string): { comps: On[]; events: On[] } {
  const on = events.flatMap(e => {
    const day = firstDayIn(e, from, to)
    return day ? [{ event: e, day }] : []
  }).sort((a, b) => a.day.localeCompare(b.day) || (a.event.note?.startTime ?? '').localeCompare(b.event.note?.startTime ?? '') || a.event.name.localeCompare(b.event.name))
  return { comps: on.filter(o => o.event.competition), events: on.filter(o => !o.event.competition) }
}
export type On = { event: SeasonEvent; day: string }

/** A quiet period's one line — and, for a quiet day, what the week holds. */
export function quietLine(p: Period, weekCount: number): string {
  if (p === 'week') return 'Nothing on this week.'
  return weekCount > 0 ? `Nothing on today. This week: ${weekCount} ${weekCount === 1 ? 'event' : 'events'}.` : 'Nothing on today.'
}

/** A day as a card says it: "Today", "Tomorrow", else "Sat 21 Nov". */
export function dayWord(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  const d = utc(day)
  return `${WEEKDAY_NAMES[weekdayOf(day)].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

// ─── Yours ───

export type YoursKind = 'playing' | 'booked' | 'entered' | 'added' | 'role'

export interface YoursItem {
  key: string
  kind: YoursKind
  date: string
  time: string | null
  title: string
  /** Why it is yours, said short: "You're playing", "You booked 2". */
  why: string
  href: string
}

/** What the server reads about the signed-in account for the period. Nothing about anybody else beyond counts. */
export interface YoursFacts {
  /** Competition tee times: you on the sheet, and how many others you booked onto it. */
  comps: { code: string; name: string; date: string; time: string | null; playing: boolean; bookedOthers: number }[]
  /** Casual tee times, a time a row. */
  casual: { date: string; time: string; playing: boolean; bookedOthers: number }[]
  /** The match plays you are entered in, by code. */
  entered: string[]
  /** The club events you added, by id. */
  added: string[]
  /** Assigned roles — none until the role model exists (D276). */
  roles: { key: string; date: string; time: string | null; title: string; role: string; href: string }[]
}

export const NO_YOURS: YoursFacts = { comps: [], casual: [], entered: [], added: [], roles: [] }

/** What the account is in during the period, in date and time order. */
export function yoursIn(f: YoursFacts, events: SeasonEvent[], from: string, to: string, base: string): YoursItem[] {
  const inRange = (d: string) => d >= from && d <= to
  const items: YoursItem[] = []
  for (const c of f.comps.filter(c => inRange(c.date))) {
    items.push({
      key: `comp-${c.code}`, kind: c.playing ? 'playing' : 'booked', date: c.date, time: c.time, title: c.name,
      why: whyLine(c.playing, c.bookedOthers), href: `${base}/events/${c.code}`,
    })
  }
  for (const t of f.casual.filter(t => inRange(t.date))) {
    items.push({
      key: `tee-${t.date}-${t.time}`, kind: t.playing ? 'playing' : 'booked', date: t.date, time: t.time, title: 'Tee time',
      why: whyLine(t.playing, t.bookedOthers), href: `${base}/tee-sheet?day=${t.date}`,
    })
  }
  const byCode = new Map(events.map(e => [e.code, e]))
  for (const code of f.entered) {
    const e = byCode.get(code)
    const day = e ? firstDayIn(e, from, to) : null
    if (e && day) items.push({ key: `entered-${code}`, kind: 'entered', date: day, time: null, title: e.name, why: 'You’re entered', href: `${base}/events/${code}` })
  }
  for (const id of f.added) {
    const e = byCode.get(`ev-${id}`)
    const day = e ? firstDayIn(e, from, to) : null
    if (e && day) items.push({ key: `added-${id}`, kind: 'added', date: day, time: e.note?.startTime ?? null, title: e.name, why: 'You added it', href: `${base}/events?event=${id}` })
  }
  for (const r of f.roles.filter(r => inRange(r.date))) {
    items.push({ key: `role-${r.key}`, kind: 'role', date: r.date, time: r.time, title: r.title, why: r.role, href: r.href })
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title))
}

function whyLine(playing: boolean, others: number): string {
  const booked = others > 0 ? `you booked ${others}` : ''
  if (playing) return booked ? `You’re playing · ${booked}` : 'You’re playing'
  return `You booked ${others}`
}

// ─── Search ───

export type SearchResult =
  | { key: string; group: 'events'; label: string; sub: string; href: string }
  | { key: string; group: 'members'; label: string; sub: string; href: string }
  | { key: string; group: 'day'; label: string; sub: string; href: string }

/** At most this many results a group. */
export const SEARCH_GROUP_MAX = 6

/** How well a name matches: 0 the whole name or its start, 1 a word's start, 2 anywhere, null not at all. */
export function matchTier(name: string, q: string): 0 | 1 | 2 | null {
  const n = name.toLowerCase().trim(), s = q.toLowerCase().trim()
  if (!s) return null
  if (n.startsWith(s)) return 0
  if (n.split(/[\s\-–—'’()/&,.]+/).some(w => w.startsWith(s))) return 1
  return n.includes(s) ? 2 : null
}

/** Events matching what was typed: best match first, then the nearest date — upcoming before past. */
export function searchEvents(q: string, events: SeasonEvent[], today: string): SeasonEvent[] {
  const when = (e: SeasonEvent) => e.startDate ?? '9999-12-31'
  return events.flatMap(e => {
    const t = matchTier(e.name, q)
    return t === null ? [] : [{ e, t }]
  }).sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t
    const ua = when(a.e) >= today, ub = when(b.e) >= today
    if (ua !== ub) return ua ? -1 : 1
    return ua ? when(a.e).localeCompare(when(b.e)) : when(b.e).localeCompare(when(a.e))
  }).slice(0, SEARCH_GROUP_MAX).map(x => x.e)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A date read off what was typed — "today", "tomorrow", a weekday ("sat",
 * "saturday": the next one, today included), "21/11", "21/11/2026", "21 nov",
 * "nov 21", "2026-11-21" — or null. A day and month without a year is the
 * next one from today.
 */
export function parseDay(raw: string, today: string): string | null {
  const q = raw.toLowerCase().trim().replace(/\s+/g, ' ')
  if (!q) return null
  if (q === 'today') return today
  if (q === 'tomorrow') return addDays(today, 1)
  if (q.length >= 3) {
    const wd = WEEKDAY_NAMES.findIndex(n => n.toLowerCase().startsWith(q))
    if (wd >= 0 && q.length <= WEEKDAY_NAMES[wd].length) {
      const ahead = (wd - weekdayOf(today) + 7) % 7
      return addDays(today, ahead)
    }
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(q)
  if (m) return withYear(+m[1], +m[2], m[3], today)
  const mon = (s: string) => MONTHS.findIndex(x => s.startsWith(x.toLowerCase()) && s.length >= 3)
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)$/.exec(q)
  if (m && mon(m[2]) >= 0) return withYear(+m[1], mon(m[2]) + 1, undefined, today)
  m = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/.exec(q)
  if (m && mon(m[1]) >= 0) return withYear(+m[2], mon(m[1]) + 1, undefined, today)
  return null
}

function withYear(day: number, month: number, year: string | undefined, today: string): string | null {
  if (year) return valid(year.length === 2 ? 2000 + +year : +year, month, day)
  const y = +today.slice(0, 4)
  const d = valid(y, month, day)
  return d && d < today ? valid(y + 1, month, day) : d
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 ? iso(dt) : null
}

function utc(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
