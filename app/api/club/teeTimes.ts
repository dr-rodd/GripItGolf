// A club's casual tee sheet on the server (Ross, 17 Nov 2026) — the members
// app's Tee times tab and the Clubhouse's Tee sheet both ask here. The rules
// are lib/clubTeeSheet.ts; this file only reads, checks and writes.
//
// Members (on the list, not taken off): `day` (a day's sheet — the times,
// the overlays, every booking with its name), `names` (people from the list
// to add, each with why they may not play that day), `book` and `cancel`.
// The Clubhouse (`keep_tee_sheet` — Clubhouse or Green Dot staff):
// `office.day` (the same, with the week around it), `office.book`,
// `office.move`, `office.remove` and `office.settings` (read, or save the
// settings and which memberships book). Every office change is in the
// club's activity log.
//
// Handed its store, so `test:clubs` runs it on a stand-in; ./teeTimesStore.ts
// is the service-role store.

import { labelNeedsIndex } from '@/lib/clubMembership'
import { colourFor, withDefaults, type ClubLabel } from '@/lib/clubLabels'
import type { IndexesOf } from './labelIndex'
import { isAccount, type AuthUser } from '@/lib/account'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { irishToday } from '@/lib/clubs'
import { STAFF_NAME } from '@/lib/clubhouse'
import { entryRefusal, notEligibleLine, refusalWords, type EntryRules } from '@/lib/clubMembership'
import { compSectionHref } from '@/lib/clubBar'
import {
  CASUAL_LOOK_AHEAD_DAYS, blockOverlay, bookingName, bookingRefusal, casualBookIssue, casualCancelIssue, casualDay,
  casualSettingsIssue, competitionOverlay, openingLine, overlayAt, readCasualSettings, readGuestName,
  type BookerFacts, type Bookee, type CasualBooking, type CasualSettings, type Overlay,
  type TeeBookingView, type TeeCategory, type TeeDayBody,
} from '@/lib/clubTeeSheet'
export type { TeeCategory }
import type { ClubNote } from '@/lib/clubEvents'
import type { ActivityEntry, ClubRecord, MemberRecord } from './club'
import { CAL_MAX_DAYS, compHref, compStatus, daysFrom, openHref, openStatus, plusDays, type CalItem, type CompFacts } from '@/lib/clubCalendar'
import { irishInstant } from '@/lib/irishTime'
import { noteTimeLine } from '@/lib/clubEvents'

/** What the calendar is worked out from (D286) — every read, handed to one pure-ish pass. */
export interface CalendarFacts {
  slug: string
  today: string
  now: number
  from: string
  to: string
  row: MemberRecord
  settings: CasualSettings
  ready: boolean
  categories: TeeCategory[]
  booked: StoredBooking[]
  comps: TeeComp[]
  blocks: ClubNote[]
  ageDate: string
  place: { lat: number | null; lng: number | null } | null
  notes: ClubNote[]
  golf: { code: string; name: string; startDate: string | null; endDate: string | null }[]
  /** D288: the member's handicap index, read only when a label's band asks for one. */
  myIndex?: number | null
  /** D288: the club's labels, every type's default first — the colour of everything on the calendar. */
  labels?: ClubLabel[]
}

/** The members the calendar must name: everybody on the member's own casual times. */
export function calendarMateIds(f: CalendarFacts): string[] {
  const mine = f.booked.filter(b => b.memberId === f.row.id || (!b.memberId && b.bookedBy === f.row.id))
  const ids = f.booked.filter(b => mine.some(m => m.date === b.date && m.time === b.time)).flatMap(b => [b.memberId, b.bookedBy])
  return [...new Set(ids.filter((x): x is string => !!x && x !== f.row.id))]
}

/**
 * Every thing on at the club in the days asked, each with the member's own
 * line and where a tap goes (D286; the lines are lib/clubCalendar.ts's).
 * Competitions from first tee to last, the casual sheet's open hours from
 * today to as far ahead as it books, the club's events — those that take
 * the sheet as blocks — and the golf events the club runs on their own pages.
 */
export function calendarItems(f: CalendarFacts, names: ReadonlyMap<string, string>): CalItem[] {
  const items: CalItem[] = []
  const r = f.row
  const cat = f.categories.find(c => c.id === r.categoryId) ?? null
  const me: BookerFacts = { memberId: r.id, name: r.name, playsHere: credentialsOf(r).playsHere, category: cat ? { days: cat.days, booksTeeTimes: cat.booksTeeTimes, name: cat.name } : null }
  for (const c of f.comps) {
    if (c.date < f.from || c.date > f.to) continue
    const seats = c.seats ?? []
    const mineSeat = seats.find(s => s.memberId === r.id) ?? null
    const refusal = !me.playsHere ? 'plays' : entryRefusal({
      rules: c.entry, person: { gender: r.gender ?? null, birthDate: r.birthDate ?? null, categoryId: r.categoryId ?? null, index: f.myIndex ?? null },
      category: f.categories.find(k => k.id === r.categoryId) ?? null, day: c.date, ageDate: f.ageDate, categories: f.categories,
    })
    const cf: CompFacts = {
      mine: mineSeat ? { clock: mineSeat.clock, mates: seats.filter(s => s.clock === mineSeat.clock && s !== mineSeat).map(s => s.name) } : null,
      refusal: refusal ? String(refusal) : null,
      opensAt: c.opensAt ?? null,
      firstTeeAt: c.clocks[0] ? irishInstant(c.date, c.clocks[0])?.getTime() ?? null : null,
      certified: c.certified,
    }
    items.push({
      key: `comp:${c.code}`, kind: 'comp', date: c.date, from: c.clocks[0] ?? null, to: c.clocks[c.clocks.length - 1] ?? null,
      title: c.name, status: compStatus(cf, f.now), href: compHref(f.slug, c.code, cf, f.now),
      colour: colourFor({ labelColour: c.entry?.label?.colour ?? null, type: 'COMP' }, f.labels ?? []),
    })
  }
  const look = plusDays(f.today, CASUAL_LOOK_AHEAD_DAYS)
  for (const d of f.ready ? daysFrom(f.from > f.today ? f.from : f.today, f.to < look ? f.to : look) : []) {
    const day = casualDay(d, f.place ? { lat: f.place.lat ?? NaN, lng: f.place.lng ?? NaN } : null, f.settings)
    if (!day.times.length) continue
    const mine = f.booked.filter(b => b.date === d && (b.memberId === r.id || (!b.memberId && b.bookedBy === r.id)))
      .sort((a, b) => a.time.localeCompare(b.time))
      .map(b => ({ clock: b.time, mates: f.booked.filter(x => x.date === d && x.time === b.time && x.id !== b.id).map(x => {
        const n = bookingName(x, names)
        return n.guestOf ? `${n.name} (guest)` : n.name
      }) }))
    items.push({
      key: `open:${d}`, kind: 'open', date: d, from: day.times[0], to: day.times[day.times.length - 1],
      title: 'Tee sheet open',
      status: openStatus({ mine, refusal: bookingRefusal(me, d, f.categories.length > 0, true), opening: openingLine(d, f.settings, new Date(f.now)) }),
      href: openHref(f.slug, d),
    })
  }
  const seen = new Set<string>()
  for (const n of [...f.blocks, ...f.notes]) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    items.push({
      key: `note:${n.id}`, kind: n.blocksSheet ? 'block' : 'event', date: n.startsOn, endDate: n.endsOn ?? null,
      from: n.startTime ?? null, to: n.endTime ?? null, title: n.title, detail: noteTimeLine(n) || null,
      status: null, href: null, noteId: n.id, note: n,
      colour: colourFor({ labelId: n.labelId ?? null, type: n.type }, f.labels ?? []),
    })
  }
  for (const g of f.golf) {
    if (!g.startDate || (g.endDate ?? g.startDate) < f.from || g.startDate > f.to) continue
    items.push({ key: `golf:${g.code}`, kind: 'golf', date: g.startDate, endDate: g.endDate, from: null, to: null, title: g.name, status: null, href: `/${g.code}`, colour: colourFor({ type: 'GOLF' }, f.labels ?? []) })
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.from ?? '').localeCompare(b.from ?? '') || a.title.localeCompare(b.title))
}


/** A competition under the club on a day, as the sheet needs it. */
export interface TeeComp {
  code: string
  name: string
  date: string
  courseId: string | null
  /** Its tee times, "08:00"… */
  clocks: string[]
  entry: EntryRules | null
  certified: boolean
  /** D286: when booking opens (its rules), as an instant — null: open from the start. Read with `seats`. */
  opensAt?: number | null
  /** D286: who is on each time — asked only by the calendar. */
  seats?: { memberId: string | null; name: string; clock: string }[]
}

export interface StoredBooking extends CasualBooking { seat: number }

/** Thrown by a store write before migration 096. */
export class TeeSheetNotReady extends Error {
  constructor() { super('club_tee_bookings is missing (migration 096)'); this.name = 'TeeSheetNotReady' }
}

export interface TeeTimesStore {
  userFromToken(token: string): Promise<AuthUser | null>
  /** A read's token checked locally where the keys allow (D195) — the day only reads. */
  readerFromToken?(token: string): Promise<AuthUser | null>
  club(clubId: string): Promise<ClubRecord | null>
  rowOf(clubId: string, userId: string): Promise<MemberRecord | null>
  isStaff(userId: string): Promise<boolean>
  /** The club's settings, and whether 096 is in. */
  settings(clubId: string): Promise<{ settings: CasualSettings; ready: boolean }>
  saveSettings(clubId: string, s: CasualSettings): Promise<void>
  /** The home course's latitude and longitude, or null. */
  place(courseId: string): Promise<{ lat: number | null; lng: number | null } | null>
  /** The club's memberships, each with whether it books tee times (on before 096). */
  categories(clubId: string): Promise<TeeCategory[]>
  setBooks(clubId: string, categoryId: string, books: boolean): Promise<void>
  /** The bookings from one day to another — null before 096. */
  bookings(clubId: string, from: string, to: string): Promise<StoredBooking[] | null>
  /** 'clash' when a seat or a member on the time is taken already. */
  insertBookings(rows: { club_id: string; play_on: string; tee_time: string; seat: number; member_id: string | null; guest_name: string | null; booked_by: string | null; created_by: string }[]): Promise<'ok' | 'clash'>
  deleteBookings(clubId: string, ids: string[]): Promise<void>
  /** Moves bookings to a time, each to its seat — 'clash' as above. */
  moveBookings(clubId: string, moves: { id: string; date: string; time: string; seat: number }[]): Promise<'ok' | 'clash'>
  rowsByIds(clubId: string, ids: string[]): Promise<MemberRecord[]>
  /** Names on the list matching what was typed — never numbers or emails. */
  searchRows(clubId: string, q: string, limit: number): Promise<MemberRecord[]>
  /** The club's competitions from one day to another, with their tee times. */
  comps(clubId: string, from: string, to: string, opts?: { seats?: boolean }): Promise<TeeComp[]>
  /** The club's events that take the sheet from one day to another (none before 096). */
  blocks(clubId: string, from: string, to: string): Promise<ClubNote[]>
  ageDate(clubId: string): Promise<string>
  /** D286: the club's own events a member sees from one day to another (the member's own hidden types left out) — none before 095. */
  events?(clubId: string, userId: string, from: string, to: string): Promise<ClubNote[]>
  /** D288: list rows' handicap indexes, for a label's handicap band. */
  indexesOf?: IndexesOf
  /** D288: the club's stored labels — null before 101. */
  labels?(clubId: string): Promise<ClubLabel[] | null>
  /** D286: golf events the club runs on their own pages — linked ones only (D285). */
  golfEvents?(clubId: string): Promise<{ code: string; name: string; startDate: string | null; endDate: string | null }[]>
  logActivity?(entries: ActivityEntry[]): Promise<void>
}

export type TeeOutcome =
  | { status: 200; body: TeeDayBody | { ok: true; names: { id: string; name: string; why: string | null }[] } | { ok: true; settings: CasualSettings; categories: TeeCategory[]; ready: boolean } | { ok: true } | { ok: true; today: string; items: CalItem[] } }
  | { status: 400 | 401 | 403 | 404 | 409 | 503; body: { ok: false; error: string } }

type FailStatus = 400 | 401 | 403 | 404 | 409 | 503
const fail = (status: FailStatus, error: string): TeeOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const DAY = /^\d{4}-\d{2}-\d{2}$/
const LATER = 'The tee sheet isn’t set up yet — try again later.'
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7))

function readPeople(raw: unknown): Bookee[] | null {
  if (!Array.isArray(raw) || raw.length > 4) return null
  const out: Bookee[] = []
  for (const p of raw) {
    const r = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    if (typeof r.memberId === 'string' && r.memberId) out.push({ memberId: r.memberId })
    else if ('guestName' in r) out.push({ guestName: readGuestName(r.guestName) ?? '' })
    else return null
  }
  return out
}

/** Free seats on a time, lowest first. */
function freeSeats(bookings: readonly StoredBooking[], time: string, size: number, leaving: ReadonlySet<string> = new Set()): number[] {
  const taken = new Set(bookings.filter(b => b.time === time && !leaving.has(b.id)).map(b => b.seat))
  return Array.from({ length: size }, (_, i) => i + 1).filter(s => !taken.has(s))
}

/** The day's reads, by the club's id alone — started before the asker is known (D282). */
function dayReads(store: TeeTimesStore, clubId: string, action: string, date: string) {
  const from = action === 'office.day' && DAY.test(date) ? mondayOf(date) : date
  const to = action === 'office.day' && DAY.test(date) ? addDays(from, 6) : date
  return Promise.all([
    store.settings(clubId),
    store.categories(clubId),
    store.bookings(clubId, from, to),
    store.comps(clubId, from, to),
    store.blocks(clubId, from, to),
    store.ageDate(clubId),
  ])
}

export async function runTeeTimes(input: Record<string, unknown> & { token: string | null; action: unknown }, store: TeeTimesStore, now: Date): Promise<TeeOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const action = str(input.action)
  const clubId = str(input.clubId)
  if (!clubId) return fail(400, 'Which club?')
  // MO3 (D282): a day's sheet only reads — its token checked locally, and the
  // club and the day's reads started beside it, answered only once the asker
  // is known. Every other action asks in order, as before.
  const reading = action === 'day' || action === 'office.day'
  const clubP = store.club(clubId)
  const early = reading ? dayReads(store, clubId, action, str(input.date) || irishToday(now)) : null
  early?.catch(() => null)
  clubP.catch(() => null)
  const user = await (reading && store.readerFromToken ? store.readerFromToken(input.token) : store.userFromToken(input.token))
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const [club, row, staff] = await Promise.all([
    clubP,
    store.rowOf(clubId, user.id).catch(() => null),
    action.startsWith('office.') ? store.isStaff(user.id).catch(() => false) : Promise.resolve(false),
  ])
  if (!club || !club.verifiedAt) return fail(404, 'No such club.')
  const creds = row ? credentialsOf(row) : null
  const office = action.startsWith('office.')
  if (office ? !clubMay('keep_tee_sheet', { row: creds, staff }) : !row) {
    return fail(403, office ? 'Only someone with Clubhouse keeps the tee sheet.' : 'The tee sheet is for the club’s members.')
  }
  const today = irishToday(now)
  const date = str(input.date) || today
  if (!DAY.test(date)) return fail(400, 'Pick a day.')
  if (!office && (date < today || date > addDays(today, CASUAL_LOOK_AHEAD_DAYS))) return fail(400, `The tee sheet runs today to ${CASUAL_LOOK_AHEAD_DAYS} days ahead.`)
  const byName = row?.name ?? STAFF_NAME
  const logged = async (act: string, changes: Record<string, [unknown, unknown]>, target: MemberRecord | null = null) => {
    if (!office || !store.logActivity) return
    await store.logActivity([{ clubId, byUser: user.id, byName, byStaff: !row && staff, action: act, memberId: target?.id ?? null, memberName: target?.name ?? null, changes, batchId: null }])
      .catch(e => console.error('tee sheet change not logged:', e))
  }

  // ─── Settings ───────────────────────────────────────────────
  if (action === 'office.settings') {
    const [{ settings, ready }, categories] = await Promise.all([store.settings(clubId), store.categories(clubId)])
    if (input.settings !== undefined || input.books !== undefined) {
      if (!ready) return fail(503, LATER)
      if (input.settings !== undefined) {
        const s = readCasualSettings({ ...settings, ...(input.settings as object) })
        const raw = { ...settings, ...(input.settings as Record<string, unknown>) } as CasualSettings
        const why = casualSettingsIssue(raw)
        if (why) return fail(400, why)
        try { await store.saveSettings(clubId, s) } catch { return fail(503, 'Could not save the settings — try again.') }
        await logged('teesheet.settings', Object.fromEntries((Object.keys(s) as (keyof CasualSettings)[]).filter(k => s[k] !== settings[k]).map(k => [k, [settings[k], s[k]]])))
        Object.assign(settings, s)
      }
      if (Array.isArray(input.books)) {
        for (const b of input.books as { id?: unknown; books?: unknown }[]) {
          const cat = categories.find(c => c.id === b?.id)
          if (!cat || typeof b.books !== 'boolean' || cat.booksTeeTimes === b.books) continue
          try { await store.setBooks(clubId, cat.id, b.books) } catch { return fail(503, 'Could not save the memberships — try again.') }
          await logged('teesheet.membership', { [cat.name]: [cat.booksTeeTimes ? 'Books tee times' : 'Doesn’t book', b.books ? 'Books tee times' : 'Doesn’t book'] })
          cat.booksTeeTimes = b.books
        }
      }
    }
    return { status: 200, body: { ok: true, settings, categories, ready } }
  }

  // ─── D286: the member's calendar — a range of days, each thing with their own line ───
  if (action === 'calendar') {
    if (office || !row) return fail(403, 'The calendar is for the club’s members.')
    const from = str(input.from), to = str(input.to)
    if (!DAY.test(from) || !DAY.test(to) || to < from || daysFrom(from, to).length > CAL_MAX_DAYS) return fail(400, 'Pick the days to show.')
    const [{ settings, ready }, categories, booked, comps, blocks, ageDate, place, notes, golf] = await Promise.all([
      store.settings(clubId), store.categories(clubId), store.bookings(clubId, from, to),
      store.comps(clubId, from, to, { seats: true }), store.blocks(clubId, from, to), store.ageDate(clubId),
      club.homeCourseId ? store.place(club.homeCourseId) : Promise.resolve(null),
      store.events ? store.events(clubId, user.id, from, to).catch(() => [] as ClubNote[]) : Promise.resolve([] as ClubNote[]),
      store.golfEvents ? store.golfEvents(clubId).catch(() => []) : Promise.resolve([]),
    ])
    // D288: the member's index, only when a competition's label band asks for one; the club's labels, for colour.
    const [myIndex, storedLabels] = await Promise.all([
      comps.some(c => labelNeedsIndex(c.entry)) && store.indexesOf ? store.indexesOf(clubId, [row]).then(m => m.get(row.id) ?? null).catch(() => null) : Promise.resolve(null),
      store.labels ? store.labels(clubId).catch(() => null) : Promise.resolve(null),
    ])
    const facts: CalendarFacts = { slug: club.slug, today, now: now.getTime(), from, to, row, settings, ready: ready && booked !== null, categories, booked: booked ?? [], comps, blocks, ageDate, place, notes, golf, myIndex, labels: withDefaults(storedLabels ?? []) }
    const names = new Map<string, string>([[row.id, row.name]])
    const mateIds = calendarMateIds(facts)
    for (const r of mateIds.length ? await store.rowsByIds(clubId, mateIds).catch(() => []) : []) names.set(r.id, r.name)
    return { status: 200, body: { ok: true, today, items: calendarItems(facts, names) } }
  }

  // ─── The day ────────────────────────────────────────────────
  const from = office && action === 'office.day' ? mondayOf(date) : date
  const to = office && action === 'office.day' ? addDays(from, 6) : date
  const [[{ settings, ready }, categories, booked, comps, blocks, ageDate], place, storedLabels] = await Promise.all([
    early ?? dayReads(store, clubId, action, date),
    club.homeCourseId ? store.place(club.homeCourseId) : Promise.resolve(null),
    // D288: the club's labels, for the overlays' colours.
    store.labels ? store.labels(clubId).catch(() => null) : Promise.resolve(null),
  ])
  const labels = withDefaults(storedLabels ?? [])
  // D288: the member's index, only when a competition's label band asks for one.
  const memberIndex = !office && row && comps.some(c => labelNeedsIndex(c.entry)) && store.indexesOf
    ? await store.indexesOf(clubId, [row]).then(m => m.get(row.id) ?? null).catch(() => null) : null
  const geo = place ? { lat: place.lat ?? NaN, lng: place.lng ?? NaN } : null
  const onSheet = (c: TeeComp) => !club.homeCourseId || !c.courseId || c.courseId === club.homeCourseId
  const overlaysOn = (d: string, forMember: MemberRecord | null): Overlay[] => [
    ...comps.filter(c => c.date === d && onSheet(c)).map(c => {
      const refusal = forMember ? entryRefusal({
        rules: c.entry, person: { gender: forMember.gender ?? null, birthDate: forMember.birthDate ?? null, categoryId: forMember.categoryId ?? null, index: memberIndex },
        category: categories.find(k => k.id === forMember.categoryId) ?? null, day: d, ageDate, categories,
      }) : null
      const mayBook = !!forMember && !refusal && !c.certified && d >= today && !!credentialsOf(forMember).playsHere
      const o = competitionOverlay({ code: c.code, name: c.name, clocks: c.clocks, detail: 'Booked through the competition', bookHref: mayBook ? compSectionHref(club.slug, c.code, 'tee') : null,
        // MS2 (D279): a member the entry rules refuse is told why, in place of Book.
        bookNote: forMember && refusal && !c.certified && d >= today ? notEligibleLine(refusalWords(refusal), 'book it') : null })
      // D288: the competition's label's colour, else Competition's.
      return o ? { ...o, colour: colourFor({ labelColour: c.entry?.label?.colour ?? null, type: 'COMP' }, labels) } as Overlay : null
    }).filter((o): o is Overlay => !!o),
    ...blocks.map(b => { const o = blockOverlay(b, d); return o ? { ...o, colour: colourFor({ labelId: b.labelId ?? null, type: b.type }, labels) } as Overlay : null }).filter((o): o is Overlay => !!o),
  ]
  const dayBookings = (d: string) => (booked ?? []).filter(b => b.date === d)
  const hasMemberships = categories.length > 0
  const factsOf = (r: MemberRecord): BookerFacts => {
    const cat = categories.find(c => c.id === r.categoryId) ?? null
    return { memberId: r.id, name: r.name, playsHere: credentialsOf(r).playsHere, category: cat ? { days: cat.days, booksTeeTimes: cat.booksTeeTimes, name: cat.name } : null }
  }

  if (action === 'names' || action === 'office.names') {
    const q = str(input.q).trim().replace(/\s+/g, ' ').slice(0, 40)
    if (q.length < 2) return { status: 200, body: { ok: true, names: [] } }
    const rows = await store.searchRows(clubId, q, 12)
    return { status: 200, body: { ok: true, names: rows.map(r => ({ id: r.id, name: r.name, why: bookingRefusal(factsOf(r), date, hasMemberships, r.id === row?.id) })) } }
  }

  if (action === 'day' || action === 'office.day') {
    const day = casualDay(date, geo, settings)
    const these = dayBookings(date)
    const names = new Map<string, string>()
    const ids = [...new Set(these.flatMap(b => [b.memberId, b.bookedBy]).filter((x): x is string => !!x))]
    for (const r of ids.length ? await store.rowsByIds(clubId, ids).catch(() => []) : []) names.set(r.id, r.name)
    if (row) names.set(row.id, row.name)
    const views: TeeBookingView[] = these.map(b => {
      const n = bookingName(b, names)
      return {
        id: b.id, time: b.time, name: n.name, guestOf: n.guestOf, memberId: b.memberId,
        mayCancel: !casualCancelIssue(b, { memberId: row?.id ?? null, office }, now),
        mine: !!row && (b.memberId === row.id || (!b.memberId && b.bookedBy === row.id)),
      }
    }).sort((a, b) => a.time.localeCompare(b.time))
    const body: TeeDayBody = {
      ok: true, ready: ready && booked !== null, date, today, sun: day.sun, times: day.times,
      overlays: overlaysOn(date, office ? null : row), settings,
      opening: openingLine(date, settings, now), bookings: views,
      me: row ? { memberId: row.id, name: row.name, refusal: bookingRefusal(factsOf(row), date, hasMemberships, true) } : null,
      office, noHomeCourse: !club.homeCourseId,
    }
    if (office) {
      body.week = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(from, i)
        const t = casualDay(d, geo, settings).times
        const ov = overlaysOn(d, null)
        const free = t.filter(x => !overlayAt(ov, x))
        return { date: d, booked: dayBookings(d).length, places: free.length * settings.groupSize, overlays: ov.length }
      })
      body.categories = categories
    }
    return { status: 200, body }
  }

  if (!ready || booked === null) return fail(503, LATER)

  // ─── Book ───────────────────────────────────────────────────
  if (action === 'book' || action === 'office.book') {
    const people = readPeople(input.people)
    if (!people) return fail(400, 'Choose who to put on the time.')
    const time = str(input.time)
    const day = casualDay(date, geo, settings)
    const memberIds = people.flatMap(p => ('memberId' in p ? [p.memberId] : []))
    const rows = memberIds.length ? await store.rowsByIds(clubId, memberIds) : []
    const members = new Map(rows.map(r => [r.id, factsOf(r)]))
    if (!office && people.some(p => 'guestName' in p) && !row) return fail(403, 'Only a member brings a guest.')
    const why = casualBookIssue({
      settings, date, time, times: day.times, overlays: overlaysOn(date, null), bookings: dayBookings(date), people, members,
      clubHasMemberships: hasMemberships, booker: office ? null : row!.id, office, now,
    })
    if (why) return fail(409, why)
    const seats = freeSeats(booked, time, settings.groupSize).filter(s => s <= 4)
    if (seats.length < people.length) return fail(409, 'That tee time has just filled — pick another.')
    // A guest the office books is the first member's in the booking, else nobody's; a member the office books, the office's.
    const host = office ? (memberIds[0] ?? null) : row!.id
    const result = await store.insertBookings(people.map((p, i) => ({
      club_id: clubId, play_on: date, tee_time: time, seat: seats[i],
      member_id: 'memberId' in p ? p.memberId : null, guest_name: 'guestName' in p ? p.guestName : null,
      booked_by: 'memberId' in p && office ? null : host, created_by: user.id,
    }))).catch(e => { if ((e as Error)?.name === 'TeeSheetNotReady') return 'later' as const; throw e })
    if (result === 'later') return fail(503, LATER)
    if (result === 'clash') return fail(409, 'Somebody got there first — that tee time has changed. Pick again.')
    const who = people.map(p => ('memberId' in p ? members.get(p.memberId)?.name ?? '' : `${p.guestName} (guest)`)).join(', ')
    await logged('teesheet.book', { [`${date} ${time}`]: [null, who] })
    return { status: 200, body: { ok: true } }
  }

  // ─── Cancel / remove ────────────────────────────────────────
  if (action === 'cancel' || action === 'office.remove') {
    const ids = action === 'cancel' ? [str(input.id)] : (Array.isArray(input.ids) ? (input.ids as unknown[]).map(str) : [])
    const these = booked.filter(b => ids.includes(b.id))
    if (!these.length || these.length !== new Set(ids).size) return fail(404, 'That booking has gone already.')
    for (const b of these) {
      const why = casualCancelIssue(b, { memberId: row?.id ?? null, office }, now)
      if (why) return fail(403, why)
    }
    // A member taken off takes the guests they brought on that time with them.
    const guests = action === 'cancel' && row && these[0].memberId === row.id
      ? booked.filter(g => !g.memberId && g.bookedBy === row.id && g.date === these[0].date && g.time === these[0].time)
      : []
    try { await store.deleteBookings(clubId, [...these, ...guests].map(b => b.id)) } catch { return fail(503, 'Could not take that off — try again.') }
    const names = new Map((await store.rowsByIds(clubId, these.flatMap(b => (b.memberId ? [b.memberId] : []))).catch(() => [])).map(r => [r.id, r.name]))
    await logged('teesheet.remove', Object.fromEntries(these.map(b => [`${b.date} ${b.time} · ${b.memberId ? names.get(b.memberId) ?? 'A member' : `${b.guestName} (guest)`}`, ['Booked', null]])))
    return { status: 200, body: { ok: true } }
  }

  // ─── Move (the office) ──────────────────────────────────────
  if (action === 'office.move') {
    const ids = Array.isArray(input.ids) ? (input.ids as unknown[]).map(str) : []
    const these = booked.filter(b => ids.includes(b.id))
    if (!these.length || these.length !== new Set(ids).size) return fail(404, 'That booking has gone already.')
    const time = str(input.time)
    const toDate = str(input.toDate) || date
    if (!DAY.test(toDate)) return fail(400, 'Pick a day.')
    const target = toDate === date ? booked : (await store.bookings(clubId, toDate, toDate)) ?? []
    const day = casualDay(toDate, geo, settings)
    const memberIds = these.flatMap(b => (b.memberId ? [b.memberId] : []))
    const rows = memberIds.length ? await store.rowsByIds(clubId, memberIds) : []
    const members = new Map(rows.map(r => [r.id, factsOf(r)]))
    const toOverlays = toDate === date ? overlaysOn(toDate, null) : [
      ...(await store.comps(clubId, toDate, toDate)).filter(onSheet).map(c => competitionOverlay({ code: c.code, name: c.name, clocks: c.clocks })).filter((o): o is Overlay => !!o),
      ...(await store.blocks(clubId, toDate, toDate)).map(b => blockOverlay(b, toDate)).filter((o): o is Overlay => !!o),
    ]
    const leaving = new Set(these.map(b => b.id))
    const why = casualBookIssue({
      settings, date: toDate, time, times: day.times, overlays: toOverlays, bookings: target.filter(b => b.date === toDate),
      people: these.map(b => (b.memberId ? { memberId: b.memberId } : { guestName: b.guestName ?? 'Guest' })),
      members, clubHasMemberships: hasMemberships, booker: null, office: true, now, moving: [...leaving],
    })
    if (why) return fail(409, why)
    const seats = freeSeats(target.filter(b => b.date === toDate), time, settings.groupSize, leaving)
    const result = await store.moveBookings(clubId, these.map((b, i) => ({ id: b.id, date: toDate, time, seat: seats[i] })))
    if (result === 'clash') return fail(409, 'Somebody got there first — that tee time has changed. Pick again.')
    await logged('teesheet.move', Object.fromEntries(these.map(b => [b.memberId ? rows.find(r => r.id === b.memberId)?.name ?? 'A member' : `${b.guestName} (guest)`, [`${b.date} ${b.time}`, `${toDate} ${time}`]])))
    return { status: 200, body: { ok: true } }
  }

  return fail(400, 'Unknown action.')
}
