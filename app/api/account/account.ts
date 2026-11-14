// The server's half of an account (stages (a) and (a2); lib/account.ts has
// the rules).
//
// Handed its store, so `test:account` runs every path against a stand-in
// (`store.ts` is the service-role store, `route.ts` the plumbing). Every ask
// carries the phone's Supabase token as a Bearer header:
//
// * `ticket` — from a phone that is still anonymous, about to sign in to an
//   account with a code. Signing in replaces the phone's session, so the
//   proof of who it was is taken first: a sealed ticket naming the anonymous
//   user, good for fifteen minutes.
// * `merge` — from the account, once the code is in, with that ticket: this
//   phone's `trip_members` rows moved onto the account (`mergeMemberships`,
//   never lowering anything), then the old anonymous user deleted. Asked
//   twice, the second finds nothing left to move.
// * `sign-in` — a username or an email, and a password (D132). A username
//   is turned into its email here, on the service role, and the password
//   checked here too — **the email behind a username never reaches a
//   browser**; only the session's tokens go back. The phone's own events are
//   moved onto the account exactly as `merge` moves them, proved by the
//   phone's token on this same request. Every failure gives one answer
//   (`SIGN_IN_FAILED`), and wrong tries are counted per address and per name.
// * `status` — the account's username and whether it has a password, so the
//   page knows what it still has to ask (D129).
// * `username-check` — taken or free, counted per address.
// * `set-username` — saved, or taken. A junior's profile never has one.
// * `delete` — the account deleted. Its rows in `trip_members` go with it
//   (ON DELETE CASCADE), and its username; names and scores stay with their
//   events.

import { createHash } from 'crypto'
import { sealJson, openJson } from '@/lib/signedState'
import {
  MERGE_TICKET_MS, SIGN_IN_FAILED, SIGN_IN_LIMITS, USERNAME_CHECK_LIMIT, credentialsRefused, isAccount,
  mergeMemberships, normaliseUsername, passwordIssue, signInRoute, usernameIssue, type AuthUser,
} from '@/lib/account'
import { afterFailure, attemptBlocked, type AttemptLimit, type AttemptWindow, type Membership } from '@/lib/membership'

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

  // Stage (a2) — usernames and passwords (migration 084).
  usernameOf(userId: string): Promise<string | null>
  userIdByUsername(username: string): Promise<string | null>
  /** Saved, or another account has it. */
  setUsername(userId: string, username: string): Promise<'ok' | 'taken'>
  hasPassword(userId: string): Promise<boolean>
  /** Supabase's own check of an email and password: the session's tokens, or null. */
  passwordSignIn(email: string, password: string): Promise<{ userId: string; accessToken: string; refreshToken: string } | null>
  readAttempts(keys: string[]): Promise<Map<string, AttemptWindow>>
  writeAttempt(key: string, w: AttemptWindow): Promise<void>
}

export type AccountBody = {
  ok: true
  ticket?: string
  moved?: number
  username?: string | null
  hasPassword?: boolean
  result?: 'free' | 'taken' | 'invalid'
  error?: string
  session?: { access_token: string; refresh_token: string }
}

export type AccountOutcome =
  | { status: 200; body: AccountBody }
  | { status: 400 | 401 | 403 | 409 | 429 | 503; body: { ok: false; error: string } }

const fail = (status: 400 | 401 | 403 | 409 | 429 | 503, error: string): AccountOutcome =>
  ({ status, body: { ok: false, error } })

const TOO_MANY = 'Too many tries — wait a few minutes and try again.'

interface Ticket { a: string; e: number }

/** The anonymous user a ticket names, if it is ours and in time. */
export function readTicket(raw: unknown, secret: string, now: number): string | null {
  if (typeof raw !== 'string') return null
  const v = openJson(raw, secret) as Partial<Ticket> | null
  if (!v || typeof v !== 'object' || typeof v.a !== 'string' || typeof v.e !== 'number') return null
  return v.e > now ? v.a : null
}

/** A count's key: the address or name only ever hashed. */
export function attemptKey(kind: 'signin-address' | 'signin-name' | 'check-address', value: string): string {
  return `${kind}:${createHash('sha256').update(`account|${kind}|${value}`, 'utf8').digest('hex')}`
}

/**
 * This phone's events onto the account, then the phone's old identity
 * deleted — only once every row is across, because deleting it takes its
 * rows with it. Never another account's events: only an anonymous user moves.
 */
async function movePhone(store: AccountStore, phoneId: string, accountId: string): Promise<number> {
  if (phoneId === accountId) return 0
  const phone = await store.userById(phoneId)
  if (!phone || !phone.isAnonymous) return 0
  const rows = await store.membershipsOf(phone.id)
  for (const { tripId, m } of rows) {
    const mine = await store.readMembership(accountId, tripId)
    await store.writeMembership(accountId, tripId, mergeMemberships(mine, m))
  }
  await store.deleteUser(phone.id)
  return rows.length
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export async function runAccount(
  input: {
    token: string | null
    action: unknown
    ticket?: unknown
    identifier?: unknown
    password?: unknown
    username?: unknown
    /** The caller's network address; only ever stored hashed. */
    address?: string
  },
  store: AccountStore,
  now: Date,
): Promise<AccountOutcome> {
  // Signing in is the one ask that may come from a phone with no sign-in of
  // its own: there is nobody to move, but nothing to refuse either.
  if (input.action === 'sign-in') return runSignIn(input, store, now)

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
    return { status: 200, body: { ok: true, moved: await movePhone(store, phoneId, user.id) } }
  }

  if (input.action === 'status') {
    if (!isAccount(user)) return fail(403, 'This phone is not signed in.')
    const [username, hasPassword] = await Promise.all([store.usernameOf(user.id), store.hasPassword(user.id)])
    return { status: 200, body: { ok: true, username, hasPassword } }
  }

  if (input.action === 'username-check') {
    const key = attemptKey('check-address', input.address ?? 'unknown')
    const windows = await store.readAttempts([key])
    if (attemptBlocked(windows.get(key) ?? null, USERNAME_CHECK_LIMIT, now)) return fail(429, TOO_MANY)
    // Every check counts, taken or free, so the names cannot be read off.
    await store.writeAttempt(key, afterFailure(windows.get(key) ?? null, USERNAME_CHECK_LIMIT, now))
    const issue = usernameIssue(str(input.username))
    if (issue) return { status: 200, body: { ok: true, result: 'invalid', error: issue } }
    const owner = await store.userIdByUsername(normaliseUsername(str(input.username)))
    return { status: 200, body: { ok: true, result: owner && owner !== user.id ? 'taken' : 'free' } }
  }

  if (input.action === 'set-username') {
    if (!isAccount(user)) return fail(403, 'This phone is not signed in.')
    if (credentialsRefused(user)) return fail(403, 'A junior profile has no username.')
    const issue = usernameIssue(str(input.username))
    if (issue) return fail(400, issue)
    const username = normaliseUsername(str(input.username))
    if ((await store.setUsername(user.id, username)) === 'taken') return fail(409, 'That username isn’t available.')
    return { status: 200, body: { ok: true, username } }
  }

  if (input.action === 'delete') {
    if (!isAccount(user)) return fail(403, 'This phone is not signed in to an account.')
    await store.deleteUser(user.id)
    return { status: 200, body: { ok: true } }
  }

  return fail(400, 'Nothing to do.')
}

const LIMITS: [string, AttemptLimit][] = [['address', SIGN_IN_LIMITS.address], ['name', SIGN_IN_LIMITS.name]]

async function runSignIn(
  input: { token: string | null; identifier?: unknown; password?: unknown; address?: string },
  store: AccountStore,
  now: Date,
): Promise<AccountOutcome> {
  const identifier = str(input.identifier).trim()
  const password = str(input.password)
  const route = signInRoute(identifier)
  const keys: Record<string, string> = {
    address: attemptKey('signin-address', input.address ?? 'unknown'),
    // Counted under what was typed — whether or not anybody has that name.
    name: attemptKey('signin-name', route.kind === 'email' ? route.email : route.username),
  }
  const windows = await store.readAttempts(Object.values(keys))
  if (LIMITS.some(([scope, limit]) => attemptBlocked(windows.get(keys[scope]) ?? null, limit, now))) return fail(429, TOO_MANY)

  const failed = async (): Promise<AccountOutcome> => {
    for (const [scope, limit] of LIMITS) {
      await store.writeAttempt(keys[scope], afterFailure(windows.get(keys[scope]) ?? null, limit, now))
    }
    return fail(401, SIGN_IN_FAILED)
  }

  if (!identifier || !password || passwordIssue(password)) return failed()

  // The email to check the password against — a username's, read here and
  // never sent anywhere.
  let email: string | null = null
  if (route.kind === 'email') email = route.email
  else if (!usernameIssue(route.username)) {
    const userId = await store.userIdByUsername(route.username)
    const owner = userId ? await store.userById(userId) : null
    email = owner && isAccount(owner) ? owner.email : null
  }
  if (!email) return failed()

  const signedIn = await store.passwordSignIn(email, password)
  if (!signedIn) return failed()
  const account = await store.userById(signedIn.userId)
  if (!account || !isAccount(account) || credentialsRefused(account)) return failed()

  // This phone's own events come with it, exactly as the code path's merge.
  let moved = 0
  if (input.token) {
    const phone = await store.userFromToken(input.token)
    if (phone?.isAnonymous) moved = await movePhone(store, phone.id, account.id)
  }
  const username = await store.usernameOf(account.id)
  return {
    status: 200,
    body: {
      ok: true,
      moved,
      username,
      session: { access_token: signedIn.accessToken, refresh_token: signedIn.refreshToken },
    },
  }
}
