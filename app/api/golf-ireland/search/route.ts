import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { sealJson } from '@/lib/signedState'
import {
  golfIrelandConfig, parseMemberQuery, normaliseMember, memberMatches, packPick,
  clubIssue, MEMBER_PICK_TTL_MS, type GolfIrelandMember,
} from '@/lib/golfIreland'
import { golfIrelandClient, type ClubCredential } from '@/lib/golfIrelandClient'
import { loadLeague, cookiePlayer, loadClubs } from '../league'

/**
 * Finding yourself in your club's membership — the link card's search.
 *
 * Runs here, on each league club's own credential, never in the browser.
 * What goes back is only enough to recognise yourself: a name, the number
 * with all but three characters hidden, the club's name, and a sealed pick
 * (lib/golfIreland.ts `MemberPick`) — the member id itself never leaves.
 *
 * Until Golf Ireland's documentation arrives the client refuses every call,
 * so today this always answers that Golf Ireland is not connected yet.
 */

export const dynamic = 'force-dynamic'

const NOT_CONNECTED = 'Golf Ireland is not connected yet. Access has been asked for, and this search works once it is granted.'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { tripCode?: unknown; query?: unknown }

  let admin
  try { admin = createAdminClient() } catch {
    return NextResponse.json({ ok: false, message: 'Could not search just now — try again later.' }, { status: 503 })
  }
  const league = await loadLeague(admin, body.tripCode)
  if (!league) return NextResponse.json({ ok: false, message: 'This league does not read Golf Ireland cards.' }, { status: 404 })
  const playerId = await cookiePlayer(admin, league.trip)
  if (!playerId) return NextResponse.json({ ok: false, message: 'Claim your name in the league first.' }, { status: 403 })

  const query = parseMemberQuery(String(body.query ?? ''))
  if ('issue' in query) return NextResponse.json({ ok: false, message: query.issue }, { status: 400 })

  const cfg = golfIrelandConfig()
  if (!cfg) return NextResponse.json({ ok: false, notConnected: true, message: NOT_CONNECTED }, { status: 503 })

  try {
    const clubs = (await loadClubs(admin, league.rules.clubs)).filter(c => !clubIssue(c))
    if (clubs.length === 0) {
      return NextResponse.json({ ok: false, message: 'None of this league\'s clubs has given Green Dot access to its members.' }, { status: 409 })
    }
    const { data: creds, error } = await admin
      .from('golf_ireland_clubs')
      .select('club_id, access_token, refresh_token, expires_at')
      .in('club_id', clubs.map(c => c.clubId))
    if (error) throw error

    const client = golfIrelandClient(cfg)
    const search = query.kind === 'surname' ? { surname: query.surname } : { number: query.number }
    const found: GolfIrelandMember[] = []
    for (const c of creds ?? []) {
      if (!c.access_token) continue
      const cred: ClubCredential = {
        clubId: c.club_id,
        accessToken: c.access_token,
        refreshToken: c.refresh_token,
        expiresAt: c.expires_at ? Date.parse(c.expires_at) : null,
      }
      for (const raw of await client.searchMembers(cred, search)) {
        const m = normaliseMember(raw)
        if (m) found.push(m)
      }
    }

    const { matches, tooMany } = memberMatches(found, query, league.rules.clubs)
    if (tooMany) {
      return NextResponse.json({ ok: true, matches: [], message: 'Too many members share that name — search by your membership number instead.' })
    }
    const expires = Date.now() + MEMBER_PICK_TTL_MS
    const clubName = new Map(clubs.map(c => [c.clubId, c.name]))
    return NextResponse.json({
      ok: true,
      matches: matches.map(m => ({
        name: m.name,
        masked: m.masked,
        club: clubName.get(m.clubId) ?? '',
        // The name rides inside the seal so the link can store it without
        // asking Golf Ireland again; unpackPick ignores it.
        pick: sealJson({
          ...packPick({ tripCode: league.trip.trip_code, playerId, clubId: m.clubId, memberId: m.memberId, expires }),
          n: m.name,
        }, cfg.clientSecret),
      })),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'GolfIrelandNotReady') {
      return NextResponse.json({ ok: false, notConnected: true, message: NOT_CONNECTED }, { status: 503 })
    }
    console.error('golf-ireland search failed:', e)
    return NextResponse.json({ ok: false, message: 'Could not search the membership — try again.' }, { status: 500 })
  }
}
