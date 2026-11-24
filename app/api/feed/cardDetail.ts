// A signed card's holes for the stream's sheet (D330), read through its
// event's reader as every server page reads (lib/eventReader.ts) — the
// stats' own reading (lib/holeStats.ts), so the sheet and the season agree.
// Net is the gross less the shots the card was scored off (lib/handicap.ts,
// the only copy); points are the ones stored beside the score.

import { eventReader } from '@/lib/eventReader'
import { fetchTripContext } from '@/lib/hubStanding'
import { holeStats } from '@/lib/holeStats'
import { shotsReceived } from '@/lib/handicap'
import type { CardDetail } from './feed'
import type { Db } from './store'

export async function readCardDetail(db: Db, roundId: string, playerId: string): Promise<CardDetail | null> {
  const { data: round } = await db.from('rounds').select('id, trip_id, courses(name)').eq('id', roundId).maybeSingle()
  const r = round as unknown as { id: string; trip_id: string; courses: { name: string } | { name: string }[] | null } | null
  if (!r) return null
  const { data: trip } = await db.from('trips').select('trip_code').eq('id', r.trip_id).maybeSingle()
  const code = (trip as { trip_code?: string } | null)?.trip_code
  if (!code) return null
  const reader = eventReader(code)
  const [{ ctx, error }, hcp] = await Promise.all([
    fetchTripContext(reader, r.trip_id, null, [roundId], true),
    reader.from('round_handicaps').select('playing_handicap, tees(name)').eq('round_id', roundId).eq('player_id', playerId).maybeSingle(),
  ])
  if (error || !ctx) return null
  const mine = holeStats({ players: ctx.players, holes: ctx.holes, resolved: ctx.resolved, hcpFor: ctx.hcpFor })
    .filter(h => h.playerId === playerId && h.roundId === roundId)
    .sort((a, b) => a.holeNumber - b.holeNumber)
  const course = Array.isArray(r.courses) ? r.courses[0]?.name ?? null : r.courses?.name ?? null
  const h = hcp.data as unknown as { playing_handicap: number | null; tees: { name: string } | { name: string }[] | null } | null
  const tees = h ? (Array.isArray(h.tees) ? h.tees[0]?.name ?? null : h.tees?.name ?? null) : null
  const handicap = mine.find(x => x.handicap != null)?.handicap ?? h?.playing_handicap ?? null
  return {
    course, tees, handicap: handicap == null ? null : Math.round(handicap),
    holes: mine.map(x => ({
      number: x.holeNumber, par: x.par, si: x.strokeIndex, gross: x.gross, points: x.points,
      net: x.handicap == null ? null : x.gross - shotsReceived(Math.round(x.handicap), x.strokeIndex),
    })),
  }
}
