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
// Stage 1: the row is recorded and nothing reads it. A refusal here blocks
// nothing in the app; the browser ignores it.

import { hashPasscode } from '@/lib/passcode'
import { entryAllowed } from '@/lib/publicPin'
import { isPlayerId } from '@/lib/playerCookie'
import {
  ATTEMPT_LIMITS, afterFailure, attemptBlocked, mayWrite, mergeGrant, roleOf,
  type AttemptKind, type AttemptLimit, type AttemptWindow, type Membership, type Role,
} from '@/lib/membership'

export interface EntryTrip {
  id: string
  endDate: string | null
  adminHash: string | null
  publicHash: string | null
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
}

export type EntryOutcome =
  | { status: 200; body: { ok: true; tripId: string; role: Role | null; organiserUntil: string | null; readOnly: boolean } }
  | { status: 400 | 401 | 403 | 404 | 429 | 503; body: { ok: false; error: string } }

const fail = (status: 400 | 401 | 403 | 404 | 429 | 503, error: string): EntryOutcome =>
  ({ status, body: { ok: false, error } })

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/**
 * The keys a PIN's two windows are counted under. Hashed with the event's id
 * so the address is never stored and two events' counts never meet. (The
 * same plain SHA-256 the PIN itself is hashed with — one copy of hashing.)
 */
export async function attemptKeys(tripId: string, kind: AttemptKind, address: string) {
  return {
    address: `${tripId}:${kind}:a:${await hashPasscode(`${tripId}|${kind}|${address}`)}`,
    event: `${tripId}:${kind}:e`,
  }
}

const LIMITS: [keyof typeof ATTEMPT_LIMITS, AttemptLimit][] =
  [['address', ATTEMPT_LIMITS.address], ['event', ATTEMPT_LIMITS.event]]

export async function runEntry(input: EntryInput, store: EntryStore, now: Date): Promise<EntryOutcome> {
  const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : ''
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return fail(400, 'No event code.')
  if (!input.token) return fail(401, 'Not signed in.')

  const userId = await store.userFromToken(input.token)
  if (!userId) return fail(401, 'Not signed in.')

  const trip = await store.tripByCode(code)
  if (!trip) return fail(404, 'No event with that code.')

  const adminPin = str(input.adminPin)
  const publicPin = str(input.publicPin)

  // The retry limit, before any PIN is looked at.
  const tried: AttemptKind[] = [...(adminPin ? ['admin' as const] : []), ...(publicPin ? ['public' as const] : [])]
  const keys = new Map<AttemptKind, { address: string; event: string }>()
  for (const kind of tried) keys.set(kind, await attemptKeys(trip.id, kind, input.address))
  const windows = tried.length
    ? await store.readAttempts([...keys.values()].flatMap(k => [k.address, k.event]))
    : new Map<string, AttemptWindow>()
  for (const kind of tried) {
    const k = keys.get(kind)!
    if (LIMITS.some(([scope, limit]) => attemptBlocked(windows.get(k[scope]) ?? null, limit, now))) {
      return fail(429, 'Too many tries — wait a few minutes and try again.')
    }
  }
  async function countFailure(kind: AttemptKind) {
    const k = keys.get(kind)!
    for (const [scope, limit] of LIMITS) {
      await store.writeAttempt(k[scope], trip!.id, afterFailure(windows.get(k[scope]) ?? null, limit, now))
    }
  }

  // The admin PIN. An event with none has nothing to check: everybody in it
  // is the organiser already (lib/membership.ts, roleOf).
  let organiser = false
  if (adminPin && trip.adminHash) {
    if ((await hashPasscode(adminPin)) !== trip.adminHash) {
      await countFailure('admin')
      return fail(403, 'That isn’t the PIN.')
    }
    organiser = true
  }

  // The public PIN: the admin PIN opens it too, and so does the cookie the
  // door already set — exactly the trip layout's own rule (`entryAllowed`).
  if (trip.publicHash) {
    let allowed = organiser || entryAllowed(trip.publicHash, input.entryCookie ?? null)
    if (!allowed && publicPin) {
      if ((await hashPasscode(publicPin)) === trip.publicHash) allowed = true
      else {
        await countFailure('public')
        return fail(403, 'That PIN is not this event’s.')
      }
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

  const facts = { adminPinSet: !!trip.adminHash, endDate: trip.endDate }
  return {
    status: 200,
    body: {
      ok: true,
      tripId: trip.id,
      role: roleOf(next, facts, now),
      organiserUntil: next.organiserUntil,
      readOnly: !mayWrite(next, facts, now),
    },
  }
}
