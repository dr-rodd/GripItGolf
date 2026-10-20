import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { loadLeague, cookiePlayer, removeLink } from '../league'

/**
 * Unlink — the player's own button. Their link goes, and every Golf
 * Ireland card read in for them is deleted at once (decided October 2026);
 * their standing re-tells without them. Works whether Golf Ireland is
 * connected or not: leaving never waits on anybody.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown }
  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not unlink just now — try again later.' }, { status: 503 })
  }
  const league = await loadLeague(admin, body.tripCode)
  if (!league) return NextResponse.json({ ok: false, message: 'This league does not read Golf Ireland cards.' }, { status: 404 })
  const playerId = await cookiePlayer(admin, league.trip)
  if (!playerId) return NextResponse.json({ ok: false, message: 'Claim your name in the league first.' }, { status: 403 })

  try {
    await removeLink(admin, league.trip.id, playerId)
    return NextResponse.json({ ok: true, message: 'Unlinked. Your Golf Ireland cards have been deleted from this league.' })
  } catch (e) {
    console.error('golf-ireland unlink failed:', e)
    return NextResponse.json({ ok: false, message: 'Could not unlink — try again.' }, { status: 500 })
  }
}
