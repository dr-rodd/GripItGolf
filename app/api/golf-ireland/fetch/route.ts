import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { describeSync } from '@/lib/golfIrelandSync'
import { loadLeague, cookiePlayer } from '../league'
import { syncLeague } from '../sync'

/**
 * Reading a league's Golf Ireland cards now, rather than waiting for the
 * night — "Fetch my scores" on the join screen's link card (`scope:
 * 'mine'`, the player this phone claimed) and "Fetch everyone's scores" in
 * the organiser area (`scope: 'all'`, behind the organiser PIN — the same
 * soft gate as every organiser write, lib/passcode.ts).
 *
 * Reads only confirmed links, and writes only `golf_ireland_cards`. Until
 * Golf Ireland's documentation arrives the client refuses every call, so
 * today this always answers that Golf Ireland is not connected yet.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown; scope?: unknown }
  const scope = body.scope === 'all' ? 'all' : 'mine'

  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not read the rounds just now — try again later.' }, { status: 503 })
  }
  const league = await loadLeague(admin, body.tripCode)
  if (!league) return NextResponse.json({ ok: false, message: 'This league does not read Golf Ireland cards.' }, { status: 404 })

  let playerId: string | null = null
  if (scope === 'mine') {
    playerId = await cookiePlayer(admin, league.trip)
    if (!playerId) return NextResponse.json({ ok: false, message: 'Claim your name in the league first.' }, { status: 403 })
  }

  try {
    const result = await syncLeague(admin, league, playerId)
    return NextResponse.json({
      ok: result.state === 'done',
      notConnected: result.state === 'not_ready',
      message: describeSync(result, scope),
    }, { status: result.state === 'done' ? 200 : 503 })
  } catch (e) {
    console.error('golf-ireland fetch failed:', e)
    return NextResponse.json({ ok: false, message: 'Could not read the rounds — try again.' }, { status: 500 })
  }
}
