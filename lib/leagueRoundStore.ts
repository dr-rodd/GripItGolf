// Writing a league's rounds — adding the next one, and confirming a venue
// that was left to be confirmed. The browser's half; lib/leagueSetup.ts
// decides (`nextRoundIssue`, `leagueRounds`, `nextRoundNumber`), this only
// writes.
//
// Not `saveItinerary`, deliberately. That numbers a new round "last + 1",
// which is right on a trip and wrong on a league with a TBC round in it:
// the TBC round holds its number by its place in date order without any
// row to show for it, so "last + 1" would hand that number to somebody
// else. Here the number is always the caller's, worked out by the one rule,
// and the database's UNIQUE (trip, round number) is the referee when two
// phones race for it.
//
// A TBC round is a golf item with no course and no round (the note in
// lib/leagueSetup.ts). Confirming its venue sets the item's course and makes
// the round — which is the moment it can first be scored.

import { supabase } from './supabase'
import { isHandicapPending } from './handicap'
import { toItemRow } from './itinerarySync'
import { dayNumber, type ItineraryItem } from './itinerary'

type Result = { ok: true } | { ok: false; error: string }
/** `made` says whether the round row exists, whatever else went wrong. */
type Made = { ok: boolean; made: boolean; error?: string }
type Player = { id: string; handicap: number | null }

/** The day a date falls on, counted from the league's first round. */
function dayIndexOf(startDate: string, date: string): number {
  return Math.round((dayNumber(date)! - dayNumber(startDate)!) / 86_400_000)
}

/**
 * The round and its handicap snapshots — a rated player gets one, a pending
 * one gets none, as everywhere (lib/handicap.ts). The index stands in until
 * a tee is chosen, the same as at creation.
 */
async function makeRound(args: {
  tripId: string; itemId: string; courseId: string; number: number; date: string
  players: readonly Player[]
}): Promise<Made> {
  const { data: round, error } = await supabase
    .from('rounds')
    .insert({
      trip_id: args.tripId,
      course_id: args.courseId,
      round_number: args.number,
      status: 'upcoming',
      itinerary_item_id: args.itemId,
      scheduled_date: args.date,
    })
    .select('id')
    .single()
  if (error || !round) {
    return { ok: false, made: false, error: 'Somebody changed the rounds just now — refresh and try again.' }
  }

  const rated = args.players.filter(p => !isHandicapPending(p.handicap))
  if (rated.length > 0) {
    const { error: hcpError } = await supabase.from('round_handicaps').insert(
      rated.map(p => ({
        round_id: round.id,
        player_id: p.id,
        playing_handicap: Math.round(p.handicap as number),
      })),
    )
    // The round stands either way — it is real now, and undoing it over a
    // snapshot would lose more than it saves. Said, so it is fixed before
    // anybody plays off nothing.
    if (hcpError) {
      return { ok: false, made: true, error: 'Round made, but the handicaps did not save — re-enter them in Trip Setup.' }
    }
  }
  return { ok: true, made: true }
}

/**
 * Add the league's next round: on `date`, at `courseId` — or TBC when that
 * is null, in which case only the dated golf item is written.
 *
 * The trip runs from its first round to its last, so a round past the end
 * moves the end on first: an end stretched with nothing under it yet is a
 * harmless longer range that the retry fills, where the other order could
 * leave a round outside its own league's dates.
 */
export async function addLeagueRound(args: {
  tripId: string
  startDate: string
  endDate: string | null
  date: string
  courseId: string | null
  number: number
  /** Where on its day the item goes — after anything already on it. */
  position: number
  players: readonly Player[]
}): Promise<Result> {
  if (!args.endDate || args.date > args.endDate) {
    const { error } = await supabase
      .from('trips')
      .update({ end_date: args.date })
      .eq('id', args.tripId)
    if (error) return { ok: false, error: 'Could not add the round — try again.' }
  }

  const item: ItineraryItem = {
    id: 'tmp-round',
    dayIndex: dayIndexOf(args.startDate, args.date),
    position: args.position,
    kind: 'golf',
    courseId: args.courseId,
    teeTime: null,
    teeCount: 1,
  }
  const { data: saved, error: itemError } = await supabase
    .from('itinerary_items')
    .insert(toItemRow(args.tripId, item))
    .select('id')
    .single()
  if (itemError || !saved) {
    return { ok: false, error: 'Somebody added a round on that day just now — refresh and try again.' }
  }

  if (!args.courseId) return { ok: true }

  const made = await makeRound({
    tripId: args.tripId, itemId: saved.id, courseId: args.courseId,
    number: args.number, date: args.date, players: args.players,
  })
  if (!made.made) {
    // No round, so no item either: a dated golf item with a course and no
    // round would read as a round nobody can open. Scoped by trip, as every
    // delete is.
    await supabase.from('itinerary_items').delete().eq('trip_id', args.tripId).eq('id', saved.id)
  }
  return made.ok ? { ok: true } : { ok: false, error: made.error ?? 'Could not add the round — try again.' }
}

/**
 * Confirm a TBC round's venue — which makes the round.
 *
 * The item is claimed first, and only while it is still TBC (`course_id IS
 * NULL`), so two phones choosing at once cannot both make a round: the
 * second finds the item already taken and is told so. If the round cannot
 * be made after that, the item goes back to TBC rather than sitting with a
 * course and no round.
 */
export async function confirmLeagueVenue(args: {
  tripId: string
  itemId: string
  courseId: string
  number: number
  date: string
  players: readonly Player[]
}): Promise<Result> {
  const { data: claimed, error } = await supabase
    .from('itinerary_items')
    .update({ course_id: args.courseId })
    .eq('trip_id', args.tripId)
    .eq('id', args.itemId)
    .is('course_id', null)
    .select('id')
  if (error) return { ok: false, error: 'Could not set the venue — try again.' }
  if (!claimed || claimed.length === 0) {
    return { ok: false, error: 'This round’s venue was just set on another phone — refresh to see it.' }
  }

  const made = await makeRound({
    tripId: args.tripId, itemId: args.itemId, courseId: args.courseId,
    number: args.number, date: args.date, players: args.players,
  })
  if (!made.made) {
    await supabase
      .from('itinerary_items')
      .update({ course_id: null })
      .eq('trip_id', args.tripId)
      .eq('id', args.itemId)
  }
  return made.ok ? { ok: true } : { ok: false, error: made.error ?? 'Could not set the venue — try again.' }
}
