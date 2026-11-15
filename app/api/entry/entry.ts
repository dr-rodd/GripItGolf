// Entering an event — the one writer of `trip_members` (migration 068).
//
// Handed its store, so `test:membership` runs every path against a stand-in
// (`route.ts` is the service-role store and the request plumbing). Each call
// checks, in order: the phone's sign-in, the event by its code, the retry
// limit on any PIN offered, the admin PIN, the public PIN (or the entry
// cookie the public PIN door already set), and the claimed player — then
// merges what it found into the phone's row (lib/membership.ts, `mergeGrant`:
// never lowers anything) and says what the phone now is.
//
// From stage 3 the database reads the row; from stage 4 it tells the roles
// apart. Two more asks ride on the same route (D61, D64): `peek` — what is
// this phone in this event, without entering — and `close`, the padlock
// tapped shut, which ends this phone's PIN grant. Every PIN is checked here
// against its server-only hash (lib/pinHash.ts) and re-stored salted and
// slow, silently, the first time it is right.

import type { ClubAccess } from '@/lib/clubs'
import { createHash } from 'crypto'
import { entryAllowed, hashPin, verifyPin } from '@/lib/pinHash'
import { isPlayerId } from '@/lib/playerCookie'
import {
  ATTEMPT_LIMITS, afterFailure, attemptBlocked, closeOrganiser, mayWrite, mergeGrant, organiserByPin, roleOf,
  type AttemptKind, type AttemptLimit, type AttemptWindow, type EventFacts, type Membership, type Role,
} from '@/lib/membership'

export interface EntryTrip {
  id: string
  code: string
  endDate: string | null
  adminHash: string | null
  publicHash: string | null
  /** The field may still add rounds (lib/membership.ts `fieldOpenEnded`). */
  openEnded: boolean
  /** The Green Dot member who owns the event, if any (migration 085) — server only. */
  ownerId?: string | null
  /** D107: 'owner' keeps an owned, PIN-less event to its owner; null is today's rule. */
  settingsBy?: 'owner' | 'anyone' | null
  /** The club the event belongs to (migration 086) — server only. */
  clubId?: string | null
  clubName?: string | null
  /** D138–D140: who changes a club event. */
  clubAccess?: ClubAccess | null
  /**
   * The accounts that run the event through its club: the owners and admins
   * on a verified club's list, linked and not removed (D139). Empty for an
   * event outside a club, or a club not yet verified.
   */
  clubAdminIds?: string[]
}

/** What the rules need to know about an event, the one copy (entry, the event actions). */
export function factsOf(trip: EntryTrip): EventFacts {
  return {
    adminPinSet: !!trip.adminHash,
    endDate: trip.endDate,
    openEnded: trip.openEnded,
    ownerOnly: !trip.adminHash && !!trip.ownerId && trip.settingsBy === 'owner',
  }
}

/** This phone's row with whether its signed-in account owns the event — never stored. */
export function withOwner(m: Membership | null, trip: EntryTrip, userId: string): Membership | null {
  if (!m) return null
  // An owner runs their event on any phone they are signed in on (085), and
  // a verified club's owners and admins run the club's events (086, D139):
  // the same in the database, through account_trips().
  const runs = (!!trip.ownerId && trip.ownerId === userId) || (trip.clubAdminIds ?? []).includes(userId)
  return { ...m, owner: runs }
}

export interface EntryStore {
  /** The signed-in user a bearer token belongs to, or null. */
  userFromToken(token: string): Promise<string | null>
  tripByCode(code: string): Promise<EntryTrip | null>
  /** True only for a claimed player of this very event. */
  claimedPlayer(tripId: string, playerId: string): Promise<boolean>
  readMembership(userId: string, tripId: string): Promise<Membership | null>
  writeMembership(userId: string, tripId: string, m: Membership): Promise<void>
  readAttempts(keys: string[]): Promise<Map<string, AttemptWindow>>
  writeAttempt(key: string, tripId: string, w: AttemptWindow): Promise<void>
  /** A right PIN still stored the old way, re-stored salted and slow. */
  upgradePin(tripId: string, kind: AttemptKind, hash: string): Promise<void>
  /**
   * D134: a Green Dot member who claims a name is linked to that player —
   * only an account (checked by the store), only a player nobody else is
   * linked to, one per account per event. Never in the way of entering.
   */
  linkPlayer?(userId: string, tripId: string, playerId: string): Promise<void>
}

export interface EntryInput {
  token: string | null
  code: unknown
  playerId?: unknown
  adminPin?: unknown
  publicPin?: unknown
  /** The public PIN door's cookie for this event, if the request carried it. */
  entryCookie?: string | null
  /** The caller's network address; only ever stored hashed. */
  address: string
  /** Only say what this phone is in the event; enter nothing (D64). */
  peek?: unknown
  /** The padlock tapped shut: end this phone's PIN grant (D61). */
  close?: unknown
}

export type EntryOutcome =
  | { status: 200; body: { ok: true; tripId: string; role: Role | null; organiserUntil: string | null; readOnly: boolean; organiserBy: 'pin' | 'account' | null } }
  | { status: 400 | 401 | 403 | 404 | 429 | 503; body: { ok: false; error: string } }

const fail = (status: 400 | 401 | 403 | 404 | 429 | 503, error: string): EntryOutcome =>
  ({ status, body: { ok: false, error } })

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/**
 * The keys a PIN's two windows are counted under. Hashed with the event's id
 * so the address is never stored and two events' counts never meet.
 */
export async function attemptKeys(tripId: string, kind: AttemptKind | 'reset', address: string) {
  const scrambled = createHash('sha256').update(`${tripId}|${kind}|${address}`, 'utf8').digest('hex')
  return {
    address: `${tripId}:${kind}:a:${scrambled}`,
    event: `${tripId}:${kind}:e`,
  }
}

const LIMITS: [keyof typeof ATTEMPT_LIMITS, AttemptLimit][] =
  [['address', ATTEMPT_LIMITS.address], ['event', ATTEMPT_LIMITS.event]]

/** Where wrong PINs are counted (`entry_attempts`), and where a right one is re-stored. */
export type AttemptStore = Pick<EntryStore, 'readAttempts' | 'writeAttempt' | 'upgradePin'>

/**
 * One PIN against its hash, under the retry limit — the only copy, shared by
 * /api/entry and every other route that checks an event's PIN on the server
 * (the door, the PIN route, seeding, importing, standings). Blocked before
 * the PIN is looked at; a wrong one is counted in both windows; a right one
 * still stored the old way is re-stored salted and slow, and a failure to
 * re-store it costs nothing — the next right PIN tries again.
 */
export async function checkPin(
  store: AttemptStore,
  a: { tripId: string; code: string; kind: AttemptKind; address: string; pin: string; hash: string },
  now: Date,
): Promise<'ok' | 'wrong' | 'blocked'> {
  const keys = await attemptKeys(a.tripId, a.kind, a.address)
  const windows = await store.readAttempts([keys.address, keys.event])
  if (LIMITS.some(([scope, limit]) => attemptBlocked(windows.get(keys[scope]) ?? null, limit, now))) return 'blocked'
  const v = await verifyPin(a.pin, a.hash)
  if (v.ok) {
    if (v.stale) {
      try { await store.upgradePin(a.tripId, a.kind, await hashPin(a.pin, a.code)) } catch (e) { console.error('PIN re-store failed:', e) }
    }
    return 'ok'
  }
  for (const [scope, limit] of LIMITS) {
    await store.writeAttempt(keys[scope], a.tripId, afterFailure(windows.get(keys[scope]) ?? null, limit, now))
  }
  return 'wrong'
}

const TOO_MANY = 'Too many tries — wait a few minutes and try again.'

export async function runEntry(input: EntryInput, store: EntryStore, now: Date): Promise<EntryOutcome> {
  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : ''
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return fail(400, 'No event code.')
  if (!input.token) return fail(401, 'Not signed in.')

  const userId = await store.userFromToken(input.token)
  if (!userId) return fail(401, 'Not signed in.')

  const trip = await store.tripByCode(code)
  if (!trip) return fail(404, 'No event with that code.')
  const facts: EventFacts = factsOf(trip)

  // What this phone is, asked without entering — or the padlock shut.
  if (input.peek === true || input.close === true) {
    let m = await store.readMembership(userId, trip.id)
    if (m && input.close === true && m.organiserUntil) {
      m = closeOrganiser(m)
      await store.writeMembership(userId, trip.id, m)
    }
    return answer(trip.id, withOwner(m, trip, userId), facts, now)
  }

  const adminPin = str(input.adminPin)
  const publicPin = str(input.publicPin)

  // The admin PIN, under the retry limit. An event with none has nothing to
  // check: everybody in it is the organiser already (lib/membership.ts,
  // roleOf).
  let organiser = false
  if (adminPin && trip.adminHash) {
    const r = await checkPin(store, { tripId: trip.id, code, kind: 'admin', address: input.address, pin: adminPin, hash: trip.adminHash }, now)
    if (r === 'blocked') return fail(429, TOO_MANY)
    if (r === 'wrong') return fail(403, 'That isn’t the PIN.')
    organiser = true
  }

  // The public PIN: the admin PIN opens it too, and so does the cookie the
  // door already set — exactly the trip layout's own rule (`entryAllowed`).
  if (trip.publicHash) {
    let allowed = organiser || entryAllowed(trip.publicHash, input.entryCookie ?? null, code)
    if (!allowed && publicPin) {
      const r = await checkPin(store, { tripId: trip.id, code, kind: 'public', address: input.address, pin: publicPin, hash: trip.publicHash }, now)
      if (r === 'blocked') return fail(429, TOO_MANY)
      if (r === 'wrong') return fail(403, 'That PIN is not this event’s.')
      allowed = true
    }
    if (!allowed) return fail(403, 'This event needs its PIN.')
  }

  // The claimed player — kept only if it is this event's and claimed.
  // Anything else is ignored rather than refused: the phone still enters.
  const asked = str(input.playerId)
  const playerId = asked && isPlayerId(asked) && (await store.claimedPlayer(trip.id, asked.toLowerCase()))
    ? asked.toLowerCase()
    : null

  const existing = await store.readMembership(userId, trip.id)
  const next = mergeGrant(existing, { organiser, playerId }, now)
  await store.writeMembership(userId, trip.id, next)
  if (playerId && store.linkPlayer) {
    try { await store.linkPlayer(userId, trip.id, playerId) } catch (e) { console.error('player link failed:', e) }
  }
  return answer(trip.id, withOwner(next, trip, userId), facts, now)
}

/** What a phone is told: its role, and when the PIN's hours end — never anything about the PIN itself. */
function answer(tripId: string, m: Membership | null, facts: EventFacts, now: Date): EntryOutcome {
  return {
    status: 200,
    body: {
      ok: true,
      tripId,
      role: roleOf(m, facts, now),
      organiserUntil: m?.organiserUntil ?? null,
      readOnly: !mayWrite(m, facts, now),
      // How this phone is the organiser: its account owns the event, or the PIN.
      organiserBy: m?.owner ? 'account' : organiserByPin(m, now) ? 'pin' : null,
    },
  }
}
