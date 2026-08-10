// Deleting a trip whole, in the only order the database allows.
//
// `delete from trips` alone fails for any trip that ever opened a scorecard:
// the schema deliberately guards the live tables and the tee links with
// ON DELETE RESTRICT, so a plain cascade stops at the first one. The
// restricts are, in the order they have to be cleared:
//
//   · `composite_holes` — RESTRICT on rounds, players and holes
//   · `tee_times.player_id` — RESTRICT on players
//   · `live_rounds.round_id` / `.course_id` — RESTRICT on rounds and courses
//   · `rounds.tee_id` — RESTRICT on tees, so the rounds must go before the
//     tees can
//   · `tees.course_id` — RESTRICT on courses, so a legacy trip-scoped
//     course cannot cascade while its tees exist
//
// Everything else cascades off `trips`: teams, players, team_members, any
// trip-scoped courses and their holes, itinerary, matchplay, team sets.
// Platform courses (`trip_id IS NULL`) are untouched throughout — the trip's
// rounds pointed at them, and rounds go first.
//
// I/O, in the scorecardVoid style: takes the client, returns the first
// failure or null. Steps are sequential on purpose — each clears the way for
// the next, so firing them together would only race the restricts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { failed, type WriteFailure } from './writeFailure'

export async function deleteTrip(
  db: SupabaseClient,
  tripId: string,
): Promise<WriteFailure | null> {
  const [roundsRes, coursesRes] = await Promise.all([
    db.from('rounds').select('id').eq('trip_id', tripId),
    db.from('courses').select('id').eq('trip_id', tripId),
  ])
  const readFailure =
    failed('reading the trip’s rounds', roundsRes.error)
    ?? failed('reading the trip’s courses', coursesRes.error)
  if (readFailure) return readFailure

  const roundIds = (roundsRes.data ?? []).map(r => r.id as string)
  const courseIds = (coursesRes.data ?? []).map(c => c.id as string)

  if (roundIds.length > 0) {
    const composite = await db
      .from('composite_holes')
      .delete()
      .in('round_id', roundIds)
    const compositeFailure = failed('removing the composite scorecards', composite.error)
    if (compositeFailure) return compositeFailure
  }

  const teeTimes = await db
    .from('tee_times')
    .delete()
    .eq('trip_id', tripId)
  const teeTimesFailure = failed('removing the tee times', teeTimes.error)
  if (teeTimesFailure) return teeTimesFailure

  if (roundIds.length > 0) {
    const liveRounds = await db
      .from('live_rounds')
      .delete()
      .in('round_id', roundIds)
    const liveFailure = failed('removing the scoring sessions', liveRounds.error)
    if (liveFailure) return liveFailure
  }

  // Explicit rather than left to the trips cascade: `rounds.tee_id` holds
  // the tees, and the tees hold any trip-scoped course. Scores,
  // round_handicaps and live_scores all cascade off the rounds.
  const rounds = await db
    .from('rounds')
    .delete()
    .eq('trip_id', tripId)
  const roundsFailure = failed('removing the rounds', rounds.error)
  if (roundsFailure) return roundsFailure

  if (courseIds.length > 0) {
    const tees = await db
      .from('tees')
      .delete()
      .in('course_id', courseIds)
    const teesFailure = failed('removing the trip’s course tees', tees.error)
    if (teesFailure) return teesFailure
  }

  const trip = await db
    .from('trips')
    .delete()
    .eq('id', tripId)
  return failed('removing the trip', trip.error)
}
