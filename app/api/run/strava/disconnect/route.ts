import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stravaConfig } from '@/lib/strava'
import { disconnectRunner } from '@/lib/stravaApi'
import { loadChallenge, cookieRunner } from '../../runner'

/**
 * Disconnect Strava — the runner's own button, on the Add tab or Settings.
 *
 * Their Strava runs leave this challenge's boards at once, the link goes,
 * and if that Strava account feeds nothing else here its tokens are deleted
 * and Strava is told to revoke too (lib/stravaApi.ts `disconnectRunner`).
 * Typed-in runs are theirs and stay.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown }
  const cfg = stravaConfig()
  if (!cfg) return NextResponse.json({ ok: false, message: 'Strava is not set up for this site yet.' }, { status: 503 })

  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not disconnect just now — try again later.' }, { status: 503 })
  }
  const loaded = await loadChallenge(admin, body.tripCode)
  if (!loaded) return NextResponse.json({ ok: false, message: 'That challenge could not be found.' }, { status: 404 })
  const playerId = await cookieRunner(admin, loaded.trip)
  if (!playerId) return NextResponse.json({ ok: false, message: 'Join the challenge first.' }, { status: 403 })

  try {
    await disconnectRunner(admin, cfg, playerId, loaded.trip.id)
  } catch (e) {
    console.error('strava disconnect failed:', e)
    return NextResponse.json({ ok: false, message: 'Could not disconnect Strava — try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
