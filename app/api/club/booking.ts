// Booking a club competition's tee times (D163, D165, D173; stage (d2)).
//
// A competition has no entered field: its field is the club's list. So a
// booking goes through the server — the account, its place on the list,
// the competition's club — and **makes the player for a list row** the
// first time that row is booked (`players.club_member_id`, one per event),
// with the one handicap index (D179). **Every player needs their own
// account** (D94's exception as amended, 16 Nov 2026): yourself, or a
// partner searched from the list whose place on it is linked to an account.
// A card may be scored on another phone, but the player approves it on their
// own account (stage (d3)). Withdraw is yours, those you booked, or anybody's by the club's
// admins, until the time has gone. The answer hands back this phone's own
// player, so it is "me" on the sheet and the card as it is everywhere, and
// the members-only door's way through (D164).
//
// Handed its store, so `test:clubs` runs it on a stand-in; ./bookingStore.ts
// is the service-role store.

import { indexCache, type IndexesOf } from './labelIndex'
import { labelNeedsIndex } from '@/lib/clubMembership'
import { isAccount, type AuthUser } from '@/lib/account'
import { bookingIssue, teeInstant, withdrawIssue } from '@/lib/clubComp'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { readIndex } from '@/lib/handicapIndex'
import { describeOpening, opensAt, slotGroupSize, slotGroupSizes, teeClocks, type TeeRules } from '@/lib/teeSheet'
import { sunDay } from '@/lib/sun'
import { STAFF_NAME } from '@/lib/clubhouse'
import { entryLine, entryRefusal, readAgeDate, refusalWords, type Category, type EntryRules } from '@/lib/clubMembership'
import type { ActivityEntry, MemberRecord } from './club'

export interface CompRecord {
  tripId: string
  code: string
  /** Its name — read alongside, absent from a stand-in that does not say. */
  name?: string
  courseId?: string
  clubId: string
  roundId: string
  date: string
  rules: TeeRules
  /** The members-only door's lock, or null when guests may watch. */
  publicHash: string | null
  /** Stage (m): who may enter (094's trip_private.entry_rules) — null, everybody. */
  entry?: EntryRules | null
}

export interface Booked { playerId: string; slot: number; bookedBy: string | null }
export interface CompPlayer { id: string; clubMemberId: string | null }

export interface BookingStore {
  /** D288: list rows' handicap indexes, for a label's handicap band. */
  indexesOf?: IndexesOf
  userFromToken(token: string): Promise<AuthUser | null>
  /** A verified club's competition by its code, or null. */
  competition(code: string): Promise<CompRecord | null>
  /** This account's place on the club's list — linked, not taken off. */
  myRow(clubId: string, userId: string): Promise<MemberRecord | null>
  /** Rows of this club's list by id, taken off ones left out. */
  rowsByIds(clubId: string, ids: string[]): Promise<MemberRecord[]>
  /** Names on the list matching what was typed — never numbers or emails. */
  searchRows(clubId: string, q: string, limit: number): Promise<({ id: string; name: string; linked: boolean } & Pick<MemberRecord, 'gender' | 'birthDate' | 'categoryId'>)[]>
  /** The one handicap index for a row (D179): its account's when linked, else its own. */
  indexOf(row: MemberRecord): Promise<number | null>
  players(tripId: string): Promise<CompPlayer[]>
  bookings(roundId: string): Promise<Booked[]>
  insertPlayer(row: { trip_id: string; name: string; handicap: number | null; club_member_id: string; claimed: boolean; gender: 'M' | 'F' }): Promise<string>
  /** 'clash' when one of them already has a time (one per player per round). */
  insertBookings(rows: { trip_id: string; round_id: string; player_id: string; slot_index: number; booked_by: string | null }[]): Promise<'ok' | 'clash'>
  deleteBookings(roundId: string, playerIds: string[]): Promise<void>
  /** A player booked and taken off before any card — gone with the booking. */
  deletePlayerIfUnplayed(playerId: string, roundId: string): Promise<void>
  /** D134: this account linked to its own player in the event, where nobody is. */
  linkAccount(userId: string, tripId: string, playerId: string): Promise<void>
  /** The members-only door's cookie value for this competition. */
  doorToken(c: CompRecord): string | null
  /**
   * D179 from the card start sheet: the one index set — the account's, or
   * the row's own — through the one writer, logged with the round; and the
   * row's players in any competition whose card has not started given it.
   */
  setIndexFromCard(row: MemberRecord, value: number | null, by: string, roundId: string): Promise<void>
  /** Stage (m): the club's memberships and the day its ages count on — none, and 1 January, before 094. */
  memberships?(clubId: string): Promise<{ categories: Category[]; ageDate: string }>
  /** The club's activity log (092), for an Officer's "Book anyway" — fail-soft. */
  logActivity?(entries: ActivityEntry[]): Promise<void>
  /** The Clubhouse (Ross, 17 Nov 2026): Green Dot staff keep any club's sheets. */
  isStaff?(userId: string): Promise<boolean>
  /** The Clubhouse's view of the sheet: every seat, the cards, the course and its sun. */
  officeSheet?(c: CompRecord): Promise<OfficeSheet>
  /** The Clubhouse moves players to another tee time. */
  moveBookings?(roundId: string, playerIds: string[], slot: number): Promise<void>
}

/** What the Clubhouse's competition page reads of a sheet. */
export interface OfficeSheet {
  seats: { playerId: string; rowId: string | null; name: string; handicap: number | null; slot: number; bookedBy: string | null }[]
  /** Players whose card has started, been signed or is final. */
  started: string[]
  certifiedAt: string | null
  courseName: string | null
  place: { lat: number | null; lng: number | null } | null
}

export interface BookingBody {
  ok: true
  /** This phone's own player in the competition, once it has one. */
  myPlayerId?: string | null
  /** This account's place on the list. */
  myRowId?: string
  admin?: boolean
  /** This account's player is on a tee time — only those play (Ross, 16 Nov 2026). */
  booked?: boolean
  /** Each name with why they may not enter, if they may not (stage (m)) — greyed, an Officer may book them anyway. */
  names?: { id: string; name: string; booked: boolean; linked: boolean; why?: string }[]
  /** Stage (m): who may enter, said short ("Ladies’ · Aged 50 and over") — absent, everybody. */
  entry?: string
  /** Stage (m): why this account may not enter, if it may not. */
  myRefusal?: string
}

export type BookingOutcome =
  | { status: 200; body: BookingBody; door: { code: string; value: string } | null }
  | { status: 400 | 401 | 403 | 404 | 409 | 503; body: { ok: false; error: string; anyway?: boolean } }

type FailStatus = 400 | 401 | 403 | 404 | 409 | 503
const fail = (status: FailStatus, error: string): BookingOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export async function runBooking(
  input: Record<string, unknown> & { token: string | null; action: unknown },
  store: BookingStore,
  now: Date,
): Promise<BookingOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const comp = await store.competition(str(input.code).trim().toUpperCase())
  if (!comp) return fail(404, 'No such competition.')
  if (str(input.action).startsWith('office.')) return runCompOffice(input, store, user, comp, now)
  const me = await store.myRow(comp.clubId, user.id)
  if (!me) return fail(403, 'This competition is for the club’s members. Sign in with the account on its list.')
  // Officers run the competition (D219): book anyone, change or withdraw any time.
  const admin = clubMay('run_events', { row: credentialsOf(me) })
  const tokenValue = store.doorToken(comp)
  const door = tokenValue ? { code: comp.code, value: tokenValue } : null

  const [players, bookings] = await Promise.all([store.players(comp.tripId), store.bookings(comp.roundId)])
  const playerOfRow = new Map(players.filter(p => p.clubMemberId).map(p => [p.clubMemberId as string, p.id]))
  const mine = playerOfRow.get(me.id) ?? null
  const booked = !!mine && bookings.some(b => b.playerId === mine)
  // Stage (m): who may enter, read once — the rules, the club's memberships
  // and its age date. Without rules a membership's days still decide.
  const ms = store.memberships ? await store.memberships(comp.clubId).catch(() => ({ categories: [] as Category[], ageDate: '01-01' })) : { categories: [] as Category[], ageDate: '01-01' }
  const rules = comp.entry ?? null
  // D288: a label's handicap band reads each person's index, loaded for the rows judged.
  const idx = indexCache(rules, comp.clubId, store.indexesOf)
  const refusalOf = (r: Pick<MemberRecord, 'gender' | 'birthDate' | 'categoryId'> & { id?: string }) => entryRefusal({
    rules, person: { gender: r.gender ?? null, birthDate: r.birthDate ?? null, categoryId: r.categoryId ?? null, index: idx.of(r.id) },
    category: ms.categories.find(c => c.id === r.categoryId) ?? null, day: comp.date, ageDate: readAgeDate(ms.ageDate), categories: ms.categories,
  })
  const line = entryLine(rules, ms.categories)
  await idx.load([me])
  const mineRefused = refusalOf(me)
  const ok = (body: Omit<BookingBody, 'ok'> = {}): BookingOutcome =>
    ({ status: 200, body: { ok: true, myRowId: me.id, admin, booked, ...(line ? { entry: line } : {}), ...(mineRefused ? { myRefusal: refusalWords(mineRefused) } : {}), ...body }, door })

  // What this phone is in the competition — and its way through the door.
  if (input.action === 'state') {
    if (mine) await store.linkAccount(user.id, comp.tripId, mine).catch(() => undefined)
    return ok({ myPlayerId: mine })
  }

  // Partners from the list (D173): names only, never a number or an email.
  if (input.action === 'names') {
    const q = str(input.q).trim()
    if (q.length < 2) return ok({ names: [] })
    const booked = new Set(bookings.map(b => b.playerId))
    const rows = await store.searchRows(comp.clubId, q.slice(0, 40), 20)
    // A name found carries no account: its index is read from its whole row.
    if (labelNeedsIndex(rules)) await idx.load(await store.rowsByIds(comp.clubId, rows.map(r => r.id)).catch(() => []))
    return ok({ names: rows.map(r => {
      const f = refusalOf(r)
      return { id: r.id, name: r.name, linked: r.linked, booked: booked.has(playerOfRow.get(r.id) ?? ''), ...(f ? { why: refusalWords(f, r.name) } : {}) }
    }) })
  }

  if (input.action === 'book') {
    const slot = typeof input.slot === 'number' ? input.slot : NaN
    const ids = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(str).filter(Boolean))]
    const rows = await store.rowsByIds(comp.clubId, ids)
    if (rows.length !== ids.length) return fail(404, 'Somebody chosen is not on the club’s list.')
    await idx.load(rows)
    const taken = bookings.filter(b => b.slot === slot).length
    const issue = bookingIssue({ rules: comp.rules, date: comp.date, slot, taken, adding: rows.length, admin, now: now.getTime() })
    if (issue) return fail(409, issue)
    const placed = await placeRows({
      store, comp, userId: user.id, rows, slot, bookings, playerOfRow, refusalOf, admin, anyway: input.anyway === true,
      bookedBy: mine, claimRowId: me.id, byName: me.name, byStaff: false,
    })
    if (!placed.ok) return placed.outcome
    const myPlayerId = rows.some(r => r.id === me.id) ? playerOfRow.get(me.id) ?? null : mine
    if (myPlayerId) await store.linkAccount(user.id, comp.tripId, myPlayerId).catch(() => undefined)
    return ok({ myPlayerId, booked: booked || rows.some(r => r.id === me.id) })
  }

  // D179: the card start sheet confirms each player's index, and a change
  // there is the one value changed everywhere — by whoever starts the card:
  // a player on the tee sheet (only they play — Ross, 16 Nov 2026) or the
  // club's admins, logged as the start sheet's.
  if (input.action === 'index') {
    if (!admin && !booked) return fail(403, 'Only the players on the tee sheet start a card.')
    const player = players.find(p => p.id === str(input.playerId))
    if (!player?.clubMemberId) return fail(404, 'That player isn’t in this competition.')
    const read = readIndex(input.index)
    if (!read.ok) return fail(400, read.why)
    const [row] = await store.rowsByIds(comp.clubId, [player.clubMemberId])
    if (!row) return fail(404, 'That player is no longer on the club’s list.')
    try {
      await store.setIndexFromCard(row, read.value, user.id, comp.roundId)
    } catch {
      return fail(503, 'Could not save the index — try again.')
    }
    return ok({ myPlayerId: mine })
  }

  if (input.action === 'withdraw') {
    const rowId = str(input.memberId)
    const playerId = playerOfRow.get(rowId)
    const booking = playerId ? bookings.find(b => b.playerId === playerId) : null
    if (!playerId || !booking) return fail(404, 'That booking isn’t on the sheet.')
    const clocks = teeClocks(comp.rules)
    const issue = withdrawIssue({
      date: comp.date, clock: clocks[booking.slot] ?? null,
      mine: rowId === me.id, bookedByMe: !!mine && booking.bookedBy === mine, admin, now: now.getTime(),
    })
    if (issue) return fail(403, issue)
    try {
      await store.deleteBookings(comp.roundId, [playerId])
      await store.deletePlayerIfUnplayed(playerId, comp.roundId)
    } catch {
      return fail(503, 'Could not take the booking off — try again.')
    }
    return ok({ myPlayerId: rowId === me.id ? null : mine, booked: rowId === me.id ? false : booked })
  }

  return fail(400, 'Unknown request.')
}

type Refusal = NonNullable<ReturnType<typeof entryRefusal>>

/**
 * Putting rows of the club's list on one tee time — the one copy, a
 * member's booking and the Clubhouse's alike: everybody plays here and has
 * their own account (D94's exception), nobody twice, who may enter (an
 * Officer or the office may book anyway, logged), the player made for a row
 * the first time it is booked, and two phones on one time at once settled
 * by whoever went over taking theirs back.
 */
async function placeRows(o: {
  store: BookingStore
  comp: CompRecord
  userId: string
  rows: MemberRecord[]
  slot: number
  bookings: Booked[]
  playerOfRow: Map<string, string>
  refusalOf: (r: Pick<MemberRecord, 'gender' | 'birthDate' | 'categoryId'> & { id?: string }) => Refusal | null
  admin: boolean
  anyway: boolean
  /** The player making the booking — null for the office. */
  bookedBy: string | null
  /** The booker's own row, claimed when they book themselves — null for the office. */
  claimRowId: string | null
  byName: string
  byStaff: boolean
}): Promise<{ ok: true; ids: string[] } | { ok: false; outcome: BookingOutcome }> {
  const { store, comp, rows, slot, playerOfRow } = o
  const no = (outcome: BookingOutcome) => ({ ok: false as const, outcome })
  // D209: somebody who does not play here is in no field — which follows their membership (D275).
  const notPlaying = rows.find(r => !clubMay('play', { row: credentialsOf(r) }))
  if (notPlaying) return no(fail(409, `${notPlaying.name}’s membership doesn’t play at the club.`))
  const noAccount = rows.find(r => !r.userId)
  if (noAccount) return no(fail(409, `${noAccount.name} needs a Green Dot account linked to the club’s list to play.`))
  const already = rows.find(r => o.bookings.some(b => b.playerId === playerOfRow.get(r.id)))
  if (already) return no(fail(409, `${already.name} already has a tee time.`))
  // Stage (m): who may enter. An Officer may book somebody anyway — a
  // record the club got wrong should not keep a player off the tee — and
  // that is logged (Ross, 17 Nov 2026).
  const refused = rows.map(r => ({ r, f: o.refusalOf(r) })).filter((x): x is { r: MemberRecord; f: Refusal } => !!x.f)
  if (refused.length && !(o.admin && o.anyway)) {
    const { r, f } = refused[0]
    return no({ status: 409, body: { ok: false, error: refusalWords(f, r.id === o.claimRowId ? null : r.name), ...(o.admin ? { anyway: true } : {}) } })
  }
  // The player for each row, made the first time it is booked.
  const ensure = async (row: MemberRecord): Promise<string> => {
    const have = playerOfRow.get(row.id)
    if (have) return have
    const made = await store.insertPlayer({
      trip_id: comp.tripId, name: row.name, handicap: await store.indexOf(row),
      club_member_id: row.id, claimed: row.id === o.claimRowId,
      // The card's tees follow the player's gender; not given stays the
      // men's, as every player has always been made.
      gender: row.gender ?? 'M',
    })
    playerOfRow.set(row.id, made)
    return made
  }
  try {
    const ids = await Promise.all(rows.map(ensure))
    const by = o.claimRowId && rows.some(r => r.id === o.claimRowId) ? playerOfRow.get(o.claimRowId) ?? o.bookedBy : o.bookedBy
    const out = await store.insertBookings(ids.map(pid => ({
      trip_id: comp.tripId, round_id: comp.roundId, player_id: pid, slot_index: slot, booked_by: by,
    })))
    if (out === 'clash') return no(fail(409, 'Somebody chosen has just been given a time — look again.'))
    // Two phones on one time at once: whoever went over takes theirs back.
    const after = (await store.bookings(comp.roundId)).filter(b => b.slot === slot).length
    if (after > slotGroupSize(comp.rules, slot)) {
      await store.deleteBookings(comp.roundId, ids)
      return no(fail(409, 'That tee time has just filled — choose another.'))
    }
    if (refused.length && store.logActivity) {
      await store.logActivity(refused.map(({ r, f }) => ({
        clubId: comp.clubId, byUser: o.userId, byName: o.byName, byStaff: o.byStaff, action: 'booking.override',
        memberId: r.id, memberName: r.name, changes: { [comp.code]: [refusalWords(f, r.name), 'booked anyway'] }, batchId: null,
      }))).catch(e => console.error('club activity not logged:', e))
    }
    return { ok: true, ids }
  } catch (e) {
    console.error('booking failed:', e)
    return no(fail(503, 'Could not book — try again.'))
  }
}

// ─── The Clubhouse keeps a competition's tee sheet (Ross, 17 Nov 2026) ───

/** One tee time as the Clubhouse's competition page draws it. */
export interface OfficeSlot {
  index: number
  /** "08:20". */
  clock: string
  size: number
  gone: boolean
  seats: { rowId: string | null; playerId: string; name: string; handicap: number | null; started: boolean }[]
}

export interface OfficeBody {
  ok: true
  comp: { code: string; name: string; date: string; courseName: string | null }
  slots: OfficeSlot[]
  sun: { sunrise: string | null; sunset: string | null; located: boolean }
  /** Booking for the members: when it opens, said — null once open. */
  opening: string | null
  entry?: string
  certified: boolean
  cardsStarted: boolean
}

/**
 * The Clubhouse's side of a competition's tee sheet — **never the members
 * app** (Ross: no tee sheet editing from the Clubhouse goes out to it):
 * `office.sheet` (every time and who is on it), `office.names`,
 * `office.book` (anybody on the list who plays here and has an account,
 * before booking opens, Book anyway logged), `office.move` (players to
 * another time with room) and `office.withdraw`. Clubhouse or Green Dot
 * staff (`keep_calendar`); every change on the club's activity log. Nothing
 * once the results are certified; a time gone takes nobody new.
 */
async function runCompOffice(input: Record<string, unknown>, store: BookingStore, user: AuthUser, comp: CompRecord, now: Date): Promise<BookingOutcome> {
  const [row, staff] = await Promise.all([
    store.myRow(comp.clubId, user.id).catch(() => null),
    store.isStaff ? store.isStaff(user.id).catch(() => false) : Promise.resolve(false),
  ])
  if (!clubMay('keep_calendar', { row: row ? credentialsOf(row) : null, staff })) return fail(403, 'Only someone with Clubhouse keeps the club’s competitions here.')
  const byName = row?.name ?? STAFF_NAME
  const byStaff = !row && staff
  const [players, bookings, ms] = await Promise.all([
    store.players(comp.tripId),
    store.bookings(comp.roundId),
    store.memberships ? store.memberships(comp.clubId).catch(() => ({ categories: [] as Category[], ageDate: '01-01' })) : Promise.resolve({ categories: [] as Category[], ageDate: '01-01' }),
  ])
  const playerOfRow = new Map(players.filter(p => p.clubMemberId).map(p => [p.clubMemberId as string, p.id]))
  const rules = comp.entry ?? null
  // D288: a label's handicap band reads each person's index, loaded for the rows judged.
  const idx = indexCache(rules, comp.clubId, store.indexesOf)
  const refusalOf = (r: Pick<MemberRecord, 'gender' | 'birthDate' | 'categoryId'> & { id?: string }) => entryRefusal({
    rules, person: { gender: r.gender ?? null, birthDate: r.birthDate ?? null, categoryId: r.categoryId ?? null, index: idx.of(r.id) },
    category: ms.categories.find(c => c.id === r.categoryId) ?? null, day: comp.date, ageDate: readAgeDate(ms.ageDate), categories: ms.categories,
  })
  const done = (body: Record<string, unknown> = {}): BookingOutcome => ({ status: 200, body: { ok: true, ...body } as BookingBody, door: null })
  const log = async (action: string, changes: Record<string, [unknown, unknown]>) => {
    if (!store.logActivity) return
    await store.logActivity([{ clubId: comp.clubId, byUser: user.id, byName, byStaff, action, memberId: null, memberName: null, changes, batchId: null }])
      .catch(e => console.error('club activity not logged:', e))
  }
  const sheet = store.officeSheet ? await store.officeSheet(comp) : null
  const certified = !!sheet?.certifiedAt
  const clocks = teeClocks(comp.rules)
  const nameOf = (pid: string) => sheet?.seats.find(x => x.playerId === pid)?.name ?? 'A player'

  if (input.action === 'office.sheet') {
    if (!sheet) return fail(503, 'Could not read the tee sheet — try again.')
    const sizes = slotGroupSizes(comp.rules)
    const started = new Set(sheet.started)
    const sun = sunDay(comp.date, sheet.place ? { lat: sheet.place.lat ?? NaN, lng: sheet.place.lng ?? NaN } : null)
    const slots: OfficeSlot[] = clocks.map((clock, index) => {
      const at = teeInstant(comp.date, clock)
      return {
        index, clock, size: sizes[index] ?? comp.rules.groupSize, gone: at !== null && now.getTime() >= at,
        seats: sheet.seats.filter(x => x.slot === index).map(x => ({ rowId: x.rowId, playerId: x.playerId, name: x.name, handicap: x.handicap, started: started.has(x.playerId) })),
      }
    })
    const opens = opensAt(comp.rules, comp.date)
    const line = entryLine(rules, ms.categories)
    const body: OfficeBody = {
      ok: true, comp: { code: comp.code, name: comp.name ?? comp.code, date: comp.date, courseName: sheet.courseName },
      slots, sun, opening: opens && now < opens ? describeOpening(comp.rules, comp.date) : null,
      ...(line ? { entry: line } : {}), certified, cardsStarted: sheet.started.length > 0,
    }
    return done(body as unknown as Record<string, unknown>)
  }

  if (input.action === 'office.names') {
    const q = str(input.q).trim()
    if (q.length < 2) return done({ names: [] })
    const booked = new Set(bookings.map(b => b.playerId))
    const rows = await store.searchRows(comp.clubId, q.slice(0, 40), 20)
    // A name found carries no account: its index is read from its whole row.
    if (labelNeedsIndex(rules)) await idx.load(await store.rowsByIds(comp.clubId, rows.map(r => r.id)).catch(() => []))
    return done({ names: rows.map(r => {
      const f = refusalOf(r)
      return { id: r.id, name: r.name, linked: r.linked, booked: booked.has(playerOfRow.get(r.id) ?? ''), ...(f ? { why: refusalWords(f, r.name) } : {}) }
    }) })
  }

  if (certified) return fail(409, 'The results are certified — an Officer reopens them before the tee sheet changes.')

  if (input.action === 'office.book') {
    const slot = typeof input.slot === 'number' ? input.slot : NaN
    const ids = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(str).filter(Boolean))]
    const rows = await store.rowsByIds(comp.clubId, ids)
    if (rows.length !== ids.length) return fail(404, 'Somebody chosen is not on the club’s list.')
    await idx.load(rows)
    const issue = bookingIssue({ rules: comp.rules, date: comp.date, slot, taken: bookings.filter(b => b.slot === slot).length, adding: rows.length, admin: true, now: now.getTime() })
    if (issue) return fail(409, issue)
    const placed = await placeRows({
      store, comp, userId: user.id, rows, slot, bookings, playerOfRow, refusalOf, admin: true, anyway: input.anyway === true,
      bookedBy: null, claimRowId: null, byName, byStaff,
    })
    if (!placed.ok) return placed.outcome
    await log('comp.book', { [`${comp.code} ${clocks[slot]}`]: [null, rows.map(r => r.name).join(', ')] })
    return done()
  }

  const rowIds = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(str).filter(Boolean))]
  const moving = rowIds.map(id => playerOfRow.get(id)).filter((x): x is string => !!x)
  const theirs = bookings.filter(b => moving.includes(b.playerId))
  if (!rowIds.length || theirs.length !== rowIds.length) return fail(404, 'That booking isn’t on the sheet.')
  const started = new Set(sheet?.started ?? [])

  if (input.action === 'office.move') {
    const slot = typeof input.slot === 'number' ? input.slot : NaN
    if (!store.moveBookings) return fail(503, 'Could not move them — try again.')
    const startedOne = theirs.find(b => started.has(b.playerId))
    if (startedOne) return fail(409, `${nameOf(startedOne.playerId)}’s card has started.`)
    const taken = bookings.filter(b => b.slot === slot && !moving.includes(b.playerId)).length
    const issue = bookingIssue({ rules: comp.rules, date: comp.date, slot, taken, adding: theirs.length, admin: true, now: now.getTime() })
    if (issue) return fail(409, issue)
    try { await store.moveBookings(comp.roundId, moving, slot) } catch { return fail(503, 'Could not move them — try again.') }
    await log('comp.move', Object.fromEntries(theirs.map(b => [`${comp.code} · ${nameOf(b.playerId)}`, [clocks[b.slot] ?? null, clocks[slot] ?? null]])))
    return done()
  }

  if (input.action === 'office.withdraw') {
    for (const b of theirs) {
      if (started.has(b.playerId)) return fail(409, `${nameOf(b.playerId)}’s card has started — void it on the members app first.`)
      const issue = withdrawIssue({ date: comp.date, clock: clocks[b.slot] ?? null, mine: false, bookedByMe: false, admin: true, now: now.getTime() })
      if (issue) return fail(403, issue)
    }
    try {
      await store.deleteBookings(comp.roundId, moving)
      for (const pid of moving) await store.deletePlayerIfUnplayed(pid, comp.roundId)
    } catch {
      return fail(503, 'Could not take the booking off — try again.')
    }
    await log('comp.withdraw', Object.fromEntries(theirs.map(b => [`${comp.code} · ${nameOf(b.playerId)}`, [clocks[b.slot] ?? null, null]])))
    return done()
  }

  return fail(400, 'Unknown request.')
}
