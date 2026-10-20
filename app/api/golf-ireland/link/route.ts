import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { openJson } from '@/lib/signedState'
import { golfIrelandConfig, unpackPick, linkIssue } from '@/lib/golfIreland'
import { loadLeague, cookiePlayer, loadClubs, loadLinks } from '../league'

/**
 * "This is me" — asking to link a member the search showed this phone.
 *
 * The pick comes back sealed, so it can only be a member the search
 * actually answered, in this league, for this player, within ten minutes.
 * The consent tick travels with it and is stored with the link. What this
 * makes is a link *requested*: no card is read until the organiser confirms
 * it is them (lib/golfIreland.ts `linkReadable`).
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown; pick?: unknown; consent?: unknown }
  const cfg = golfIrelandConfig()
  if (!cfg) return NextResponse.json({ ok: false, message: 'Golf Ireland is not connected yet.' }, { status: 503 })

  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not link just now — try again later.' }, { status: 503 })
  }
  const league = await loadLeague(admin, body.tripCode)
  if (!league) return NextResponse.json({ ok: false, message: 'This league does not read Golf Ireland cards.' }, { status: 404 })
  const playerId = await cookiePlayer(admin, league.trip)
  if (!playerId) return NextResponse.json({ ok: false, message: 'Claim your name in the league first.' }, { status: 403 })

  const opened = openJson(typeof body.pick === 'string' ? body.pick : null, cfg.clientSecret)
  const pick = unpackPick(opened, Date.now())
  if (!pick || pick.tripCode !== league.trip.trip_code || pick.playerId !== playerId) {
    return NextResponse.json({ ok: false, message: 'That search has expired — search again.' }, { status: 400 })
  }
  const name = typeof (opened as { n?: unknown }).n === 'string' ? (opened as { n: string }).n : ''

  try {
    const [clubs, links] = await Promise.all([
      loadClubs(admin, [pick.clubId]),
      loadLinks(admin, league.trip.id),
    ])
    const issue = linkIssue({
      playerId, pick, rules: league.rules, club: clubs[0], links, consented: body.consent === true,
    })
    if (issue) return NextResponse.json({ ok: false, message: issue }, { status: 409 })

    const member = await admin.from('golf_ireland_members').upsert(
      { member_id: pick.memberId, club_id: pick.clubId, name, updated_at: new Date().toISOString() },
      { onConflict: 'member_id' },
    )
    if (member.error) throw member.error
    const link = await admin.from('golf_ireland_links').insert({
      player_id: playerId, trip_id: league.trip.id, member_id: pick.memberId,
      consented_at: new Date().toISOString(),
    })
    if (link.error) {
      // Somebody else's phone got there first — the UNIQUE says so.
      if (link.error.code === '23505') {
        return NextResponse.json({ ok: false, message: 'That member is already linked to somebody in this league.' }, { status: 409 })
      }
      throw link.error
    }
    return NextResponse.json({ ok: true, message: 'Asked. Once the organiser confirms it is you, your Golf Ireland cards are read in.' })
  } catch (e) {
    console.error('golf-ireland link failed:', e)
    return NextResponse.json({ ok: false, message: 'Could not link — try again.' }, { status: 500 })
  }
}
