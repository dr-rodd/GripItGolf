import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { loadLeague, removeLink } from '../league'

/**
 * The organiser's answer to a link request: it is them (confirm — from now
 * on their cards are read), or it is not (refuse — the request is removed,
 * and with it any card, though none is read before a confirmation).
 *
 * Reached from the organiser area, behind the organiser PIN — the same soft
 * gate as every organiser write on the platform (lib/passcode.ts), not a
 * security boundary.
 */

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown; playerId?: unknown; decision?: unknown }
  const playerId = String(body.playerId ?? '')
  if (!UUID.test(playerId) || (body.decision !== 'confirm' && body.decision !== 'refuse')) {
    return NextResponse.json({ ok: false, message: 'That request could not be read.' }, { status: 400 })
  }
  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not save just now — try again later.' }, { status: 503 })
  }
  const league = await loadLeague(admin, body.tripCode)
  if (!league) return NextResponse.json({ ok: false, message: 'This league does not read Golf Ireland cards.' }, { status: 404 })

  try {
    if (body.decision === 'refuse') {
      await removeLink(admin, league.trip.id, playerId)
    } else {
      const { error } = await admin.from('golf_ireland_links')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('trip_id', league.trip.id).eq('player_id', playerId).is('confirmed_at', null)
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('golf-ireland confirm failed:', e)
    return NextResponse.json({ ok: false, message: 'Could not save — try again.' }, { status: 500 })
  }
}
