// Signed values that travel through a browser and come back — the only
// copy. Chiefly the `state` that carries a trip and a player through
// Strava's sign-in page and back.
//
// Strava sends the runner away to approve access and back to a callback.
// The callback cannot trust the cookie for who they are: a phone's
// home-screen app has its own cookie jar, and Strava may hand the runner
// back to the browser instead. So the trip and the
// player travel in `state`, signed with that provider's own client secret —
// a forged callback cannot link somebody's account to somebody else's name.
// The seal underneath (`sealJson`) is general, and Golf Ireland's member
// pick uses it with its own secret.
//
// Pure — node's crypto, nothing else.

import { createHmac, timingSafeEqual } from 'crypto'

export type ConnectState = { tripCode: string; playerId: string; expires: number }

const b64url = (s: string) => Buffer.from(s).toString('base64url')
const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64url')

/** Ten minutes to finish on the provider's screen. */
export const STATE_TTL_MS = 10 * 60 * 1000

/**
 * Any small JSON value, signed: `body.signature`, both base64url. The
 * value is readable by whoever holds it — signing proves it is ours and
 * untouched, it does not hide it. Golf Ireland's member pick rides on this
 * too (`lib/golfIreland.ts`, `MemberPick`).
 */
export function sealJson(value: unknown, secret: string): string {
  const body = b64url(JSON.stringify(value))
  return `${body}.${sign(body, secret)}`
}

/** The value if the seal is ours and untouched; null otherwise. Expiry is the caller's. */
export function openJson(raw: string | null | undefined, secret: string): unknown {
  if (!raw) return null
  const [body, sig, extra] = raw.split('.')
  if (!body || !sig || extra !== undefined) return null
  const want = Buffer.from(sign(body, secret))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }
}

export function signState(s: ConnectState, secret: string): string {
  return sealJson({ t: s.tripCode, p: s.playerId, e: s.expires }, secret)
}

/** The state if it is ours, untouched and in time; null otherwise. */
export function verifyState(raw: string | null | undefined, secret: string, now: number): ConnectState | null {
  const v = openJson(raw, secret) as { t?: unknown; p?: unknown; e?: unknown } | null
  if (!v || typeof v !== 'object') return null
  if (typeof v.t !== 'string' || typeof v.p !== 'string' || typeof v.e !== 'number') return null
  if (v.e < now) return null
  return { tripCode: v.t, playerId: v.p, expires: v.e }
}
