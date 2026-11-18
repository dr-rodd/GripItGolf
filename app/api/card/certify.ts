// A club competition's results: No return, void, Certify, Reopen (stage
// (d4); D169–D172, Ross, 16 Nov 2026). All of it the club's owners' and
// admins'.
//
//   * **No return** — a booked player with no card (never started, or voided):
//     off the board, listed under it as NR, no season, and counted as
//     accounted for when scoring closes. Taken off again until certified.
//   * **Void** — an open card (`live_rounds` active) and every score on it,
//     its players free to start again or be marked No return.
//   * **Certify** — once every booked player's card is final (approved and
//     marked, stage (d3)) or a No return: the admin first sees every
//     handicap index changed on the day for the competition's players (the
//     D179 log, Irish date — old, new, when, by whom), then certifies. The
//     round's `certified_at` is set (migration 091 — no phone writes a
//     certified round's scores again), logged, the board becomes Results in
//     gold, and the round's card summaries are written — the season is fed
//     by certified rounds only.
//   * **Reopen** — `certified_at` cleared, logged, the round's summaries
//     deleted. Nothing else is touched.
//
// Handed its store, so `test:clubs` runs it on a stand-in; ./certifyStore.ts
// is the service-role store.

import { isAccount, type AuthUser } from '@/lib/account'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { irishInstant } from '@/lib/irishTime'
import type { MemberRecord } from '../club/club'
import type { Booked, CompRecord } from '../club/booking'
import { signedOff, type LiveCard, type Signature, type SignPlayer } from './sign'

export type PlayerState = 'none' | 'on_course' | 'waiting' | 'final' | 'no_return'

export interface RoundLock {
  /** Migration 091 is in: certifying and No return can be stored. */
  ready: boolean
  certifiedAt: string | null
  noReturns: string[]
}

export interface DayChange {
  userId: string | null
  memberId: string | null
  oldIndex: number | null
  newIndex: number | null
  at: string
  by: string | null
  source: string
}

export interface CertifyStore {
  userFromToken(token: string): Promise<AuthUser | null>
  competition(code: string): Promise<CompRecord | null>
  myRow(clubId: string, userId: string): Promise<MemberRecord | null>
  rowsByIds(clubId: string, ids: string[]): Promise<MemberRecord[]>
  /** The club's list rows these accounts are linked to — for naming who changed an index. */
  rowsByAccounts(clubId: string, userIds: string[]): Promise<MemberRecord[]>
  players(tripId: string): Promise<SignPlayer[]>
  bookings(roundId: string): Promise<Booked[]>
  liveCards(roundId: string): Promise<LiveCard[]>
  signatures(roundId: string): Promise<Signature[] | null>
  roundLock(roundId: string): Promise<RoundLock>
  /** The index log between two instants for these accounts and list rows (089). */
  dayChanges(o: { userIds: string[]; memberIds: string[]; from: string; to: string }): Promise<DayChange[]>
  insertNoReturn(roundId: string, playerId: string, by: string): Promise<void>
  deleteNoReturn(roundId: string, playerId: string): Promise<void>
  voidCard(liveRoundId: string, roundId: string): Promise<void>
  setCertified(roundId: string, at: string | null): Promise<void>
  logCertification(roundId: string, action: 'certify' | 'reopen', by: string, at: string): Promise<void>
  /** The round's card summaries written (certify) — never in the way of it. */
  writeSummaries(code: string, roundId: string): Promise<void>
  /** …and let go (reopen). */
  dropSummaries(roundId: string): Promise<void>
  /** Stage 5: a club match play qualifying from this competition makes its field and draw — never in the way of certifying. */
  afterCertified?(code: string): Promise<void>
}

export interface StatePlayer {
  playerId: string
  name: string
  state: PlayerState
  /** The open card they are on, for Void. */
  liveRoundId: string | null
  /** Who else is on that card — a void takes them too. */
  cardmates: string[]
}

export interface ShownChange { name: string; oldIndex: number | null; newIndex: number | null; at: string; by: string; source: string }

export interface CertifyBody {
  ok: true
  ready?: boolean
  certifiedAt?: string | null
  players?: StatePlayer[]
  changes?: ShownChange[]
  mayCertify?: boolean
}

type FailStatus = 400 | 401 | 403 | 404 | 409 | 503
export type CertifyOutcome =
  | { status: 200; body: CertifyBody }
  | { status: FailStatus; body: { ok: false; error: string } }

const fail = (status: FailStatus, error: string): CertifyOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown) => (typeof v === 'string' ? v : '')
export const NOT_READY_091 = 'Certifying is not set up yet — the cards are safe as they are. Try again later.'

/**
 * Where each booked player stands, the one copy: No return, a card final
 * (approved and marked), a card waiting on a signature, on the course, or
 * nothing yet.
 */
export function playerStates(o: {
  booked: string[]
  noReturns: string[]
  signatures: Pick<Signature, 'playerId' | 'approvedAt' | 'markedAt'>[]
  cards: Pick<LiveCard, 'id' | 'status' | 'playerIds'>[]
}): Map<string, { state: PlayerState; liveRoundId: string | null; cardmates: string[] }> {
  const nr = new Set(o.noReturns)
  const sig = new Map(o.signatures.map(s => [s.playerId, s]))
  const out = new Map<string, { state: PlayerState; liveRoundId: string | null; cardmates: string[] }>()
  for (const id of o.booked) {
    const s = sig.get(id)
    const card = o.cards.find(c => c.status === 'active' && c.playerIds.includes(id)) ?? null
    const state: PlayerState = nr.has(id) ? 'no_return' : s ? (signedOff(s) ? 'final' : 'waiting') : card ? 'on_course' : 'none'
    out.set(id, { state, liveRoundId: state === 'on_course' && card ? card.id : null, cardmates: card ? card.playerIds.filter(p => p !== id) : [] })
  }
  return out
}

/** Scoring has closed: somebody booked, and every one of them final or a No return (D172). */
export function mayCertifyNow(states: Iterable<{ state: PlayerState }>): boolean {
  const all = [...states]
  return all.length > 0 && all.every(s => s.state === 'final' || s.state === 'no_return')
}

/** The Irish day a competition is played on, as two instants. */
export function irishDay(date: string): { from: string; to: string } | null {
  const from = irishInstant(date, '00:00')
  if (!from) return null
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const to = irishInstant(next.toISOString().slice(0, 10), '00:00')
  return to ? { from: from.toISOString(), to: to.toISOString() } : null
}

export async function runCertify(
  input: Record<string, unknown> & { token: string | null; action: unknown },
  store: CertifyStore,
  now: Date,
): Promise<CertifyOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const comp = await store.competition(str(input.code).trim().toUpperCase())
  if (!comp) return fail(404, 'No such competition.')
  const me = await store.myRow(comp.clubId, user.id)
  if (!me || !clubMay('run_events', { row: credentialsOf(me) })) return fail(403, 'Only the club’s Officers certify a competition.')
  const at = now.toISOString()

  const [lock, players, bookings, cards, sigs] = await Promise.all([
    store.roundLock(comp.roundId), store.players(comp.tripId), store.bookings(comp.roundId),
    store.liveCards(comp.roundId), store.signatures(comp.roundId),
  ])
  if (!lock.ready || sigs === null) return fail(503, NOT_READY_091)
  const playerById = new Map(players.map(p => [p.id, p]))
  const booked = bookings.map(b => b.playerId).filter(id => playerById.has(id))
  const states = playerStates({ booked, noReturns: lock.noReturns, signatures: sigs, cards })
  const nameOf = (id: string) => playerById.get(id)?.name ?? 'A player'

  if (input.action === 'state') {
    // The day's index changes for the competition's players (D179): their
    // accounts, and their list rows still without one.
    const rowIds = booked.map(id => playerById.get(id)?.clubMemberId).filter((x): x is string => !!x)
    const rows = await store.rowsByIds(comp.clubId, rowIds)
    const day = irishDay(comp.date)
    const changes = day && rows.length
      ? await store.dayChanges({ userIds: rows.flatMap(r => (r.userId ? [r.userId] : [])), memberIds: rows.map(r => r.id), ...day })
      : []
    const byAccount = await store.rowsByAccounts(comp.clubId, [...new Set(changes.flatMap(c => (c.by ? [c.by] : [])))])
    const whoseName = (c: DayChange) => rows.find(r => (c.userId && r.userId === c.userId) || (c.memberId && r.id === c.memberId))?.name ?? 'A player'
    const byName = (c: DayChange) => (c.by ? byAccount.find(r => r.userId === c.by)?.name ?? 'A Green Dot member' : 'Green Dot')
    return {
      status: 200,
      body: {
        ok: true, ready: true, certifiedAt: lock.certifiedAt,
        mayCertify: !lock.certifiedAt && mayCertifyNow(states.values()),
        players: booked.map(id => ({ playerId: id, name: nameOf(id), ...states.get(id)!, cardmates: states.get(id)!.cardmates.map(nameOf) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        changes: changes.sort((a, b) => a.at.localeCompare(b.at))
          .map(c => ({ name: whoseName(c), oldIndex: c.oldIndex, newIndex: c.newIndex, at: c.at, by: byName(c), source: c.source })),
      },
    }
  }

  if (input.action === 'reopen') {
    if (!lock.certifiedAt) return { status: 200, body: { ok: true } }
    try {
      await store.setCertified(comp.roundId, null)
      await store.logCertification(comp.roundId, 'reopen', user.id, at)
      await store.dropSummaries(comp.roundId).catch(e => console.error('summary drop on reopen failed:', e))
    } catch (e) {
      console.error('reopen failed:', e)
      return fail(503, 'Could not reopen the competition — try again.')
    }
    return { status: 200, body: { ok: true } }
  }

  // Everything below changes the results, so never once certified.
  if (lock.certifiedAt) return fail(409, 'The results are certified — reopen the competition first.')

  try {
    if (input.action === 'no_return') {
      const id = str(input.playerId)
      const s = states.get(id)
      if (!s) return fail(404, 'That player isn’t booked in this competition.')
      if (s.state === 'no_return') return { status: 200, body: { ok: true } }
      if (s.state !== 'none') {
        return fail(409, s.state === 'on_course'
          ? `${nameOf(id)}’s card is open — sign it or void it first.`
          : `${nameOf(id)} has a card signed — send it back first.`)
      }
      await store.insertNoReturn(comp.roundId, id, user.id)
      return { status: 200, body: { ok: true } }
    }
    if (input.action === 'undo_no_return') {
      await store.deleteNoReturn(comp.roundId, str(input.playerId))
      return { status: 200, body: { ok: true } }
    }
    if (input.action === 'void') {
      const card = cards.find(c => c.id === str(input.liveRoundId))
      if (!card) return fail(404, 'That card isn’t this competition’s.')
      if (card.status !== 'active') return fail(409, 'Only a card still being scored is voided — a signed one is sent back.')
      await store.voidCard(card.id, comp.roundId)
      return { status: 200, body: { ok: true } }
    }
    if (input.action === 'certify') {
      if (!mayCertifyNow(states.values())) {
        const open = booked.filter(id => !['final', 'no_return'].includes(states.get(id)!.state)).map(nameOf)
        return fail(409, open.length
          ? `Not every card is in: ${open.join(', ')} — sign, void or mark No return first.`
          : 'Nobody is booked in this competition.')
      }
      await store.setCertified(comp.roundId, at)
      await store.logCertification(comp.roundId, 'certify', user.id, at)
      await store.writeSummaries(comp.code, comp.roundId).catch(e => console.error('summary write on certify failed:', e))
      if (store.afterCertified) await store.afterCertified(comp.code).catch(e => console.error('qualified field on certify failed:', e))
      return { status: 200, body: { ok: true, certifiedAt: at } }
    }
  } catch (e) {
    console.error('certify action failed:', e)
    return fail(503, 'Could not save that — try again.')
  }
  return fail(400, 'Unknown request.')
}
