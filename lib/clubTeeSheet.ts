// A club's casual tee sheet — the only copy of its rules (Ross, 17 Nov 2026).
//
// Casual golf, booked by the club's members on the members app and kept by
// the Clubhouse, on the club's home course (one course for now — a pending
// concept for a club with two). Never a competition: nothing is scored here.
//
//   * **The day's times** run from the first time at or after sunrise on the
//     interval's grid to the last an hour before sunset (lib/sun.ts — the
//     course's sun, Greenwich's where it has no location), at the club's
//     interval and players a time (default ten minutes and fours).
//   * **Overlays.** A club competition takes the sheet from its first tee
//     time to its last, inclusive and with no gap either side (Ross); an
//     event that takes the sheet (`blocksSheet`, Golf or Course only — a
//     corporate outing, a society, a course closure) from its start to its
//     end, all day without times. Nobody books a casual time under one; the
//     sheet says what it is and for how long, and a competition's overlay
//     goes on to the competition's own tee sheet for whoever may enter it.
//   * **Who books.** A member on the list who plays here (their membership
//     plays some day — D275), on a day their
//     membership plays and whose membership books tee times — every member
//     where the club has no memberships set up. A member books themselves
//     and others: members from the list, each checked the same way, and
//     guests by name ("Guest of Ross"), who take a place like anybody.
//   * **Limits.** Booking for a day opens some days before at a time (default
//     seven days before at 7 pm, Irish time); a member has one tee time a day
//     (the club may allow more); a booking is cancelled up to its tee time,
//     by its member or whoever made it. The Clubhouse books, moves and
//     removes anybody at any time — never onto a time under an overlay or
//     past a time's places.
//
// Pure. No I/O.

import { clockMins, minsClock, MAX_GROUP_SIZE, MAX_TEE_INTERVAL_MINS, MIN_GROUP_SIZE, MIN_TEE_INTERVAL_MINS } from './teeSheet'
import { CASUAL_LAST_TEE_BEFORE_SUNSET_MINS, clockLess, countUntil, sunDay, sunriseTee, type Place, type SunDay } from './sun'
import { daysBefore, irishInstant } from './irishTime'
import { describeShortDate, describeTime } from './itinerary'
import { playsOn, type Category } from './clubMembership'

// ─── Settings ────────────────────────────────────────────────────

export interface CasualSettings {
  /** Minutes between tee times. */
  interval: number
  /** Players a tee time. */
  groupSize: number
  /** Booking for a day opens this many days before, at this Irish time. */
  opensDaysBefore: number
  opensTime: string
  /** Tee times one member may hold on one day. */
  perDay: number
}

export const DEFAULT_CASUAL: CasualSettings = { interval: 10, groupSize: 4, opensDaysBefore: 7, opensTime: '19:00', perDay: 1 }
export const MAX_CASUAL_DAYS_BEFORE = 28
export const MAX_PER_DAY = 4
/** How far ahead the members app lets a member look. */
export const CASUAL_LOOK_AHEAD_DAYS = MAX_CASUAL_DAYS_BEFORE
/** Guest names are kept this short. */
export const GUEST_NAME_MAX = 40

const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isInteger(v) ? v : fallback)

/** The club's settings as stored — every missing or bad answer at its default. */
export function readCasualSettings(raw: unknown): CasualSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s: CasualSettings = {
    interval: int(r.interval, DEFAULT_CASUAL.interval),
    groupSize: int(r.groupSize, DEFAULT_CASUAL.groupSize),
    opensDaysBefore: int(r.opensDaysBefore, DEFAULT_CASUAL.opensDaysBefore),
    opensTime: typeof r.opensTime === 'string' && clockMins(r.opensTime) !== null ? r.opensTime.slice(0, 5) : DEFAULT_CASUAL.opensTime,
    perDay: int(r.perDay, DEFAULT_CASUAL.perDay),
  }
  return casualSettingsIssue(s) ? { ...DEFAULT_CASUAL, ...Object.fromEntries(Object.entries(s).filter(([k, v]) => !casualSettingsIssue({ ...DEFAULT_CASUAL, [k]: v }))) } : s
}

/** Why the settings cannot be saved, in a sentence — or null. */
export function casualSettingsIssue(s: CasualSettings): string | null {
  if (!Number.isInteger(s.interval) || s.interval < MIN_TEE_INTERVAL_MINS || s.interval > MAX_TEE_INTERVAL_MINS) {
    return `${MIN_TEE_INTERVAL_MINS} to ${MAX_TEE_INTERVAL_MINS} minutes between tee times.`
  }
  if (!Number.isInteger(s.groupSize) || s.groupSize < MIN_GROUP_SIZE || s.groupSize > MAX_GROUP_SIZE) {
    return `Between ${MIN_GROUP_SIZE} and ${MAX_GROUP_SIZE} players a tee time.`
  }
  if (!Number.isInteger(s.opensDaysBefore) || s.opensDaysBefore < 0 || s.opensDaysBefore > MAX_CASUAL_DAYS_BEFORE) {
    return `Booking opens between 0 and ${MAX_CASUAL_DAYS_BEFORE} days before.`
  }
  if (clockMins(s.opensTime) === null) return 'Pick the time booking opens.'
  if (!Number.isInteger(s.perDay) || s.perDay < 1 || s.perDay > MAX_PER_DAY) return `Between 1 and ${MAX_PER_DAY} tee times a member a day.`
  return null
}

/** "10 minutes apart · fours · opens 7 days before at 7:00 pm · one tee time a member a day". */
export function settingsLine(s: CasualSettings): string {
  const size = ['', '', 'twos', 'threes', 'fours'][s.groupSize] ?? `${s.groupSize} a time`
  const opens = s.opensDaysBefore === 0 ? `opens on the day at ${describeTime(s.opensTime)}` : `opens ${s.opensDaysBefore} day${s.opensDaysBefore === 1 ? '' : 's'} before at ${describeTime(s.opensTime)}`
  const per = s.perDay === 1 ? 'one tee time a member a day' : `${s.perDay} tee times a member a day`
  return `${s.interval} minutes apart · ${size} · ${opens} · ${per}`
}

// ─── The day's times ─────────────────────────────────────────────

export interface CasualDay {
  date: string
  sun: SunDay
  /** Every casual tee time, "06:50" … — empty when the sun gives none. */
  times: string[]
}

/** The day's casual tee times: sunrise on the grid to an hour before sunset. */
export function casualDay(date: string, place: Partial<Place> | null | undefined, s: Pick<CasualSettings, 'interval'>): CasualDay {
  const sun = sunDay(date, place)
  if (!sun.sunrise || !sun.sunset) return { date, sun, times: [] }
  const first = sunriseTee(sun.sunrise, s.interval)
  const limit = clockLess(sun.sunset, CASUAL_LAST_TEE_BEFORE_SUNSET_MINS)
  if (!first || !limit) return { date, sun, times: [] }
  const n = countUntil(first, s.interval, limit)
  const start = clockMins(first)!
  return { date, sun, times: Array.from({ length: n }, (_, i) => minsClock(start + i * s.interval)) }
}

// ─── Overlays ────────────────────────────────────────────────────

export interface Overlay {
  kind: 'competition' | 'block'
  /** The competition's code, or the event's id. */
  id: string
  title: string
  /** "08:00" — the first time it takes. */
  from: string
  /** "11:20" — a competition's last tee time (taken); an event's end (free from then). Null: to the end of the day. */
  to: string | null
  /** The event's notes, its place, the competition's format — said under the title. */
  detail: string | null
  /** A competition: whether this member may book into it, and where. */
  bookHref?: string | null
}

/** A competition's overlay — its first tee time to its last, no gap either side. */
export function competitionOverlay(c: { code: string; name: string; clocks: string[]; detail?: string | null; bookHref?: string | null }): Overlay | null {
  const mins = c.clocks.map(clockMins).filter((m): m is number => m !== null)
  if (!mins.length) return null
  return {
    kind: 'competition', id: c.code, title: c.name,
    from: minsClock(Math.min(...mins)), to: minsClock(Math.max(...mins)),
    detail: c.detail ?? null, bookHref: c.bookHref ?? null,
  }
}

/** An event that takes the sheet, on one of its days — null on a day it is not on. */
export function blockOverlay(e: { id: string; title: string; startsOn: string; endsOn: string | null; startTime: string | null; endTime: string | null; notes?: string | null; place?: string | null }, date: string): Overlay | null {
  if (date < e.startsOn || date > (e.endsOn ?? e.startsOn)) return null
  const from = e.startTime ?? '00:00'
  const detail = [e.place, e.notes].filter(Boolean).join(' · ') || null
  return { kind: 'block', id: e.id, title: e.title, from, to: e.startTime ? e.endTime : null, detail }
}

/** Whether an overlay takes a tee time. A competition's last time is its own; an event's end is free again. */
export function covers(o: Pick<Overlay, 'kind' | 'from' | 'to'>, time: string): boolean {
  const t = clockMins(time), a = clockMins(o.from)
  if (t === null || a === null || t < a) return false
  if (o.to === null) return true
  const b = clockMins(o.to)!
  return o.kind === 'competition' ? t <= b : t < b
}

/** The first overlay that takes a time, or null. */
export function overlayAt(overlays: readonly Overlay[], time: string): Overlay | null {
  return overlays.find(o => covers(o, time)) ?? null
}

/** "8:00 am to 11:20 am" — "from 12:00 pm", "All day". */
export function overlaySpan(o: Pick<Overlay, 'kind' | 'from' | 'to'>): string {
  if (o.to === null) return o.from === '00:00' ? 'All day' : `From ${describeTime(o.from)}`
  return `${describeTime(o.from)} to ${describeTime(o.to)}`
}

/**
 * One row of the day as a sheet draws it: a casual time, or an overlay over
 * the times it takes — with `caught`, those of its times somebody was
 * booked on before it took them (an outing blocked after, a competition
 * moved), so nobody's booking is ever out of sight.
 */
export type SheetRow =
  | { kind: 'time'; time: string }
  | { kind: 'overlay'; overlay: Overlay; times: string[]; caught: string[] }

/**
 * The day in order: casual times, and each overlay once, over the run of
 * times it takes — placed by its start where it takes none of the day's
 * times (a competition before sunrise is still said). `booked` are the
 * times with somebody on them: one off the grid (the interval changed since)
 * is a row of its own, one under an overlay is listed as caught by it.
 */
export function sheetRows(grid: readonly string[], overlays: readonly Overlay[], booked: Iterable<string> = []): SheetRow[] {
  const held = new Set(booked)
  const times = [...new Set([...grid, ...held])].sort((a, b) => (clockMins(a) ?? 0) - (clockMins(b) ?? 0))
  const rows: SheetRow[] = []
  const placed = new Set<Overlay>()
  for (const t of times) {
    const o = overlayAt(overlays, t)
    // Overlays that take none of the day's times, starting before this one.
    for (const x of overlays) {
      if (placed.has(x) || x === o || times.some(tt => covers(x, tt))) continue
      if ((clockMins(x.from) ?? 0) <= (clockMins(t) ?? 0)) { rows.push({ kind: 'overlay', overlay: x, times: [], caught: [] }); placed.add(x) }
    }
    if (!o) { rows.push({ kind: 'time', time: t }); continue }
    const band = rows.find((r): r is Extract<SheetRow, { kind: 'overlay' }> => r.kind === 'overlay' && r.overlay === o)
    const row = band ?? { kind: 'overlay' as const, overlay: o, times: [], caught: [] }
    if (!band) { rows.push(row); placed.add(o) }
    if (grid.includes(t)) row.times.push(t)
    if (held.has(t)) row.caught.push(t)
  }
  for (const x of overlays) if (!placed.has(x)) rows.push({ kind: 'overlay', overlay: x, times: [], caught: [] })
  return rows
}

// ─── Bookings ────────────────────────────────────────────────────

/** One place on a tee time: a member on the list, or a guest by name. */
export interface CasualBooking {
  id: string
  date: string
  time: string
  /** The list row — null for a guest. */
  memberId: string | null
  /** A guest's name — null for a member. */
  guestName: string | null
  /** The list row who made the booking — null when the Clubhouse did (staff). */
  bookedBy: string | null
}

/** Somebody being booked: a member by their list row, or a guest by name. */
export type Bookee = { memberId: string } | { guestName: string }

/** What decides whether a member may book a day. */
export interface BookerFacts {
  memberId: string
  name: string
  playsHere: boolean
  /** Their membership, or null. */
  category: (Pick<Category, 'days'> & { booksTeeTimes: boolean; name?: string }) | null
}

/**
 * Why this member may not book a casual tee time on this day — null when
 * they may. `clubHasMemberships`: with none set up, everybody who plays
 * here books every day.
 */
export function bookingRefusal(m: BookerFacts, date: string, clubHasMemberships: boolean, you = false): string | null {
  const who = you ? 'You' : m.name
  if (!m.playsHere) return you ? 'Your membership doesn’t play at the club — ask the office.' : `${m.name}’s membership doesn’t play at the club.`
  if (!clubHasMemberships) return null
  if (!m.category) return you ? 'You have no membership that books tee times — ask the office.' : `${m.name} has no membership that books tee times.`
  if (!m.category.booksTeeTimes) return `${who === 'You' ? 'Your' : `${m.name}’s`} membership doesn’t book tee times.`
  if (!playsOn(m.category, date)) return `${describeShortDate(date)} isn’t one of ${you ? 'your' : `${m.name}’s`} playing days.`
  return null
}

/** The instant booking for a day opens. */
export function opensFor(date: string, s: Pick<CasualSettings, 'opensDaysBefore' | 'opensTime'>): Date | null {
  const day = daysBefore(date, s.opensDaysBefore)
  return day ? irishInstant(day, s.opensTime) : null
}

/** "Booking opens Sat 15 Nov at 7:00 pm" — null once open. */
export function openingLine(date: string, s: Pick<CasualSettings, 'opensDaysBefore' | 'opensTime'>, now: Date): string | null {
  const at = opensFor(date, s)
  if (!at || now.getTime() >= at.getTime()) return null
  return `Booking opens ${describeShortDate(daysBefore(date, s.opensDaysBefore))} at ${describeTime(s.opensTime)}`
}

/** Whether a tee time has gone (Irish time). */
export function timeGone(date: string, time: string, now: Date): boolean {
  const at = irishInstant(date, time)
  return !!at && now.getTime() >= at.getTime()
}

/** A guest's name as kept — tidied, or null when there is none. */
export function readGuestName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, GUEST_NAME_MAX) : null
}

export interface BookInput {
  settings: CasualSettings
  date: string
  time: string
  /** The day's casual times. */
  times: readonly string[]
  overlays: readonly Overlay[]
  /** Every booking on the day. */
  bookings: readonly CasualBooking[]
  /** Who is being put on the time. */
  people: readonly Bookee[]
  /** Each member being booked — their facts for the day. */
  members: ReadonlyMap<string, BookerFacts>
  clubHasMemberships: boolean
  /** The member making the booking — null for the Clubhouse. */
  booker: string | null
  /** The Clubhouse: no opening, no playing days, no daily limit, a time gone allowed. */
  office: boolean
  now: Date
  /** A move: these bookings leave their time, so they do not count against it. */
  moving?: readonly string[]
}

/** Why this booking cannot be made, in a sentence — or null. */
export function casualBookIssue(b: BookInput): string | null {
  if (!b.times.includes(b.time)) return 'That isn’t a tee time on the sheet.'
  const o = overlayAt(b.overlays, b.time)
  if (o) return `${o.title} has the course then (${overlaySpan(o).toLowerCase()}).`
  if (!b.people.length) return 'Choose who to put on the time.'
  if (!b.office) {
    const opening = openingLine(b.date, b.settings, b.now)
    if (opening) return `${opening}.`
    if (timeGone(b.date, b.time, b.now)) return 'That tee time has gone.'
  }
  const moving = new Set(b.moving ?? [])
  const here = b.bookings.filter(x => x.time === b.time && !moving.has(x.id))
  const room = b.settings.groupSize - here.length
  if (b.people.length > room) {
    return room <= 0 ? `${describeTime(b.time)} is full.` : `Only ${room} place${room === 1 ? '' : 's'} left at ${describeTime(b.time)}.`
  }
  const ids = b.people.flatMap(p => ('memberId' in p ? [p.memberId] : []))
  if (new Set(ids).size !== ids.length) return 'Somebody is in the booking twice.'
  for (const p of b.people) {
    if ('guestName' in p) {
      if (!readGuestName(p.guestName)) return 'Give the guest’s name.'
      continue
    }
    const m = b.members.get(p.memberId)
    if (!m) return 'That member isn’t on the club’s list.'
    if (here.some(x => x.memberId === p.memberId)) return `${m.name} is already on this time.`
    if (b.office) continue
    const why = bookingRefusal(m, b.date, b.clubHasMemberships, p.memberId === b.booker)
    if (why) return why
    const held = b.bookings.filter(x => x.memberId === p.memberId && !moving.has(x.id))
    if (held.length >= b.settings.perDay) {
      const at = held.map(x => describeTime(x.time)).join(', ')
      return p.memberId === b.booker ? `You already have a tee time that day (${at}).` : `${m.name} already has a tee time that day (${at}).`
    }
  }
  return null
}

/** Why this booking cannot be cancelled by this member — null when it can. The Clubhouse cancels any. */
export function casualCancelIssue(x: CasualBooking, by: { memberId: string | null; office: boolean }, now: Date): string | null {
  if (by.office) return null
  if (!by.memberId || (x.memberId !== by.memberId && x.bookedBy !== by.memberId)) return 'Only the member, whoever booked them or the office takes them off.'
  if (timeGone(x.date, x.time, now)) return 'That tee time has gone.'
  return null
}

/** What a booking is called on the sheet: the member's name, or "Guest of Ross" under the guest's. */
export function bookingName(x: Pick<CasualBooking, 'memberId' | 'guestName' | 'bookedBy'>, names: ReadonlyMap<string, string>): { name: string; guestOf: string | null } {
  if (x.memberId) return { name: names.get(x.memberId) ?? 'A member', guestOf: null }
  return { name: x.guestName ?? 'Guest', guestOf: x.bookedBy ? (names.get(x.bookedBy) ?? null) : null }
}

/** The days a member may look at, today first. */
export function lookAheadDays(today: string, days = CASUAL_LOOK_AHEAD_DAYS): string[] {
  const t = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: days + 1 }, (_, i) => new Date(t + i * 86_400_000).toISOString().slice(0, 10))
}

// ─── What the server answers (/api/club/tee-times) ───────────────

export type TeeCategory = Category & { booksTeeTimes: boolean }

export interface TeeBookingView {
  id: string
  time: string
  name: string
  /** A guest's host — "Guest of Ross". */
  guestOf: string | null
  memberId: string | null
  /** This member may take it off. */
  mayCancel: boolean
  /** This member, or a guest they brought. */
  mine: boolean
}

/** A day's sheet as the server answers it — the members app and the Clubhouse draw it. */
export interface TeeDayBody {
  ok: true
  /** False before 096 — the sheet says it is not set up yet. */
  ready: boolean
  date: string
  today: string
  sun: SunDay
  times: string[]
  overlays: Overlay[]
  settings: CasualSettings
  /** "Booking opens Sat 15 Nov at 7:00 pm" — null once open. */
  opening: string | null
  bookings: TeeBookingView[]
  /** This member, and why they may not book this day (null: they may). */
  me: { memberId: string; name: string; refusal: string | null } | null
  office: boolean
  /** The Clubhouse: the week (Monday first) around the day, each day's places booked of all. */
  week?: { date: string; booked: number; places: number; overlays: number }[]
  categories?: TeeCategory[]
  /** The club has no home course: the sun is Greenwich's and every competition takes the sheet. */
  noHomeCourse: boolean
}

