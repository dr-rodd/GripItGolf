// A club match play's draw, on the event's own reader (lib/eventReader.ts)
// — kept apart from ./matchPlayStore.ts, whose club tables the event reader
// is never asked for (test:event-reader).

import { eventReader } from '@/lib/eventReader'
import { portalRounds, type PortalRound } from '@/lib/knockoutPortal'
import { readKnockout, type KnockoutView } from '@/app/golf/[root]/[tripCode]/knockout'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { buildRows } from '@/lib/boardRows'
import { fetchTripContext } from '@/lib/hubStanding'
import { parseTeamScoring } from '@/lib/teamScoring'

/**
 * A club match play's draw, read for the club area and the office (stage
 * 3): the platform's own knockout reader (`readKnockout`) on the event's
 * reader, sorted into rounds with their play-by dates (`portalRounds`).
 * Nobody's own match here — the server cannot see who is holding the phone;
 * the page asks for that after it paints.
 */
export async function readClubDraw(code: string): Promise<{ view: KnockoutView; rounds: PortalRound[] } | null> {
  const db = eventReader(code)
  const [{ data: trip }, { data: players }] = await Promise.all([
    db.from('trips').select('id, leaderboards, formats, team_scoring, bracket_setup').eq('trip_code', code).maybeSingle(),
    db.from('players').select('id, name').eq('is_composite', false),
  ])
  const t = trip as { id: string; leaderboards: unknown; formats: unknown; team_scoring: unknown; bracket_setup: unknown } | null
  if (!t) return null
  const view = await readKnockout(db, t, t.bracket_setup, null, (players ?? []) as { id: string; name: string }[])
  if (!view) return null
  return { view, rounds: portalRounds(view.matches, null, view.deadlines) }
}


/**
 * A qualifier's finishing order (stage 5, P8): the players on its one
 * board in the order the board itself puts them — `buildRows`, so its
 * countback breaks ties exactly as its Results show — each with their place
 * on the club's list and golf's place (two level share one — Golfer of the
 * Year shares the points). Only players with a card in the round; a No
 * return is taken out by the caller, which reads that table on the service
 * role.
 */
export async function readQualifierFinish(code: string): Promise<{ playerId: string; rowId: string | null; place: number }[] | null> {
  const db = eventReader(code)
  const { data: trip } = await db.from('trips').select('id, leaderboards, formats, team_scoring').eq('trip_code', code).maybeSingle()
  const t = trip as { id: string; leaderboards: unknown; formats: unknown; team_scoring: unknown } | null
  if (!t) return null
  const board = boardsForTrip(t).find(lb => lb.audience === 'individual' && lb.competition === 'league')
  if (!board) return null
  const [{ ctx }, { data: players }] = await Promise.all([
    fetchTripContext(db, t.id, parseTeamScoring(t.team_scoring)),
    db.from('players').select('id, club_member_id').eq('is_composite', false),
  ])
  if (!ctx) return null
  const rowOf = new Map(((players ?? []) as { id: string; club_member_id: string | null }[]).map(p => [p.id, p.club_member_id]))
  return buildRows(board, ctx).filter(r => r.playedRounds.length > 0).map((r, i) => ({ playerId: r.id, rowId: rowOf.get(r.id) ?? null, place: r.place ?? i + 1 }))
}
