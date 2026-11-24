// A signed card for the stream's pop-out (D330, amended D334): exactly what
// the trip's own pop-up scorecard (`ScorecardSheet`) draws — the player, the
// round and its course, the course's holes, the player's scores and the
// handicap the card was scored off — read through its event's reader as
// every server page reads (lib/eventReader.ts), from the same context the
// boards are built on (`fetchTripContext`), so the card and the board agree.

import { eventReader } from '@/lib/eventReader'
import { fetchTripContext } from '@/lib/hubStanding'
import type { CardDetail } from './feed'
import type { Db } from './store'

export async function readCardDetail(db: Db, roundId: string, playerId: string): Promise<CardDetail | null> {
  const { data: round } = await db.from('rounds').select('trip_id').eq('id', roundId).maybeSingle()
  const tripId = (round as { trip_id?: string } | null)?.trip_id
  if (!tripId) return null
  const { data: trip } = await db.from('trips').select('trip_code').eq('id', tripId).maybeSingle()
  const code = (trip as { trip_code?: string } | null)?.trip_code
  if (!code) return null
  const { ctx, courseByRound, courseNames, error } = await fetchTripContext(eventReader(code), tripId, null, [roundId])
  if (error || !ctx) return null
  const player = ctx.players.find(p => p.id === playerId)
  const r = ctx.rounds.find(x => x.id === roundId)
  const courseId = courseByRound.get(roundId) ?? null
  if (!player || !r || !courseId) return null
  return {
    player: { id: player.id, name: player.name, handicap: player.handicap, gender: player.gender },
    round: { id: r.id, round_number: r.round_number, courses: { id: courseId, name: courseNames.get(courseId) ?? '' } },
    holes: ctx.holes.filter(h => h.course_id === courseId),
    resolved: ctx.resolved.filter(s => s.roundId === roundId && s.playerId === playerId),
    handicap: ctx.hcpFor.get(`${roundId}:${playerId}`) ?? null,
  }
}
