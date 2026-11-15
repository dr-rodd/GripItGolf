// A round's own rows for its card summaries, read through its event's
// reader — every query fixed to that one event, as every server page reads
// (lib/eventReader.ts). Its own file, so the summary store's other reads,
// on the admin client, are never mixed into an event reader's.

import { eventReader } from '@/lib/eventReader'
import { fetchTripContext } from '@/lib/hubStanding'
import { holeStats } from '@/lib/holeStats'
import type { RoundRead } from './summaries'

export async function readRoundForSummary(tripCode: string, roundId: string): Promise<RoundRead | null> {
  const reader = eventReader(tripCode)
  const { data: trip } = await reader.from('trips').select('id').eq('trip_code', tripCode).maybeSingle()
  const tripId = (trip as { id?: string } | null)?.id
  if (!tripId) return null
  const { data: round } = await reader.from('rounds').select('id, course_id, scheduled_date').eq('id', roundId).maybeSingle()
  const r = round as { id: string; course_id: string | null; scheduled_date: string | null } | null
  if (!r) return null
  const [{ ctx, error }, hcps] = await Promise.all([
    fetchTripContext(reader, tripId, null, [roundId], true),
    reader.from('round_handicaps').select('player_id, tee_id').eq('round_id', roundId),
  ])
  if (error || !ctx) throw new Error(error ?? 'Could not read the round.')
  // Every signed card, casual or not: a casual round is kept off the
  // boards, but it is still golf the player played and signed.
  const stats = holeStats({ players: ctx.players, holes: ctx.holes, resolved: ctx.resolved, hcpFor: ctx.hcpFor })
  return {
    tripId, roundId, courseId: r.course_id, playedOn: r.scheduled_date, stats,
    teeOf: new Map(((hcps.data ?? []) as { player_id: string; tee_id: string | null }[]).map(h => [h.player_id, h.tee_id])),
  }
}
