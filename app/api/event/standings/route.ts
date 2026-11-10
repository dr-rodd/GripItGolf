import { NextRequest, NextResponse } from 'next/server'
import { eventReader } from '@/lib/eventReader'
import { hashPasscode } from '@/lib/passcode'
import { EVENT_CODE } from '@/lib/fieldSeed'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { boardTitle } from '@/lib/leaderboards'
import { parseTeamScoring } from '@/lib/teamScoring'
import { buildRows } from '@/lib/boardRows'
import { fetchTripContext } from '@/lib/hubStanding'

/**
 * Another event's leaderboards as finishing orders — for a match play
 * event's draw, seeded from the event its field came from (Ross, 4 Nov
 * 2026: "the user can decide to use seeds from the leaderboard, and pick
 * which leaderboard if there are several").
 *
 * Each individual table — Stableford, strokes, quota; never a bracket, and
 * never a team board, whose rows are not players — as its player ids in the
 * order the board itself puts them, from the same `buildRows` the
 * leaderboard runs, so the seeds cannot disagree with what the field sees.
 * A board nobody has a score on is left out.
 *
 * Nothing here is closed to the browser — anybody with the code reads these
 * boards — but an event behind a public PIN asks for it, as its door does.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { code?: unknown; pin?: unknown }
  const code = String(body.code ?? '').toUpperCase().trim()
  if (!EVENT_CODE.test(code)) return NextResponse.json({ boards: [] }, { status: 400 })
  const db = eventReader(code)

  const { data: trip } = await db
    .from('trips')
    .select('id, leaderboards, formats, team_scoring')
    .eq('trip_code', code)
    .maybeSingle()
  if (!trip) return NextResponse.json({ boards: [] }, { status: 404 })

  // The public PIN in its own read: before migration 060 there is none.
  const pub = await db.from('trips').select('public_passcode_hash').eq('id', trip.id).maybeSingle()
  const publicHash = !pub.error ? (pub.data as { public_passcode_hash?: string | null } | null)?.public_passcode_hash : null
  if (publicHash && (await hashPasscode(String(body.pin ?? ''))) !== publicHash) {
    return NextResponse.json({ boards: [] }, { status: 403 })
  }

  const tables = boardsForTrip(trip).filter(lb => lb.audience === 'individual' && lb.competition === 'league')
  if (tables.length === 0) return NextResponse.json({ boards: [] })

  const { ctx } = await fetchTripContext(db, trip.id, parseTeamScoring(trip.team_scoring))
  if (!ctx) return NextResponse.json({ boards: [] })

  const boards = tables
    .map(lb => ({ id: lb.id, title: boardTitle(lb), order: buildRows(lb, ctx).map(r => r.id) }))
    .filter(b => b.order.length > 0)
  return NextResponse.json({ boards })
}
