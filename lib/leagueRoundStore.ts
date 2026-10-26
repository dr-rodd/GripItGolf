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
import { cardKey, cardsOffWith, parseLeagueSetup, tidyCardsOff } from './leagueSetup'
import { withRoundAllowance } from './handicapAllowance'
import { teeSheetInUse } from './eventHub'

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
 *
 * **A league whose rounds go out from a tee sheet gives the new one a tee
 * sheet too** (Ross, 26 Oct 2026: a tee time for every round) — vacant on
 * the Tee times tab until the organiser makes it. Asked of the rounds as
 * they stand, fail-soft: a failed read is no tee sheet, never no round.
 */
async function makeRound(args: {
  tripId: string; itemId: string; courseId: string; number: number; date: string
  players: readonly Player[]
}): Promise<Made> {
  const { data: formats } = await supabase
    .from('rounds')
    .select('start_format')
    .eq('trip_id', args.tripId)
  const teeSheet = teeSheetInUse(((formats ?? []) as { start_format: string | null }[]).map(r => r.start_format))

  const { data: round, error } = await supabase
    .from('rounds')
    .insert({
      trip_id: args.tripId,
      course_id: args.courseId,
      round_number: args.number,
      status: 'upcoming',
      itinerary_item_id: args.itemId,
      scheduled_date: args.date,
      ...(teeSheet ? { start_format: 'tee_sheet' } : {}),
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
 * The rounds numbered `from` and above move up one, the highest first so
 * none lands on a number still taken (UNIQUE trip, round number). False
 * when any move is refused — the rounds stay valid, a gap at worst, and
 * the caller says so rather than adding a round onto a number in use.
 */
async function shiftRoundNumbers(tripId: string, from: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('rounds')
    .select('id, round_number')
    .eq('trip_id', tripId)
    .gte('round_number', from)
    .order('round_number', { ascending: false })
  if (error) return false
  for (const r of (data ?? []) as { id: string; round_number: number }[]) {
    const { error: moveError } = await supabase
      .from('rounds')
      .update({ round_number: r.round_number + 1 })
      .eq('id', r.id)
      .eq('trip_id', tripId)
    if (moveError) return false
  }
  return true
}

/**
 * Add a round to the league: on `date`, at `courseId` — or TBC when that
 * is null, in which case only the dated golf item is written.
 *
 * **It takes its place in date order** (Ross, 26 Oct 2026): `number` is
 * the caller's `insertedRoundNumber`, and the rounds from it on move up one
 * first — never a played one, because `nextRoundIssue` only allows a date
 * after the last round played. A TBC round has no row to move; its number
 * is its place in date order, so it follows by itself.
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

  if (!(await shiftRoundNumbers(args.tripId, args.number))) {
    return { ok: false, error: 'Could not make room for the round — refresh and try again.' }
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

// ─── A round's gear ────────────────────────────────────────────
//
// Both of these change a value stored whole on the trip — the league setup
// and the boards — so both read it fresh and merge, never rewrite from what
// a screen happened to load: a key this code does not know about survives,
// and a change made on another phone a minute ago is not undone.

/**
 * Switch one player's card in one round off the league, or back on.
 * Stored in the league setup (`cardsOff`); the scores are never touched.
 */
export async function setCardCounts(args: {
  tripId: string; roundId: string; playerId: string; counts: boolean
}): Promise<Result> {
  const fail: Result = { ok: false, error: 'Could not save the change — try again.' }
  const { data, error } = await supabase
    .from('trips')
    .select('bracket_setup')
    .eq('id', args.tripId)
    .single()
  if (error || !data) return fail
  const raw = (data as { bracket_setup?: unknown }).bracket_setup
  // Only ever a league's own setup — never a guess written over something else.
  if (!parseLeagueSetup(raw) || !raw || typeof raw !== 'object') return fail

  const stored = raw as Record<string, unknown>
  const next = cardsOffWith(tidyCardsOff(stored.cardsOff), cardKey(args.roundId, args.playerId), !args.counts)
  const merged: Record<string, unknown> = { ...stored }
  if (next.length > 0) merged.cardsOff = next
  else delete merged.cardsOff

  const { error: writeError } = await supabase
    .from('trips')
    .update({ bracket_setup: merged })
    .eq('id', args.tripId)
  return writeError ? fail : { ok: true }
}

/**
 * Set one round's handicap allowance on one board — or clear it, with null,
 * back to the board's own. Stored on the board (`roundAllowances`).
 */
export async function setRoundAllowance(args: {
  tripId: string; boardId: string; roundId: string; pct: number | null
}): Promise<Result> {
  const fail: Result = { ok: false, error: 'Could not save the change — try again.' }
  const { data, error } = await supabase
    .from('trips')
    .select('leaderboards')
    .eq('id', args.tripId)
    .single()
  if (error || !data) return fail
  const raw = (data as { leaderboards?: unknown }).leaderboards
  if (!Array.isArray(raw)) return fail
  const index = raw.findIndex(b => b && typeof b === 'object' && (b as { id?: unknown }).id === args.boardId)
  if (index === -1) return { ok: false, error: 'That leaderboard has changed — refresh and try again.' }

  const next = [...raw]
  next[index] = withRoundAllowance(raw[index] as Record<string, unknown>, args.roundId, args.pct)
  const { error: writeError } = await supabase
    .from('trips')
    .update({ leaderboards: next })
    .eq('id', args.tripId)
  return writeError ? fail : { ok: true }
}
