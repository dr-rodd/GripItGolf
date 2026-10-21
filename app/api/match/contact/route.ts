import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { playerCookieName, readPlayerId } from '@/lib/playerCookie'
import { normaliseContact } from '@/lib/matchArrangements'

/**
 * A player saving their own contact details — the hub's "Your details"
 * on a match play event (docs/event-use-cases.md, story 2). Only ever the
 * player this phone claimed (the player cookie, checked against the
 * event's roster: the platform's soft identity, lib/currentPlayer.ts), and
 * only into `player_contacts`, which the browser cannot reach. Both fields
 * empty removes the row.
 */

export const dynamic = 'force-dynamic'

const TRIP_CODE = /^[A-Z0-9]{6}$/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    tripCode?: unknown; phone?: unknown; email?: unknown; visibility?: unknown
  }
  const tripCode = String(body.tripCode ?? '').toUpperCase().trim()
  if (!TRIP_CODE.test(tripCode)) {
    return NextResponse.json({ ok: false, message: 'That event could not be found.' }, { status: 400 })
  }
  const contact = normaliseContact(body)
  if ('issue' in contact) return NextResponse.json({ ok: false, message: contact.issue }, { status: 400 })

  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not save just now — try again later.' }, { status: 503 })
  }
  const { data: trip } = await admin.from('trips').select('id').eq('trip_code', tripCode).maybeSingle()
  if (!trip) return NextResponse.json({ ok: false, message: 'That event could not be found.' }, { status: 404 })

  const jar = await cookies()
  const playerId = readPlayerId(jar.get(playerCookieName(tripCode))?.value)
  const { data: player } = playerId
    ? await admin.from('players').select('id').eq('id', playerId).eq('trip_id', trip.id).maybeSingle()
    : { data: null }
  if (!player) return NextResponse.json({ ok: false, message: 'Claim your name in the event first.' }, { status: 403 })

  try {
    if (!contact.phone && !contact.email) {
      const { error } = await admin.from('player_contacts').delete()
        .eq('player_id', player.id).eq('trip_id', trip.id)
      if (error) throw error
    } else {
      const { error } = await admin.from('player_contacts').upsert({
        player_id: player.id, trip_id: trip.id,
        phone: contact.phone, email: contact.email, visibility: contact.visibility,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'player_id' })
      if (error) throw error
    }
    return NextResponse.json({ ok: true, message: 'Saved.' })
  } catch (e) {
    console.error('match contact save failed:', e)
    return NextResponse.json({ ok: false, message: 'Could not save — try again.' }, { status: 500 })
  }
}
