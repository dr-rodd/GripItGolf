import { NextRequest, NextResponse } from 'next/server'
import { eventReader } from '@/lib/eventReader'
import { EVENT_CODE } from '@/lib/fieldSeed'
import { parseLeaderboards } from '@/lib/leaderboards'
import { fetchTripContext } from '@/lib/hubStanding'
import { fetchMemberships } from '@/lib/teamMembers'
import { entryAllowed } from '@/lib/pinHash'
import { entryCookie } from '@/lib/publicPin'
import { mainStandings } from '@/lib/shapeChange'
import { readSessionResults } from '@/app/golf/[root]/[tripCode]/session/sessionMatches'

/**
 * The standings before and after a format change that crosses between the
 * Primary and the Overall (Ross, 13 Nov 2026, D89) — what the organiser's
 * Formats page shows before it asks. Both from the event's own cards, through
 * the same `buildRows` and `overallRows` the leaderboard runs; nothing is
 * written. Read only what anybody with the code may read, and an event
 * behind a public PIN only by a phone through its door.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { code?: unknown; boards?: unknown }
  const code = String(body.code ?? '').toUpperCase().trim()
  if (!EVENT_CODE.test(code)) return NextResponse.json({ error: 'bad code' }, { status: 400 })
  const db = eventReader(code)

  const { data: trip } = await db
    .from('trips')
    .select('id, leaderboards')
    .eq('trip_code', code)
    .maybeSingle()
  if (!trip) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // The public PIN in its own read: before migration 060 there is none.
  const pub = await db.from('trips').select('public_passcode_hash').eq('id', trip.id).maybeSingle()
  const publicHash = !pub.error ? (pub.data as { public_passcode_hash?: string | null } | null)?.public_passcode_hash : null
  if (!entryAllowed(publicHash, req.cookies.get(entryCookie(code))?.value ?? null, code)) {
    return NextResponse.json({ error: 'locked' }, { status: 403 })
  }

  const before = parseLeaderboards(trip.leaderboards)
  const after = parseLeaderboards(body.boards)

  const [{ ctx }, playersRes, teamsRes, memberships] = await Promise.all([
    fetchTripContext(db, trip.id, null),
    db.from('players').select('id, name, handicap, gender').eq('trip_id', trip.id).eq('is_composite', false),
    db.from('teams').select('id, name').eq('trip_id', trip.id),
    fetchMemberships(trip.id, db),
  ])
  if (!ctx) return NextResponse.json({ before: { title: 'Leaderboard', rows: [] }, after: { title: 'Leaderboard', rows: [] } })

  const players = (playersRes.data ?? []) as { id: string; name: string; handicap: number | null; gender: string }[]
  const teams = (teamsRes.data ?? []) as { id: string; name: string }[]
  const matches = (boards: typeof before) => readSessionResults(db, trip, boards, players, { teams, memberships })
    .catch(e => { console.error('shape-preview session matches read failed:', e); return [] })
  const [mBefore, mAfter] = await Promise.all([matches(before), matches(after)])

  return NextResponse.json({
    before: mainStandings(before, { ...ctx, sessionMatches: mBefore }),
    after: mainStandings(after, { ...ctx, sessionMatches: mAfter }),
  })
}
