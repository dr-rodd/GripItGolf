import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stravaConfig } from '@/lib/strava'
import { disconnectRunner } from '@/lib/stravaApi'
import { loadChallenge, cookieRunner } from '../../runner'

/**
 * "Leave this challenge and delete my data" — the runner's own button, in
 * Settings.
 *
 * Strava's API Policy (§2.5) asks that a runner can have *all* their data
 * deleted, not only Strava's, and be told in writing when it is done. So:
 * their Strava connection first (their Strava runs, the link, and the
 * tokens if nothing else uses them — `disconnectRunner`), then their player
 * row, which takes everything else with it: typed-in runs, their place on a
 * team (ON DELETE CASCADE, migrations 023, 053, 054). The answer is the
 * written confirmation the screen shows.
 *
 * The same soft identity as every run route: the runner this phone joined
 * as. It deletes only that runner, in only this challenge.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown }
  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not delete just now — try again later.' }, { status: 503 })
  }
  const loaded = await loadChallenge(admin, body.tripCode)
  if (!loaded) return NextResponse.json({ ok: false, message: 'That challenge could not be found.' }, { status: 404 })
  const playerId = await cookieRunner(admin, loaded.trip)
  if (!playerId) return NextResponse.json({ ok: false, message: 'This phone has not joined the challenge.' }, { status: 403 })

  let tokensKept = false
  try {
    const cfg = stravaConfig()
    if (cfg) ({ tokensKept } = await disconnectRunner(admin, cfg, playerId, loaded.trip.id))
    const { error } = await admin.from('players').delete().eq('id', playerId).eq('trip_id', loaded.trip.id)
    if (error) throw error
  } catch (e) {
    console.error('run: delete-my-data failed:', e)
    return NextResponse.json({ ok: false, message: 'Could not delete your data — try again, or write to us.' }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    message: 'Done — your name, your team place, your runs and any Strava connection have been permanently deleted from this challenge.'
      + (tokensKept
        ? ' Your Strava account still feeds another Green Dot challenge; disconnect it there too to remove it completely.'
        : ''),
  })
}
