// Remembering who someone is on this device.
//
// A player joins a trip without an account, so the only way to greet them by
// name next time is to leave something on their device. A cookie, not the IP
// address: a household shares one IP, a golf club's wifi shares one across
// everybody in the bar, and a phone's changes when it drops to mobile data.
// None of that identifies a person.
//
// A cookie rather than localStorage because the trip hub is server-rendered.
// The server can read a cookie while building the page, so "Welcome back,
// Ross" is in the first paint. localStorage is only readable in the browser,
// which would mean rendering the page as a stranger and then correcting it —
// a visible flicker on every visit.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ NOT A CREDENTIAL. This cookie grants nothing.                        │
// │                                                                     │
// │ It decides whose name is greeted and whose summary is shown, and    │
// │ every one of those facts is already visible to anyone holding the   │
// │ trip code. Forging it gains an attacker a different name in a       │
// │ greeting. It is deliberately readable by JavaScript, because the    │
// │ join flow sets it in the browser and there is nothing to protect.   │
// │                                                                     │
// │ If this ever starts gating something — editing scores, seeing an    │
// │ email — it stops being adequate and needs real auth behind it.      │
// └─────────────────────────────────────────────────────────────────────┘
//
// The pure parts are here so they can be tested; the browser-only parts are
// three lines at the bottom.

/** Six months. Long enough to span a season, short enough to lapse. */
export const COOKIE_DAYS = 180

const PREFIX = 'gg_player_'

/**
 * The cookie for one trip.
 *
 * Scoped per trip on purpose: somebody may be Ross on one trip and a guest on
 * another, and one cookie per trip means the two can never be confused. Trip
 * codes are six uppercase alphanumerics; anything else is stripped so a
 * malformed code can never produce a malformed cookie name.
 */
export function playerCookieName(tripCode: string): string {
  return PREFIX + String(tripCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Whether a stored value could be a player id.
 *
 * Player ids are UUIDs. Checking the shape means a stale, truncated or
 * hand-edited cookie is ignored on the spot rather than turned into a
 * database query that will find nothing anyway.
 */
export function isPlayerId(value: string | null | undefined): boolean {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

/** The value to hand back, or null if there is nothing usable there. */
export function readPlayerId(raw: string | null | undefined): string | null {
  const v = raw?.trim() ?? ''
  return isPlayerId(v) ? v.toLowerCase() : null
}

/**
 * The string to assign to document.cookie.
 *
 * `secure` only over https, because a secure cookie set over plain http is
 * silently discarded — which would make this work in production and fail
 * mysteriously on a local dev server.
 */
export function buildCookie(
  name: string,
  value: string,
  opts: { days: number; https: boolean },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${Math.max(0, Math.round(opts.days * 24 * 60 * 60))}`,
    'samesite=lax',
  ]
  if (opts.https) parts.push('secure')
  return parts.join('; ')
}

/** The string that clears it: same name, same path, no lifetime. */
export function clearCookie(name: string, opts: { https: boolean }): string {
  return buildCookie(name, '', { days: 0, https: opts.https })
}

// ─── Browser only ──────────────────────────────────────────────

const isHttps = () =>
  typeof location !== 'undefined' && location.protocol === 'https:'

/** Remember this player on this device, for this trip. */
export function rememberPlayer(tripCode: string, playerId: string): void {
  if (typeof document === 'undefined' || !isPlayerId(playerId)) return
  try {
    document.cookie = buildCookie(playerCookieName(tripCode), playerId, {
      days: COOKIE_DAYS,
      https: isHttps(),
    })
  } catch {
    // Cookies blocked. Nothing here is essential — the trip works either way.
  }
}

/** Forget them. Used by "Not you?", and harmless if there was nothing there. */
export function forgetPlayer(tripCode: string): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = clearCookie(playerCookieName(tripCode), { https: isHttps() })
  } catch {
    /* nothing to undo */
  }
}
