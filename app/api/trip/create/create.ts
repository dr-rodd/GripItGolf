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

import { mergeGrant, type Membership } from '@/lib/membership'

/**
 * Every column a create form puts on a new event. Anything else is refused
 * out loud, never dropped, so a form gaining a column fails in testing
 * rather than losing the answer. `test:rls` reads the four forms and holds
 * this list to them.
 */
export const CREATE_COLUMNS = [
  'name', 'slug', 'trip_code', 'status', 'start_date', 'end_date', 'description',
  'formats', 'leaderboards', 'kind', 'bracket_setup', 'event_permissions', 'run_setup',
  'track_stats', 'team_scoring',
  'settings_passcode_hash', 'public_passcode_hash', 'lead_email',
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
  | { status: 200; body: { data: { id: string }; error: null } }
  | { status: 400 | 401 | 409 | 503; body: { data: null; error: { message: string; code?: string } } }

const fail = (status: 400 | 401 | 409 | 503, message: string, code?: string): CreateOutcome =>
  ({ status, body: { data: null, error: { message, ...(code ? { code } : {}) } } })

export async function runCreate(
  input: { token: string | null; row: unknown },
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

  const made = await store.insertTrip(r)
  if ('error' in made) return fail(made.error.code === '23505' ? 409 : 503, made.error.message, made.error.code)

  // The phone that made it is in it from the first moment — the organiser
  // for twelve hours if it set the PIN (it knows it), and on an event with
  // no PIN every member is the organiser anyway (lib/membership.ts).
  try {
    await store.writeMembership(userId, made.id, mergeGrant(null, { organiser: typeof r.settings_passcode_hash === 'string' && r.settings_passcode_hash.length > 0 }, now))
  } catch {
    await store.deleteTrip(made.id).catch(() => undefined)
    return fail(503, 'Could not create the event — try again.')
  }
  return { status: 200, body: { data: { id: made.id }, error: null } }
}
