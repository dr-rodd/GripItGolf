// The writes to an event's own row that a browser may no longer make itself
// (row-level security stage 4; Ross, 11 Nov 2026) — and the public PIN's
// door, which needs the hash a browser may no longer see (D64).
//
// * the **door** — a public PIN (or the admin PIN) checked under the retry
//   limit, and this phone's cookie set by the server;
// * **setting, changing or taking off the public PIN** (D65) — asks for
//   the admin PIN when the event has one, stores it salted and slow;
// * **moving an ad hoc series' end date on** when the field adds a round
//   past it (`add_rounds`), only ever later;
// * **the tee sheet wizard's "Do players play in their teams?"**, written
//   onto its board, for whoever may open the sheet (`set_tee_sheets`).
//
// Handed their store, so `test:membership` runs every path against a
// stand-in; `store.ts` beside /api/entry is the service-role one, and the
// routes under ./door, ./pin, ./extend and ./play-together are plumbing.

import { passcodeError } from '@/lib/passcode'
import { entryToken, hashPin, verifyPin } from '@/lib/pinHash'
import { teeSheetAccess } from '@/lib/eventPermissions'
import { withPlayTogether } from '@/lib/partnerships'
import { mayChangeEvent, mayWrite, mergeGrant, type EventFacts, type Membership } from '@/lib/membership'
import { isEvent } from '@/lib/eventHub'
import { isRunChallenge } from '@/lib/runChallenge'
import { checkPin, type EntryStore, type EntryTrip } from '../entry/entry'

export interface ActionStore extends EntryStore {
  /** Raw columns of the event's row, read fresh. Null on a failed read. */
  tripColumns(tripId: string, columns: string[]): Promise<Record<string, unknown> | null>
  updateTrip(tripId: string, patch: Record<string, unknown>): Promise<void>
  /** The player marked as the trip's lead player (`players.is_lead`), or null. */
  leadPlayerId(tripId: string): Promise<string | null>
  /** Organiser access ended on every phone in the event (a new admin PIN, D67's rule). */
  endOrganisers(tripId: string): Promise<void>
}

type Fail = { status: 400 | 401 | 403 | 404 | 409 | 429 | 503; body: { ok: false; error: string } }
const fail = (status: Fail['status'], error: string): Fail => ({ status, body: { ok: false, error } })

const TOO_MANY = 'Too many tries — wait a few minutes and try again.'
const codeOf = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '')
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

interface Caller { trip: EntryTrip; userId: string; m: Membership | null; facts: EventFacts }

/** The signed-in phone and the event it names — or why not. */
async function caller(store: ActionStore, token: string | null, rawCode: unknown): Promise<Caller | Fail> {
  const code = codeOf(rawCode)
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return fail(400, 'No event code.')
  if (!token) return fail(401, 'Not signed in.')
  const userId = await store.userFromToken(token)
  if (!userId) return fail(401, 'Not signed in.')
  const trip = await store.tripByCode(code)
  if (!trip) return fail(404, 'No event with that code.')
  const m = await store.readMembership(userId, trip.id)
  return { trip, userId, m, facts: { adminPinSet: !!trip.adminHash, endDate: trip.endDate, openEnded: trip.openEnded } }
}
const failed = (c: Caller | Fail): c is Fail => 'status' in c

// ─── The door ──────────────────────────────────────────────────

export type DoorOutcome =
  | { status: 200; body: { ok: true; organiser: boolean }; cookie: string | null }
  | Fail

/**
 * The public PIN's door. Its own PIN lets a phone in; the admin PIN does
 * too, and says so (`organiser`), so the page can unlock the organiser's
 * side with the same code. Every wrong try is counted once, as the public
 * PIN's. Needs no sign-in: the door is how a phone gets as far as signing in.
 * `cookie` is what the server sets — never the hash.
 */
export async function runDoor(
  input: { code: unknown; pin: unknown; address: string },
  store: ActionStore,
  now: Date,
): Promise<DoorOutcome> {
  const code = codeOf(input.code)
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return fail(400, 'No event code.')
  const trip = await store.tripByCode(code)
  if (!trip) return fail(404, 'No event with that code.')
  if (!trip.publicHash) return { status: 200, body: { ok: true, organiser: false }, cookie: null }
  const pin = str(input.pin)
  if (!pin) return fail(403, 'That PIN is not this event’s.')

  const r = await checkPin(store, { tripId: trip.id, code, kind: 'public', address: input.address, pin, hash: trip.publicHash }, now)
  if (r === 'blocked') return fail(429, TOO_MANY)
  let organiser = false
  if (r === 'wrong') {
    // Already counted, as the door's. The admin PIN opens it too.
    const admin = trip.adminHash ? await verifyPin(pin, trip.adminHash) : { ok: false, stale: false }
    if (!admin.ok) return fail(403, 'That PIN is not this event’s.')
    organiser = true
  }
  return { status: 200, body: { ok: true, organiser }, cookie: entryToken(trip.publicHash, code) }
}

// ─── The public PIN, set, changed or taken off ─────────────────

export type PinOutcome =
  | { status: 200; body: { ok: true }; cookie: string | null }
  | Fail

/**
 * D65: a PIN is never written from a browser. Setting, changing or taking
 * off the public PIN asks for the admin PIN when the event has one (and the
 * phone must be able to change the event at all); a new one must not be the
 * admin PIN. Stored salted and slow. `cookie` lets the phone that changed
 * it straight back in.
 */
export async function runSetPublicPin(
  input: { token: string | null; code: unknown; adminPin: unknown; pin: unknown; address: string },
  store: ActionStore,
  now: Date,
): Promise<PinOutcome> {
  const c = await caller(store, input.token, input.code)
  if (failed(c)) return c
  const { trip } = c
  const adminPin = str(input.adminPin)
  if (trip.adminHash) {
    if (!adminPin) return fail(403, 'Enter the admin PIN to change the public PIN.')
    const r = await checkPin(store, { tripId: trip.id, code: trip.code, kind: 'admin', address: input.address, pin: adminPin, hash: trip.adminHash }, now)
    if (r === 'blocked') return fail(429, TOO_MANY)
    if (r === 'wrong') return fail(403, 'That isn’t the admin PIN.')
  } else if (!mayChangeEvent(c.m, c.facts, now)) {
    return fail(403, 'Only the event organiser can change the public PIN.')
  }

  const next = input.pin === null ? null : str(input.pin)
  if (next === null) {
    await store.updateTrip(trip.id, { public_passcode_hash: null })
    return { status: 200, body: { ok: true }, cookie: null }
  }
  const issue = passcodeError(next)
  if (issue) return fail(400, issue)
  if (trip.adminHash && (await verifyPin(next, trip.adminHash)).ok) return fail(400, 'Use a different PIN from the admin PIN.')
  const hash = await hashPin(next, trip.code)
  await store.updateTrip(trip.id, { public_passcode_hash: hash })
  return { status: 200, body: { ok: true }, cookie: entryToken(hash, trip.code) }
}

// ─── The admin PIN (a trip's passcode), set, changed or taken off ───

export type AdminPinOutcome =
  | { status: 200; body: { ok: true; organiserUntil: string | null } }
  | Fail

/**
 * The organiser's own PIN — on a trip, the Trip Setup passcode — set,
 * changed or taken off after creation (Ross, 11 Nov 2026: trips on the
 * events' model). D65: never written from a browser. With a PIN, the
 * current one is asked (under the retry limit); without one, any member who
 * may change the event — everybody, on a trip or event with no PIN — may set
 * one. Only a trip may take it off: an event always has an organiser. A new
 * PIN is stored salted and slow, ends organiser access on every other phone
 * (as a reset does) and makes this phone the organiser for twelve hours.
 */
export async function runSetAdminPin(
  input: { token: string | null; code: unknown; currentPin: unknown; pin: unknown; address: string },
  store: ActionStore,
  now: Date,
): Promise<AdminPinOutcome> {
  const c = await caller(store, input.token, input.code)
  if (failed(c)) return c
  const { trip } = c
  const cols = await store.tripColumns(trip.id, ['kind'])
  if (!cols) return fail(503, 'Could not read the event — try again.')
  const isTrip = !isEvent(cols.kind) && !isRunChallenge(cols.kind)
  const word = isTrip ? 'passcode' : 'organiser PIN'

  if (trip.adminHash) {
    const current = str(input.currentPin)
    if (!current) return fail(403, `Enter the current ${word}.`)
    const r = await checkPin(store, { tripId: trip.id, code: trip.code, kind: 'admin', address: input.address, pin: current, hash: trip.adminHash }, now)
    if (r === 'blocked') return fail(429, TOO_MANY)
    if (r === 'wrong') return fail(403, `That isn’t the current ${word}.`)
  } else if (!mayChangeEvent(c.m, c.facts, now)) {
    // No PIN yet, and this phone may not change the event: not entered, or
    // past the 30-day read-only cap (D59), which on a trip with no passcode
    // leaves nobody able to change it — or to set the passcode that would
    // let them. The phone holding the lead player's name may still set the
    // first one (Ross, 11 Nov 2026: a legacy trip, its lead player's phone).
    if (!c.m) return fail(403, `This phone hasn’t joined the ${isTrip ? 'trip' : 'event'} yet — open its home screen and try again.`)
    const lead = c.m.playerId ? await store.leadPlayerId(trip.id) : null
    if (!lead || lead !== c.m.playerId) {
      return fail(403, `This ${isTrip ? 'trip' : 'event'} finished more than 30 days ago, so only the phone holding the ${isTrip ? 'lead player’s' : 'organiser’s'} name can set the ${word} now.`)
    }
  }

  if (input.pin === null) {
    if (!isTrip) return fail(400, 'An event always has an organiser PIN — change it instead.')
    await store.updateTrip(trip.id, { settings_passcode_hash: null })
    return { status: 200, body: { ok: true, organiserUntil: null } }
  }
  const next = str(input.pin) ?? ''
  const issue = passcodeError(next)
  if (issue) return fail(400, issue)
  if (trip.publicHash && (await verifyPin(next, trip.publicHash)).ok) return fail(400, 'Use a different PIN from the public PIN.')

  await store.updateTrip(trip.id, { settings_passcode_hash: await hashPin(next, trip.code) })
  await store.endOrganisers(trip.id)
  const m = mergeGrant(await store.readMembership(c.userId, trip.id), { organiser: true }, now)
  await store.writeMembership(c.userId, trip.id, m)
  return { status: 200, body: { ok: true, organiserUntil: m.organiserUntil } }
}

// ─── An ad hoc series' end date, moved on ──────────────────────

/**
 * The field's Add round, past the event's end date: the end moves on to the
 * new round's date, and only ever later. The organiser may; so may anybody
 * who may write while the field may add rounds (`openEnded`, D59).
 */
export async function runExtend(
  input: { token: string | null; code: unknown; date: unknown },
  store: ActionStore,
  now: Date,
): Promise<{ status: 200; body: { ok: true; endDate: string } } | Fail> {
  const c = await caller(store, input.token, input.code)
  if (failed(c)) return c
  const allowed = mayChangeEvent(c.m, c.facts, now) || (c.facts.openEnded === true && mayWrite(c.m, c.facts, now))
  if (!allowed) return fail(403, 'Only the event organiser can add a round here.')
  const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null
  if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return fail(400, 'No date.')
  // Within three years: a round, not a typo.
  if (Date.parse(`${date}T00:00:00Z`) > now.getTime() + 3 * 366 * 86_400_000) return fail(400, 'That date is too far ahead.')
  const end = c.trip.endDate
  if (end && date <= end) return { status: 200, body: { ok: true, endDate: end } }
  await store.updateTrip(c.trip.id, { end_date: date })
  return { status: 200, body: { ok: true, endDate: date } }
}

// ─── "Do players play in their teams?" ─────────────────────────

/**
 * The tee sheet wizard's question, written onto the one board it was asked
 * of. The organiser's; anybody's who may write while anyone may open the
 * sheets (`set_tee_sheets`). Read fresh and changed in place, so nothing
 * else on the boards moves.
 */
export async function runPlayTogether(
  input: { token: string | null; code: unknown; boardId: unknown; together: unknown },
  store: ActionStore,
  now: Date,
): Promise<{ status: 200; body: { ok: true } } | Fail> {
  const c = await caller(store, input.token, input.code)
  if (failed(c)) return c
  const boardId = str(input.boardId)
  if (!boardId || typeof input.together !== 'boolean') return fail(400, 'No answer.')
  const cols = await store.tripColumns(c.trip.id, ['leaderboards', 'event_permissions'])
  if (!cols) return fail(503, 'Could not read the event — try again.')
  const allowed = mayChangeEvent(c.m, c.facts, now)
    || (teeSheetAccess(cols.event_permissions).anyoneOpens && mayWrite(c.m, c.facts, now))
  if (!allowed) return fail(403, 'Only the event organiser can answer that.')
  const boards = Array.isArray(cols.leaderboards) ? cols.leaderboards : []
  if (!boards.some(b => !!b && typeof b === 'object' && (b as { id?: unknown }).id === boardId)) return fail(404, 'No such leaderboard.')
  await store.updateTrip(c.trip.id, { leaderboards: withPlayTogether(boards, boardId, input.together) })
  return { status: 200, body: { ok: true } }
}
