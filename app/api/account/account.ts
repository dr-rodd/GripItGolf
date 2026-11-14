// The server's half of an account (stage (a); lib/account.ts has the rules).
//
// Handed its store, so `test:account` runs every path against a stand-in
// (`store.ts` is the service-role store, `route.ts` the plumbing). Three
// asks, each with the phone's Supabase token as a Bearer header:
//
// * `ticket` — from a phone that is still anonymous, about to sign in to an
//   account that already exists. Signing in replaces the phone's session, so
//   the proof of who it was must be taken first: a sealed ticket naming the
//   anonymous user, good for fifteen minutes.
// * `merge` — from the account, once the code is in, with that ticket: this
//   phone's `trip_members` rows moved onto the account (`mergeMemberships`,
//   never lowering anything), then the old anonymous user deleted. Asked
//   twice, the second finds nothing left to move and says so.
// * `delete` — the account deleted. Its rows in `trip_members` go with it
//   (ON DELETE CASCADE); names and scores stay with their events.

import { sealJson, openJson } from '@/lib/signedState'
import { MERGE_TICKET_MS, isAccount, mergeMemberships, type AuthUser } from '@/lib/account'
import type { Membership } from '@/lib/membership'

export interface AccountStore {
  userFromToken(token: string): Promise<AuthUser | null>
  userById(id: string): Promise<AuthUser | null>
  /** Every event a user has entered, with its row. */
  membershipsOf(userId: string): Promise<{ tripId: string; m: Membership }[]>
  readMembership(userId: string, tripId: string): Promise<Membership | null>
  writeMembership(userId: string, tripId: string, m: Membership): Promise<void>
  deleteUser(userId: string): Promise<void>
  /** The key tickets are sealed with — server only. */
  ticketSecret(): string
}

export type AccountOutcome =
  | { status: 200; body: { ok: true; ticket?: string; moved?: number } }
  | { status: 400 | 401 | 403 | 409 | 503; body: { ok: false; error: string } }

const fail = (status: 400 | 401 | 403 | 409 | 503, error: string): AccountOutcome =>
  ({ status, body: { ok: false, error } })

interface Ticket { a: string; e: number }

/** The anonymous user a ticket names, if it is ours and in time. */
export function readTicket(raw: unknown, secret: string, now: number): string | null {
  if (typeof raw !== 'string') return null
  const v = openJson(raw, secret) as Partial<Ticket> | null
  if (!v || typeof v !== 'object' || typeof v.a !== 'string' || typeof v.e !== 'number') return null
  return v.e > now ? v.a : null
}

export async function runAccount(
  input: { token: string | null; action: unknown; ticket?: unknown },
  store: AccountStore,
  now: Date,
): Promise<AccountOutcome> {
  if (!input.token) return fail(401, 'Not signed in on this phone — try again.')
  const user = await store.userFromToken(input.token)
  if (!user) return fail(401, 'Not signed in on this phone — try again.')

  if (input.action === 'ticket') {
    // Only a phone may hand over its events: an account signing in to
    // another account is not something this does.
    if (!user.isAnonymous) return fail(409, 'This phone is already signed in.')
    const ticket: Ticket = { a: user.id, e: now.getTime() + MERGE_TICKET_MS }
    return { status: 200, body: { ok: true, ticket: sealJson(ticket, store.ticketSecret()) } }
  }

  if (input.action === 'merge') {
    if (!isAccount(user)) return fail(403, 'Sign in with your code first.')
    const phoneId = readTicket(input.ticket, store.ticketSecret(), now.getTime())
    if (!phoneId) return fail(400, 'That sign-in took too long — start again.')
    if (phoneId === user.id) return { status: 200, body: { ok: true, moved: 0 } }
    const phone = await store.userById(phoneId)
    // Gone already (a merge asked twice), or no longer a phone: nothing to
    // move, and never another account's events.
    if (!phone || !phone.isAnonymous) return { status: 200, body: { ok: true, moved: 0 } }
    const rows = await store.membershipsOf(phone.id)
    for (const { tripId, m } of rows) {
      const mine = await store.readMembership(user.id, tripId)
      await store.writeMembership(user.id, tripId, mergeMemberships(mine, m))
    }
    // Only once every row is across: deleting takes the phone's rows with it.
    await store.deleteUser(phone.id)
    return { status: 200, body: { ok: true, moved: rows.length } }
  }

  if (input.action === 'delete') {
    if (!isAccount(user)) return fail(403, 'This phone is not signed in to an account.')
    await store.deleteUser(user.id)
    return { status: 200, body: { ok: true } }
  }

  return fail(400, 'Nothing to do.')
}
