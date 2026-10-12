import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stravaConfig, authorizeUrl, signState, STATE_TTL_MS } from '@/lib/strava'
import { loadChallenge, cookieRunner, originOf, TRIP_CODE } from '../../runner'

/**
 * The Connect with Strava button lands here, and leaves for Strava.
 *
 * Three things must be true first: Strava is set up (the three keys in
 * Vercel), the runner ticked the consent box (`consent=1`), and this phone
 * has joined the challenge. Then a signed `state` carrying the challenge
 * and the runner goes to Strava's authorise page with us, and comes back to
 * the callback — which trusts the state, not the cookie, because Strava may
 * hand the runner back to a different browser than the one they left from.
 *
 * Every refusal goes back to the Add tab with a word for what happened,
 * which the page turns into a sentence (lib/strava.ts `outcomeMessage`).
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = originOf(req)
  const code = (req.nextUrl.searchParams.get('code') ?? '').toUpperCase()
  const back = (outcome: string) =>
    NextResponse.redirect(TRIP_CODE.test(code) ? `${origin}/run/${code}/add?strava=${outcome}` : `${origin}/`)

  const cfg = stravaConfig()
  if (!cfg) return back('unavailable')
  if (req.nextUrl.searchParams.get('consent') !== '1') return back('error')

  let admin
  try { admin = createAdminClient() } catch { return back('unavailable') }

  const loaded = await loadChallenge(admin, code)
  if (!loaded) return NextResponse.redirect(`${origin}/`)
  const playerId = await cookieRunner(admin, loaded.trip)
  if (!playerId) return NextResponse.redirect(`${origin}/run/${loaded.trip.trip_code}/join`)

  const state = signState(
    { tripCode: loaded.trip.trip_code, playerId, expires: Date.now() + STATE_TTL_MS },
    cfg.clientSecret,
  )
  return NextResponse.redirect(authorizeUrl(cfg, `${origin}/api/run/strava/callback`, state))
}
