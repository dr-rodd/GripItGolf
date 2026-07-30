import { createHmac, timingSafeEqual } from 'crypto'

/**
 * The shared-password lock on /admin/trips.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ SERVER ONLY. Nothing here may be imported by a client component.    │
 * │                                                                     │
 * │ The env var is deliberately NOT prefixed NEXT_PUBLIC_, so it does   │
 * │ not exist in the browser bundle. If this module is ever pulled into │
 * │ client code the password reads as undefined and every check fails   │
 * │ closed — which is the right way for that mistake to show up.        │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * This is a different kind of lock from lib/passcode.ts. That one is a soft
 * lock: it stops a player wandering into trip settings, and it is checked in
 * the browser because the data behind it is already public to that trip.
 *
 * This one is not. Behind it is every trip on the platform and the organisers'
 * email addresses — other people's personal data. So the check happens on the
 * server, the session cookie is signed so it cannot be forged, and the trip
 * query does not run at all until the cookie verifies.
 *
 * It is still a shared password, which means: no per-user accounts, no audit
 * trail, and no way to revoke one person's access without changing it for
 * everybody. That is a reasonable trade for a single-operator admin view. It
 * would not be for anything with more than one operator.
 */

export const ADMIN_COOKIE = 'gdg-admin'

/** How long a login lasts. Short enough that a borrowed phone stops working. */
export const SESSION_HOURS = 12

/** The configured password, or null when the feature is switched off. */
export function adminPassword(): string | null {
  const raw = process.env.ADMIN_PASSWORD
  return raw && raw.length > 0 ? raw : null
}

/**
 * Whether an admin password has been set at all.
 *
 * With none set the page refuses everyone rather than letting anyone in. An
 * unset variable is the state a misconfigured deploy is in, and "no password
 * means no lock" would turn that into an open door.
 */
export function isAdminConfigured(): boolean {
  return adminPassword() !== null
}

/** Compare without leaking, through timing, how much of a guess was right. */
export function passwordMatches(input: string, expected: string | null): boolean {
  if (expected === null) return false
  const a = Buffer.from(input, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Hash both first so the comparison is always over 32 bytes.
  const ha = createHmac('sha256', 'length-blind').update(a).digest()
  const hb = createHmac('sha256', 'length-blind').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * A session token: when it expires, and a signature over that.
 *
 * Signed with the password itself, so a token cannot be forged without it and
 * changing the password logs everyone out. A bare `admin=1` cookie would be
 * no lock at all — anyone could set it from the browser console.
 */
export function signSession(expiresAtMs: number, secret: string): string {
  const exp = String(Math.floor(expiresAtMs))
  const sig = createHmac('sha256', secret).update(exp).digest('base64url')
  return `${exp}.${sig}`
}

/** True when the token is intact, signed with this secret, and not expired. */
export function verifySession(
  token: string | null | undefined,
  secret: string | null,
  nowMs: number,
): boolean {
  if (!token || !secret) return false
  const dot = token.indexOf('.')
  if (dot < 1) return false

  const exp = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^\d+$/.test(exp) || sig.length === 0) return false

  // Check the signature before trusting the expiry it covers
  const expected = createHmac('sha256', secret).update(exp).digest('base64url')
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  if (!timingSafeEqual(a, b)) return false

  return Number(exp) > nowMs
}

/** A token good for the next SESSION_HOURS. */
export function newSession(nowMs: number, secret: string): string {
  return signSession(nowMs + SESSION_HOURS * 60 * 60 * 1000, secret)
}
