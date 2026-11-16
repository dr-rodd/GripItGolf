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

import { isAccount, type AuthUser } from '@/lib/account'
import { bookingIssue, withdrawIssue } from '@/lib/clubComp'
import { mayAdminister } from '@/lib/clubs'
import { readIndex } from '@/lib/handicapIndex'
import { teeClocks, type TeeRules } from '@/lib/teeSheet'
import type { MemberRecord } from './club'

export interface CompRecord {
  tripId: string
  code: string
  clubId: string
  roundId: string
  date: string
  rules: TeeRules
  /** The members-only door's lock, or null when guests may watch. */
  publicHash: string | null
}

export interface Booked { playerId: string; slot: number; bookedBy: string | null }
export interface CompPlayer { id: string; clubMemberId: string | null }

export interface BookingStore {
  userFromToken(token: string): Promise<AuthUser | null>
  /** A verified club's competition by its code, or null. */
  competition(code: string): Promise<CompRecord | null>
  /** This account's place on the club's list — linked, not taken off. */
  myRow(clubId: string, userId: string): Promise<MemberRecord | null>
  /** Rows of this club's list by id, taken off ones left out. */
  rowsByIds(clubId: string, ids: string[]): Promise<MemberRecord[]>
  /** Names on the list matching what was typed — never numbers or emails. */
  searchRows(clubId: string, q: string, limit: number): Promise<{ id: string; name: string; linked: boolean }[]>
  /** The one handicap index for a row (D179): its account's when linked, else its own. */
  indexOf(row: MemberRecord): Promise<number | null>
  players(tripId: string): Promise<CompPlayer[]>
  bookings(roundId: string): Promise<Booked[]>
  insertPlayer(row: { trip_id: string; name: string; handicap: number | null; club_member_id: string; claimed: boolean }): Promise<string>
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
  names?: { id: string; name: string; booked: boolean; linked: boolean }[]
}

export type BookingOutcome =
  | { status: 200; body: BookingBody; door: { code: string; value: string } | null }
  | { status: 400 | 401 | 403 | 404 | 409 | 503; body: { ok: false; error: string } }

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
  const me = await store.myRow(comp.clubId, user.id)
  if (!me) return fail(403, 'This competition is for the club’s members. Sign in with the account on its list.')
  const admin = mayAdminister(me.role)
  const tokenValue = store.doorToken(comp)
  const door = tokenValue ? { code: comp.code, value: tokenValue } : null

  const [players, bookings] = await Promise.all([store.players(comp.tripId), store.bookings(comp.roundId)])
  const playerOfRow = new Map(players.filter(p => p.clubMemberId).map(p => [p.clubMemberId as string, p.id]))
  const mine = playerOfRow.get(me.id) ?? null
  const booked = !!mine && bookings.some(b => b.playerId === mine)
  const ok = (body: Omit<BookingBody, 'ok'> = {}): BookingOutcome =>
    ({ status: 200, body: { ok: true, myRowId: me.id, admin, booked, ...body }, door })

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
    return ok({ names: rows.map(r => ({ id: r.id, name: r.name, linked: r.linked, booked: booked.has(playerOfRow.get(r.id) ?? '') })) })
  }

  if (input.action === 'book') {
    const slot = typeof input.slot === 'number' ? input.slot : NaN
    const ids = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(str).filter(Boolean))]
    const rows = await store.rowsByIds(comp.clubId, ids)
    if (rows.length !== ids.length) return fail(404, 'Somebody chosen is not on the club’s list.')
    const taken = bookings.filter(b => b.slot === slot).length
    const issue = bookingIssue({ rules: comp.rules, date: comp.date, slot, taken, adding: rows.length, admin, now: now.getTime() })
    if (issue) return fail(409, issue)
    // Every player needs their own account (D94's exception, amended).
    const noAccount = rows.find(r => !r.userId)
    if (noAccount) return fail(409, `${noAccount.name} needs a Green Dot account linked to the club’s list to play.`)
    const already = rows.find(r => bookings.some(b => b.playerId === playerOfRow.get(r.id)))
    if (already) return fail(409, `${already.name} already has a tee time.`)

    // The player for each row, made the first time it is booked.
    const ensure = async (row: MemberRecord): Promise<string> => {
      const have = playerOfRow.get(row.id)
      if (have) return have
      const made = await store.insertPlayer({
        trip_id: comp.tripId, name: row.name, handicap: await store.indexOf(row),
        club_member_id: row.id, claimed: row.id === me.id,
      })
      playerOfRow.set(row.id, made)
      return made
    }
    let myPlayerId = mine
    try {
      const ids2 = await Promise.all(rows.map(ensure))
      if (rows.some(r => r.id === me.id)) myPlayerId = playerOfRow.get(me.id) ?? null
      const out = await store.insertBookings(ids2.map(pid => ({
        trip_id: comp.tripId, round_id: comp.roundId, player_id: pid, slot_index: slot, booked_by: myPlayerId,
      })))
      if (out === 'clash') return fail(409, 'Somebody chosen has just been given a time — look again.')
      // Two phones on one time at once: whoever went over takes theirs back.
      const after = (await store.bookings(comp.roundId)).filter(b => b.slot === slot).length
      if (after > comp.rules.groupSize) {
        await store.deleteBookings(comp.roundId, ids2)
        return fail(409, 'That tee time has just filled — choose another.')
      }
      if (myPlayerId) await store.linkAccount(user.id, comp.tripId, myPlayerId).catch(() => undefined)
    } catch (e) {
      console.error('booking failed:', e)
      return fail(503, 'Could not book — try again.')
    }
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
