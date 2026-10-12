import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { playerCookieName, readPlayerId } from '@/lib/playerCookie'
import {
  type RunSetup, type RunPermissions,
  isRunChallenge, parseRunSetup, parseRunPermissions,
} from '@/lib/runChallenge'

/**
 * The two questions every run route asks first — which challenge, and which
 * runner — answered once, for the runs route and the Strava routes alike.
 *
 * The runner is **the one this phone joined as**: the player cookie,
 * matched against the challenge's own roster on the service role. The same
 * soft identity the whole platform runs on (lib/currentPlayer.ts) — it
 * keeps a phone acting as itself, and is not a security boundary.
 */

export const TRIP_CODE = /^[A-Z0-9]{6}$/

export type RunTrip = {
  id: string
  trip_code: string
  start_date: string | null
  end_date: string | null
}

export type LoadedChallenge = { trip: RunTrip; setup: RunSetup; perms: RunPermissions }

/** The run challenge with this code, or null for a bad code, golf, or nothing. */
export async function loadChallenge(admin: SupabaseClient, tripCodeRaw: unknown): Promise<LoadedChallenge | null> {
  const tripCode = String(tripCodeRaw ?? '').toUpperCase().trim()
  if (!TRIP_CODE.test(tripCode)) return null
  const [tripRes, extrasRes] = await Promise.all([
    admin.from('trips').select('id, trip_code, start_date, end_date').eq('trip_code', tripCode).single(),
    admin.from('trips').select('kind, run_setup, event_permissions').eq('trip_code', tripCode).single(),
  ])
  const trip = tripRes.data as RunTrip | null
  const extras = extrasRes.data as { kind?: unknown; run_setup?: unknown; event_permissions?: unknown } | null
  if (!trip || !extras || !isRunChallenge(extras.kind)) return null
  return { trip, setup: parseRunSetup(extras.run_setup), perms: parseRunPermissions(extras.event_permissions) }
}

/** Is this player on this challenge's roster? */
export async function onRoster(admin: SupabaseClient, tripId: string, playerId: string): Promise<boolean> {
  const { data } = await admin.from('players').select('id').eq('id', playerId).eq('trip_id', tripId).maybeSingle()
  return !!data
}

/** The runner this phone joined this challenge as, or null. */
export async function cookieRunner(admin: SupabaseClient, trip: RunTrip): Promise<string | null> {
  const jar = await cookies()
  const playerId = readPlayerId(jar.get(playerCookieName(trip.trip_code))?.value)
  if (!playerId) return null
  return (await onRoster(admin, trip.id, playerId)) ? playerId : null
}

/**
 * This deployment's own address, as the request saw it — the same rule the
 * confirmation email follows, so a preview deploy builds preview links.
 */
export function originOf(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('host')
  return host ? `${proto}://${host}` : 'https://greendot.live'
}
