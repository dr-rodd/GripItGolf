import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { stravaConfig } from '@/lib/strava'
import { syncLink, purgeExpiredRuns, purgeDeadConnections } from '@/lib/stravaApi'
import { loadChallenge, cookieRunner } from '../../runner'
import { finaliseDueChallenges } from '../../finalise'

/**
 * Re-reading Strava, two ways.
 *
 * **POST — "Check for new runs"**, the runner's own button: syncs just
 * their connection in this challenge, for the moment a run has not arrived
 * by webhook yet.
 *
 * **GET — the nightly job**, run by Vercel's cron with CRON_SECRET, like
 * /api/cleanup. Four things, in this order, each the guarantee for a rule
 * of Strava's API Policy:
 *
 *   1. close every run challenge past its grace days — freeze its team
 *      standings, then end its Strava links and delete its Strava runs
 *      (app/api/run/finalise.ts). Runs whether or not Strava is set up:
 *      a typed-in-only challenge gets its frozen result too;
 *   2. delete every Strava run not confirmed within seven days (§6.2);
 *   3. forget every connection dead for 25 days (§7.4's thirty);
 *   4. re-read connections, oldest first — the safety net for a webhook
 *      event that never arrived, and the refresh that keeps every stored
 *      copy inside its seven days.
 * It takes every connection still standing — closing a challenge ends its
 * links, so none outlives its challenge — synced longest ago first, and
 * stops at `NIGHTLY_LIMIT` —
 * Strava allows an app 100 reads every 15 minutes, and a run of the job
 * must stay well inside that.
 *
 * It does **not** set up the webhook subscription. Vercel's cron calls the
 * deployment by its own vercel.app address, and a subscription made from
 * here would point Strava there; the callback does it instead, on the
 * address runners actually connect through — the one Strava's callback
 * domain allows.
 */

export const dynamic = 'force-dynamic'

/** Connections re-read per night — well inside Strava's 100 reads per 15 minutes. */
const NIGHTLY_LIMIT = 60

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown }
  const cfg = stravaConfig()
  if (!cfg) return NextResponse.json({ ok: false, message: 'Strava is not set up for this site yet.' }, { status: 503 })

  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not check Strava just now — try again later.' }, { status: 503 })
  }
  const loaded = await loadChallenge(admin, body.tripCode)
  if (!loaded) return NextResponse.json({ ok: false, message: 'That challenge could not be found.' }, { status: 404 })
  const playerId = await cookieRunner(admin, loaded.trip)
  if (!playerId) return NextResponse.json({ ok: false, message: 'Join the challenge first.' }, { status: 403 })

  const { data: link } = await admin.from('strava_links')
    .select('player_id, trip_id, athlete_id')
    .eq('player_id', playerId).eq('trip_id', loaded.trip.id).maybeSingle()
  if (!link) return NextResponse.json({ ok: false, message: 'Strava is not connected yet.' }, { status: 400 })

  const written = await syncLink(admin, cfg, { ...link, athlete_id: Number(link.athlete_id) })
  if (written === null) {
    return NextResponse.json({ ok: false, message: 'Could not reach Strava just now — try again in a minute.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, written })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, error: 'admin client unavailable' }, { status: 500 })
  }
  const cfg = stravaConfig()
  const now = new Date()

  const closed = await finaliseDueChallenges(admin, cfg, now)
  const expired = await purgeExpiredRuns(admin, now.getTime())
  if (!cfg) return NextResponse.json({ ok: true, closed, expired, skipped: 'strava not configured' })
  const forgotten = await purgeDeadConnections(admin, cfg, now.getTime())

  // Every live link — closing a challenge has already ended its links.
  const { data: links, error } = await admin.from('strava_links')
    .select('player_id, trip_id, athlete_id, last_synced_at')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(NIGHTLY_LIMIT)
  if (error) {
    console.error('strava nightly: could not list connections:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let synced = 0
  let failed = 0
  for (const l of links ?? []) {
    const written = await syncLink(admin, cfg, {
      player_id: l.player_id as string, trip_id: l.trip_id as string, athlete_id: Number(l.athlete_id),
    }).catch(() => null)
    if (written === null) failed++
    else synced++
  }
  return NextResponse.json({ ok: true, closed, expired, forgotten, synced, failed })
}
