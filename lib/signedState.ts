// The `state` that carries a trip and a player through somebody else's
// sign-in page and back — the only copy.
//
// Strava and Golf Ireland both send the player away to approve access and
// back to a callback. The callback cannot trust the cookie for who they
// are: a phone's home-screen app has its own cookie jar, and the provider
// may hand the player back to the browser instead. So the trip and the
// player travel in `state`, signed with that provider's own client secret —
// a forged callback cannot link somebody's account to somebody else's name,
// and a state minted for one provider is refused by the other.
//
// Pure — node's crypto, nothing else.

import { createHmac, timingSafeEqual } from 'crypto'

export type ConnectState = { tripCode: string; playerId: string; expires: number }

const b64url = (s: string) => Buffer.from(s).toString('base64url')
const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64url')

/** Ten minutes to finish on the provider's screen. */
export const STATE_TTL_MS = 10 * 60 * 1000

export function signState(s: ConnectState, secret: string): string {
  const body = b64url(JSON.stringify({ t: s.tripCode, p: s.playerId, e: s.expires }))
  return `${body}.${sign(body, secret)}`
}

/** The state if it is ours, untouched and in time; null otherwise. */
export function verifyState(raw: string | null | undefined, secret: string, now: number): ConnectState | null {
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const want = Buffer.from(sign(body, secret))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString()) as { t?: unknown; p?: unknown; e?: unknown }
    if (typeof v.t !== 'string' || typeof v.p !== 'string' || typeof v.e !== 'number') return null
    if (v.e < now) return null
    return { tripCode: v.t, playerId: v.p, expires: v.e }
  } catch {
    return null
  }
}
