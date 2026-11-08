// Who is holding this phone, on this trip.
//
// The cookie left by `lib/playerCookie.ts` names a player id; this turns that
// into a player, or into nothing. It lived inside the trip hub until every
// section of that hub started needing it, and the later phases personalise
// more screens than one.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ This PERSONALISES. It does not AUTHORISE.                            │
// │                                                                     │
// │ Everything it decides — whose name is greeted, whose totals are      │
// │ shown, whose row is highlighted — is already visible to anyone       │
// │ holding the trip code. Forging the cookie changes a greeting.        │
// │                                                                     │
// │ The moment a return value from here decides whether an action is     │
// │ ALLOWED — editing a score, seeing an email, changing settings —      │
// │ this is no longer adequate and needs real auth behind it.            │
// └─────────────────────────────────────────────────────────────────────┘
//
// Server only: `next/headers` reads the request being rendered.

import { cookies } from 'next/headers'
import { playerCookieName, readPlayerId } from './playerCookie'

/** The least a row needs for the roster match. */
export type Rostered = { id: string }

/**
 * The player that id names, on this trip's roster.
 *
 * The roster check is the safety, and it is why this takes a roster rather
 * than querying: a cookie left by a different trip, a player since removed,
 * or a hand-edited value all find nobody here and return null. Nobody is
 * greeted by a name that is not on the list in front of them.
 */
export function playerFromRoster<T extends Rostered>(
  id: string | null | undefined,
  roster: T[],
): T | null {
  if (!id) return null
  return roster.find(p => p.id === id) ?? null
}

/**
 * The id this device carries for this trip, or null.
 *
 * Shape-checked as a UUID before it is handed back, so a truncated or junk
 * cookie is dropped here rather than becoming a query that finds nothing.
 */
export async function linkedPlayerId(tripCode: string): Promise<string | null> {
  const jar = await cookies()
  return readPlayerId(jar.get(playerCookieName(tripCode))?.value)
}

/**
 * Who this device is on this trip — or null, which is an ordinary answer.
 *
 * A stranger is not an error state. Every caller renders the page it would
 * have rendered before any of this existed.
 */
export async function currentPlayer<T extends Rostered>(
  tripCode: string,
  roster: T[],
): Promise<T | null> {
  return playerFromRoster(await linkedPlayerId(tripCode), roster)
}
