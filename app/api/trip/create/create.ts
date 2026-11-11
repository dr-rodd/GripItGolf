// Making an event's row — the one write row-level security cannot leave to
// the browser (stage 3). Every other write on an event's tables is allowed
// to a phone that is a member of it; nobody is a member of an event that does
// not exist yet, so the creating phone could not insert the row, nor read it
// back for its id. This makes the row and the phone's membership together,
// on the service role, and the create forms carry on from there exactly as
// before — inserting the players, rounds and the rest as the member they now
// are.
//
// Handed its store, so `test:rls` runs it on a stand-in; ./route.ts is the
// service-role store.
//
// **The PINs arrive as PINs** (stage 4, D64): the form sends what was typed,
// beside the row, and they are stored here salted and slow — no hash is
// ever made on, or sent from, a phone. The row itself may not name either
// hash column.

import { mergeGrant, type Membership } from '@/lib/membership'
import { passcodeError } from '@/lib/passcode'
import { entryToken, hashPin } from '@/lib/pinHash'

/**
 * Every column a create form puts on a new event. Anything else is refused
 * out loud, never dropped, so a form gaining a column fails in testing
 * rather than losing the answer. `test:rls` reads the four forms and holds
 * this list to them.
 */
export const CREATE_COLUMNS = [
  'name', 'slug', 'trip_code', 'status', 'start_date', 'end_date', 'description',
  'formats', 'leaderboards', 'kind', 'bracket_setup', 'event_permissions', 'run_setup',
  'track_stats', 'team_scoring', 'lead_email',
] as const

export interface CreateStore {
  userFromToken(token: string): Promise<string | null>
  /** The new row's id, or the database's refusal (a code already taken is 23505). */
  insertTrip(row: Record<string, unknown>): Promise<{ id: string } | { error: { message: string; code?: string } }>
  writeMembership(userId: string, tripId: string, m: Membership): Promise<void>
  /** Takes back a row whose membership could not be written. */
  deleteTrip(tripId: string): Promise<void>
}

export type CreateOutcome =
  | { status: 200; body: { data: { id: string }; organiserUntil: string | null; error: null }; doorCookie: string | null }
  | { status: 400 | 401 | 409 | 503; body: { data: null; error: { message: string; code?: string } } }

const fail = (status: 400 | 401 | 409 | 503, message: string, code?: string): CreateOutcome =>
  ({ status, body: { data: null, error: { message, ...(code ? { code } : {}) } } })

export async function runCreate(
  input: { token: string | null; row: unknown; adminPin?: unknown; publicPin?: unknown },
  store: CreateStore,
  now: Date,
): Promise<CreateOutcome> {
  if (!input.token) return fail(401, 'Not signed in on this phone — try again.')
  const userId = await store.userFromToken(input.token)
  if (!userId) return fail(401, 'Not signed in on this phone — try again.')

  const row = input.row
  if (!row || typeof row !== 'object' || Array.isArray(row)) return fail(400, 'Nothing to create.')
  const extra = Object.keys(row).filter(k => !(CREATE_COLUMNS as readonly string[]).includes(k))
  if (extra.length > 0) return fail(400, `Not a column a new event may set: ${extra.join(', ')}.`)
  const r = row as Record<string, unknown>
  if (typeof r.name !== 'string' || !r.name.trim()) return fail(400, 'The event needs a name.')
  if (typeof r.trip_code !== 'string' || !/^[A-Z0-9]{6}$/.test(r.trip_code)) return fail(400, 'The event needs its six-character code.')

  const pinOf = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null)
  const adminPin = pinOf(input.adminPin)
  const publicPin = pinOf(input.publicPin)
  for (const pin of [adminPin, publicPin]) {
    const issue = pin ? passcodeError(pin) : null
    if (issue) return fail(400, issue)
  }
  if (adminPin && publicPin && adminPin === publicPin) return fail(400, 'Use a different PIN from the admin PIN.')
  const [adminHash, publicHash] = await Promise.all([
    adminPin ? hashPin(adminPin, r.trip_code) : null,
    publicPin ? hashPin(publicPin, r.trip_code) : null,
  ])

  const made = await store.insertTrip({
    ...r,
    ...(adminHash ? { settings_passcode_hash: adminHash } : {}),
    ...(publicHash ? { public_passcode_hash: publicHash } : {}),
  })
  if ('error' in made) return fail(made.error.code === '23505' ? 409 : 503, made.error.message, made.error.code)

  // The phone that made it is in it from the first moment — the organiser
  // for twelve hours if it set the PIN (it knows it), and on an event with
  // no PIN every member is the organiser anyway (lib/membership.ts).
  const membership = mergeGrant(null, { organiser: !!adminHash }, now)
  try {
    await store.writeMembership(userId, made.id, membership)
  } catch {
    await store.deleteTrip(made.id).catch(() => undefined)
    return fail(503, 'Could not create the event — try again.')
  }
  return {
    status: 200,
    body: { data: { id: made.id }, organiserUntil: membership.organiserUntil, error: null },
    // The maker goes straight through the public PIN's door.
    doorCookie: publicHash ? entryToken(publicHash, r.trip_code) : null,
  }
}
