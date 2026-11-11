// Forgot PIN (D67; Ross, 11 Nov 2026) — the server's half. The rules and
// words are lib/pinReset.ts; this file is the three asks, handed their store
// so `test:membership` runs every path against a stand-in. `resetStore.ts`
// is the service-role store; the routes under ./forgot and ./reset are
// plumbing.
//
// * **ask** — "Email me a link". Answers `sent` whether or not an email
//   went (over a limit, or a failed send, still `sent`), so it tells nobody
//   anything — except an event with no address at all, which says so and
//   names the support address. **The address is never in an answer.**
// * **check** — the reset page opening: is this link still good, and for
//   which event. Uses nothing up.
// * **save** — the new PIN. The link is spent first (once, by a
//   compare-and-set), then the PIN is stored salted and slow (D64), every
//   phone's organiser access for the event ends, and this phone is the
//   organiser for twelve hours.
//
// Only the token's hash is stored. The token itself is in the email alone.

import { createHash, randomBytes } from 'crypto'
import { SITE } from '@/config/site'
import { entryToken, hashPin, verifyPin } from '@/lib/pinHash'
import { mergeGrant, ATTEMPT_LIMITS, afterFailure, attemptBlocked, type AttemptWindow, type Membership } from '@/lib/membership'
import { passcodeError } from '@/lib/passcode'
import {
  RESET_EXPIRED, RESET_LINK_MINUTES, SAME_AS_PUBLIC,
  newPinIssue, resetHtml, resetSubject, resetText, resetWords,
} from '@/lib/pinReset'
import { isEvent } from '@/lib/eventHub'
import { isRunChallenge } from '@/lib/runChallenge'
import { tripBase } from '@/lib/tripPaths'
import { attemptKeys } from '../entry/entry'

export interface ResetTrip {
  id: string
  code: string
  name: string
  kind: string | null
  /** The event's address — read on the server, never handed on. */
  email: string | null
  publicHash: string | null
}

export interface ResetRow { tripId: string; expiresAt: string; usedAt: string | null }

export interface ResetStore {
  userFromToken(token: string): Promise<string | null>
  tripByCode(code: string): Promise<ResetTrip | null>
  tripById(id: string): Promise<ResetTrip | null>
  /** Links made for this event since `since`. */
  countResets(tripId: string, since: string): Promise<number>
  insertReset(row: { tokenHash: string; tripId: string; expiresAt: string }): Promise<void>
  findReset(tokenHash: string): Promise<ResetRow | null>
  /** Spend the link: true only for the one call that found it unused and unexpired. */
  claimReset(tokenHash: string, now: string): Promise<boolean>
  /** Give a spent link back — only when the save failed after spending it. */
  releaseReset(tokenHash: string): Promise<void>
  setAdminHash(tripId: string, hash: string): Promise<void>
  /** Organiser access ended on every phone in the event. */
  endOrganisers(tripId: string): Promise<void>
  readMembership(userId: string, tripId: string): Promise<Membership | null>
  writeMembership(userId: string, tripId: string, m: Membership): Promise<void>
  readAttempts(keys: string[]): Promise<Map<string, AttemptWindow>>
  writeAttempt(key: string, tripId: string, w: AttemptWindow): Promise<void>
  /** True once the email is handed to the sender. */
  sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean>
}

/** A save that threw, and the step it was on — the route logs it and says it. */
export class SaveStepError extends Error {
  constructor(public step: string, public cause: unknown) {
    super(`pin reset save failed at ${step}`)
  }
}

type Fail = { status: 400 | 401 | 404 | 410 | 503; body: { ok: false; error: string } }
const fail = (status: Fail['status'], error: string): Fail => ({ status, body: { ok: false, error } })

const codeOf = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '')

/** A trip, not an event or a run challenge: its words are passcode and trip. */
export function isPlainTrip(kind: unknown): boolean {
  return !isEvent(kind) && !isRunChallenge(kind)
}

/** Where a reset lands: the event's own home page, the phone unlocked as organiser. */
export function resetHome(code: string, kind: unknown): string {
  if (isRunChallenge(kind)) return `/run/${code}`
  return tripBase(code, kind)
}

export function newResetToken(): string {
  return randomBytes(32).toString('base64url')
}

export function resetTokenHash(token: string): string {
  return createHash('sha256').update(`gd-pin-reset|${token}`, 'utf8').digest('hex')
}

const tokenShaped = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(v)

// ─── Ask ───────────────────────────────────────────────────────

export type AskOutcome =
  | { status: 200; body: { ok: true; result: 'sent' } | { ok: true; result: 'none'; support: string } }
  | Fail

/**
 * "Email me a link". `origin` is where the link points — fixed by the route,
 * never taken from the request, so nobody can have a real link emailed
 * pointing at somewhere else.
 */
export async function runAskReset(
  input: { code: unknown; address: string; origin: string },
  store: ResetStore,
  now: Date,
): Promise<AskOutcome> {
  const code = codeOf(input.code)
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return fail(400, 'No event code.')
  const trip = await store.tripByCode(code)
  if (!trip) return fail(404, 'No event with that code.')
  if (!trip.email) return { status: 200, body: { ok: true, result: 'none', support: SITE.supportEmail } }

  const sent = { status: 200 as const, body: { ok: true as const, result: 'sent' as const } }

  // One network's asks for this event, counted like /api/entry's wrong PINs.
  const key = (await attemptKeys(trip.id, 'reset', input.address)).address
  const windows = await store.readAttempts([key])
  const w = windows.get(key) ?? null
  if (attemptBlocked(w, ATTEMPT_LIMITS.address, now)) return sent
  await store.writeAttempt(key, trip.id, afterFailure(w, ATTEMPT_LIMITS.address, now))

  // No cap per event (Ross, 11 Nov 2026: a third email silently never came):
  // the network window above is the only limit, and each link is its own.
  const token = newResetToken()
  await store.insertReset({
    tokenHash: resetTokenHash(token),
    tripId: trip.id,
    expiresAt: new Date(now.getTime() + RESET_LINK_MINUTES * 60 * 1000).toISOString(),
  })
  const email = { eventName: trip.name, code: trip.code, link: `${input.origin}/reset-pin/${token}`, isTrip: isPlainTrip(trip.kind) }
  try {
    if (!(await store.sendEmail(trip.email, resetSubject(email), resetHtml(email), resetText(email)))) {
      console.error('pin reset: email not sent for', trip.code)
    }
  } catch (e) {
    console.error('pin reset: email failed:', e)
  }
  return sent
}

// ─── Check ─────────────────────────────────────────────────────

export type CheckOutcome =
  | { status: 200; body: { ok: true; eventName: string; code: string; isTrip: boolean; hasPublicPin: boolean } }
  | Fail

function live(row: ResetRow | null, now: Date): row is ResetRow {
  return !!row && !row.usedAt && Date.parse(row.expiresAt) > now.getTime()
}

export async function runCheckReset(input: { resetToken: unknown }, store: ResetStore, now: Date): Promise<CheckOutcome> {
  if (!tokenShaped(input.resetToken)) return fail(410, RESET_EXPIRED)
  const row = await store.findReset(resetTokenHash(input.resetToken))
  if (!live(row, now)) return fail(410, RESET_EXPIRED)
  const trip = await store.tripById(row.tripId)
  if (!trip) return fail(410, RESET_EXPIRED)
  return {
    status: 200,
    body: { ok: true, eventName: trip.name, code: trip.code, isTrip: isPlainTrip(trip.kind), hasPublicPin: !!trip.publicHash },
  }
}

// ─── Save ──────────────────────────────────────────────────────

export type SaveOutcome =
  | { status: 200; body: { ok: true; code: string; organiserUntil: string | null; home: string }; cookie: string | null }
  | Fail

export async function runSaveReset(
  input: { token: string | null; resetToken: unknown; pin: unknown; again: unknown },
  store: ResetStore,
  now: Date,
): Promise<SaveOutcome> {
  if (!tokenShaped(input.resetToken)) return fail(410, RESET_EXPIRED)
  const tokenHash = resetTokenHash(input.resetToken)
  const row = await store.findReset(tokenHash)
  if (!live(row, now)) return fail(410, RESET_EXPIRED)

  if (!input.token) return fail(401, 'Could not sign this phone in — try again.')
  const userId = await store.userFromToken(input.token)
  if (!userId) return fail(401, 'Could not sign this phone in — try again.')

  const pin = typeof input.pin === 'string' ? input.pin : ''
  const again = typeof input.again === 'string' ? input.again : ''
  const issue = newPinIssue(pin, again) ?? passcodeError(pin)
  if (issue) return fail(400, issue)

  const trip = await store.tripById(row.tripId)
  if (!trip) return fail(410, RESET_EXPIRED)
  if (trip.publicHash && (await verifyPin(pin, trip.publicHash)).ok) {
    return fail(400, isPlainTrip(trip.kind) ? `Use a different ${resetWords(true).pin}.` : SAME_AS_PUBLIC)
  }

  // Spent before anything changes: of two taps racing, one saves.
  if (!(await store.claimReset(tokenHash, now.toISOString()))) return fail(410, RESET_EXPIRED)

  // Each step is named, so a failure says where (`SaveStepError`) — and a
  // failure after the link was spent gives it back, so one bad save never
  // costs the person their email.
  let at = 'hash'
  let next: Membership
  try {
    const hash = await hashPin(pin, trip.code)
    at = 'store-pin'; await store.setAdminHash(trip.id, hash)
    at = 'end-organisers'; await store.endOrganisers(trip.id)
    at = 'read-phone'; const held = await store.readMembership(userId, trip.id)
    at = 'write-phone'; next = mergeGrant(held, { organiser: true }, now)
    await store.writeMembership(userId, trip.id, next)
  } catch (e) {
    await store.releaseReset(tokenHash).catch(() => {})
    throw new SaveStepError(at, e)
  }
  return {
    status: 200,
    body: { ok: true, code: trip.code, organiserUntil: next.organiserUntil, home: resetHome(trip.code, trip.kind) },
    // The new organiser goes straight past the event's public PIN too, as the admin PIN always has.
    cookie: trip.publicHash ? entryToken(trip.publicHash, trip.code) : null,
  }
}
