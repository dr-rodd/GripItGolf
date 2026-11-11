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

import { cardBlocker, gateLine, ratedTeeCount } from './courseCard'
import { supabase } from './supabase'
import { isHandicapPending } from './handicap'
import { toItemRow } from './itinerarySync'
import { dayNumber, type ItineraryItem } from './itinerary'
import { cardKey, cardsOffWith, parseLeagueSetup, tidyCardsOff, isPeriodLeague, periodsIssue, type LeaguePeriod } from './leagueSetup'
import { withRoundAllowance } from './handicapAllowance'
import { teeSheetInUse } from './eventHub'
import { extendEventEnd } from './entryClient'

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
  /** The event's code — moving its end date on goes through the server. */
  tripCode: string
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
    // Through the server (row-level security stage 4, D65): the field may
    // add a round to an ad hoc series, but never writes the trips row.
    const moved = await extendEventEnd(args.tripCode, args.date)
    if (!moved.ok) return { ok: false, error: moved.error }
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
 * A league's round deadlines, set whole — each round's play-by date by its
 * key (lib/leagueSetup.ts `leagueRoundKey`), or none with null — merged into
 * the setup read fresh, as the gear's writers merge. A league's alone.
 */
export async function setRoundDeadlines(args: {
  tripId: string; deadlines: Record<string, string> | null
}): Promise<Result> {
  const fail: Result = { ok: false, error: 'Could not save the deadlines — try again.' }
  const { data, error } = await supabase
    .from('trips')
    .select('bracket_setup')
    .eq('id', args.tripId)
    .single()
  if (error || !data) return fail
  const raw = (data as { bracket_setup?: unknown }).bracket_setup
  if (!parseLeagueSetup(raw) || !raw || typeof raw !== 'object') return fail

  const merged: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  if (args.deadlines && Object.keys(args.deadlines).length > 0) merged.deadlines = args.deadlines
  else delete merged.deadlines

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

// ─── A card in a league of periods ─────────────────────────────

/**
 * Start a card in a league of periods (Ross, 8 Nov 2026) — the round for
 * this course on this day, **found or made**, so a fourball playing
 * together shares one round and its cards as any round does. Its number is
 * the next free one; the database's UNIQUE (trip, round number) is the
 * referee when two phones race, and the loser looks again — somebody else
 * may just have made this very round.
 *
 * No itinerary item, and no handicap snapshot for the field: a card is not
 * a day on the schedule, and the players on it get their snapshot when the
 * card locks them (`lockPlayers`), which is the only time one is needed.
 * Whether the day is inside a period, the course allowed and the person
 * allowed is the caller's to have asked (lib/leagueSetup.ts
 * `periodCardIssue`, the league's `courseIds`, `submit_cards`).
 */
export async function startPeriodCard(args: {
  tripId: string; courseId: string; date: string
  /** An event: a refusal for no ratings asks the organiser, never Trip Setup. */
  event?: boolean
}): Promise<{ ok: true; roundNumber: number } | { ok: false; error: string }> {
  // The one scorecard gate (D68), asked of the database before anything is
  // made: a card never starts on a course with no scorecard or no rated tee,
  // whatever the screen in front of it showed.
  const [holesRes, teesRes] = await Promise.all([
    supabase.from('holes').select('id', { count: 'exact', head: true }).eq('course_id', args.courseId),
    supabase.from('tees').select('course_rating, slope, par').eq('course_id', args.courseId),
  ])
  if (holesRes.error || teesRes.error) return { ok: false, error: 'Could not start the card — try again.' }
  const blocker = cardBlocker(holesRes.count ?? 0, ratedTeeCount(teesRes.data ?? []))
  if (blocker) return { ok: false, error: gateLine(blocker, args.event ?? true) }

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: found, error: findError } = await supabase
      .from('rounds')
      .select('round_number')
      .eq('trip_id', args.tripId)
      .eq('course_id', args.courseId)
      .eq('scheduled_date', args.date)
      .order('round_number')
      .limit(1)
    if (findError) return { ok: false, error: 'Could not start the card — try again.' }
    if (found && found.length > 0) return { ok: true, roundNumber: (found[0] as { round_number: number }).round_number }

    const { data: last, error: lastError } = await supabase
      .from('rounds')
      .select('round_number')
      .eq('trip_id', args.tripId)
      .order('round_number', { ascending: false })
      .limit(1)
    if (lastError) return { ok: false, error: 'Could not start the card — try again.' }
    const number = ((last?.[0] as { round_number: number } | undefined)?.round_number ?? 0) + 1

    const { error } = await supabase.from('rounds').insert({
      trip_id: args.tripId,
      course_id: args.courseId,
      round_number: number,
      status: 'upcoming',
      scheduled_date: args.date,
    })
    if (!error) return { ok: true, roundNumber: number }
    // Anything but a lost race is a real failure, said once.
    if (error.code !== '23505') return { ok: false, error: 'Could not start the card — try again.' }
  }
  return { ok: false, error: 'Somebody else is starting cards just now — try again.' }
}

/**
 * A league of periods' dates, moved by the organiser (Ross, 8 Nov 2026:
 * "each period's dates can then be adjusted by hand"). The same periods,
 * keys kept — a card is filed by its date on every read, so moving a
 * period re-files its cards with nothing else to write. The stored setup is
 * read fresh and merged, and the event's own dates follow the periods.
 */
export async function setLeaguePeriods(args: {
  tripId: string; periods: LeaguePeriod[]
}): Promise<Result> {
  const issue = periodsIssue(args.periods)
  if (issue) return { ok: false, error: issue }
  const fail: Result = { ok: false, error: 'Could not save the periods — try again.' }
  const { data, error } = await supabase
    .from('trips')
    .select('bracket_setup')
    .eq('id', args.tripId)
    .single()
  if (error || !data) return fail
  const raw = (data as { bracket_setup?: unknown }).bracket_setup
  const setup = parseLeagueSetup(raw)
  if (!isPeriodLeague(setup) || !raw || typeof raw !== 'object') return fail
  // The same periods, by key — dates move, periods are never added or lost here.
  const keys = setup.periods.map(p => p.key).join()
  if (args.periods.map(p => p.key).join() !== keys) return fail

  const { error: writeError } = await supabase
    .from('trips')
    .update({
      bracket_setup: { ...(raw as Record<string, unknown>), periods: args.periods },
      start_date: args.periods[0].start,
      end_date: args.periods.at(-1)!.end,
    })
    .eq('id', args.tripId)
  return writeError ? fail : { ok: true }
}
