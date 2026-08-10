// Where one player stands, fetched.
//
// `lib/standing.ts` decides which of the two answers applies and does the
// arithmetic; this is the half that talks to the database. Kept out of the
// hub page because the full path is nine queries and the page has enough to
// read already.
//
// The cheap path is one query. The full path is the leaderboard's own query
// budget, and is only taken for a board the cheap one would get wrong — a
// strokes board, a team board, or a prize table. Most trips never reach it.

import { supabase } from './supabase'
import { type Leaderboard } from './leaderboards'
import { type TeamScoring } from './teamScoring'
import {
  buildRows,
  type RowHole, type RowPlayer, type RowRound, type RowContext, type BoardRow,
} from './boardRows'
import { holeStats, type HoleStat } from './holeStats'
import { standings, type SummaryScore } from './playerSummary'
import { fetchMemberships } from './teamMembers'
import {
  usesSimpleStandings, placingFromStandings, placingFromRows, type Placing,
} from './standing'
import { buildRowContext, type ScoreRow, type LiveScoreRow } from './rowContext'

export type PlacingResult = {
  placing: Placing | null
  /** Set when a query failed. The hub says so rather than showing nothing. */
  error: string | null
}

const NONE: PlacingResult = { placing: null, error: null }

/**
 * The player's place on the board this trip is about.
 *
 * Null placing is an ordinary answer — a draw has no table, and a player
 * with no card has no position. Neither is an error and neither prints a
 * zero.
 */
export async function fetchPlacing(
  tripId: string,
  lead: Leaderboard | null,
  playerId: string,
  /**
   * The trip's old team-scoring setting, or null.
   *
   * **Already gated by the caller**, the same way the leaderboard page gates
   * it: `isLegacy(stored) ? teamScoring : null`. It used to be the raw column
   * value, parsed here unconditionally, which meant a trip that had since
   * chosen real boards was still scored on options the new model never asks
   * for — and only on this screen. The leaderboard gated it and the hub did
   * not, so the two could put a player in different places.
   */
  legacyTeamScoring: TeamScoring | null,
): Promise<PlacingResult> {
  // A knockout is not a table. The next-match line carries that board.
  if (!lead || lead.competition === 'matchplay') return NONE

  return usesSimpleStandings(lead)
    ? simplePlacing(tripId, lead, playerId)
    : fullPlacing(tripId, lead, playerId, legacyTeamScoring)
}

/**
 * Two queries, for the board most trips run.
 *
 * The same totals under the same discard rule the leaderboard applies, so
 * the hub and the board cannot disagree about who is winning.
 *
 * **`scores` has no `trip_id`, and never has.** It is scoped through the round
 * it belongs to — `scores.round_id → rounds.trip_id` — which is why every
 * other query in this codebase asks for a trip's rounds first and then the
 * scores on them. This one asked for `scores.trip_id` directly, which is not a
 * filter that matches nothing but a column that does not exist: Postgres
 * returns 42703 and the hub printed "Could not read the scores for your
 * standing" for every trip on the cheap path, which is most of them.
 *
 * So: the rounds, then the scores on them. Still cheap — two, against the full
 * path's nine.
 */
async function simplePlacing(
  tripId: string,
  lead: Leaderboard,
  playerId: string,
): Promise<PlacingResult> {
  // `*` rather than `id` alone: the cheap path has to leave casual rounds
  // out, exactly as `buildRows` does on the full path — `test:hub` holds the
  // two against each other. Not named in the column list because migration
  // 031 is run by hand, and this query serves most trips' hubs.
  const { data: rounds, error: roundsError } = await supabase
    .from('rounds')
    .select('*')
    .eq('trip_id', tripId)

  if (roundsError) {
    console.error('fetchPlacing rounds query failed:', roundsError)
    return { placing: null, error: 'Could not read the rounds for your standing.' }
  }

  // No rounds, no scores, no position. An ordinary answer for a trip that has
  // not started, not an error — and asking `.in('round_id', [])` for it would
  // be a wasted round trip.
  const roundIds = (rounds ?? [])
    .filter(r => r.casual !== true)
    .map(r => r.id as string)
  if (roundIds.length === 0) return NONE

  const { data, error } = await supabase
    .from('scores')
    .select('player_id, round_id, stableford_points')
    .in('round_id', roundIds)

  if (error) {
    console.error('fetchPlacing scores query failed:', error)
    return { placing: null, error: 'Could not read the scores for your standing.' }
  }

  const scored: SummaryScore[] = (data ?? []).map(s => ({
    playerId: s.player_id,
    roundId: s.round_id,
    points: s.stableford_points ?? 0,
  }))

  return {
    placing: placingFromStandings(playerId, standings(scored, lead.discardWorst ?? 0)),
    error: null,
  }
}

/**
 * The board built properly, for anything the cheap path would get wrong.
 *
 * Strokes sorts the other way, a team board ranks teams rather than people,
 * and a prize table pays by finishing place rather than by the points that
 * earned it. All three come out here.
 *
 * `entrantIds` is just the player: a team row carries its members' ids, so
 * looking for their id finds their team's row without this needing to know
 * which sheet the board is on.
 */
async function fullPlacing(
  tripId: string,
  lead: Leaderboard,
  playerId: string,
  legacyTeamScoring: TeamScoring | null,
): Promise<PlacingResult> {
  const { rows, error } = await fetchBoardRows(tripId, lead, legacyTeamScoring)
  if (error) return { placing: null, error }
  return { placing: placingFromRows([playerId], rows), error: null }
}

/**
 * One round's board, for a round summary's podium.
 *
 * **The discard rule is dropped, and it has to be.** A trip that throws away
 * your worst round has nothing to say about a table built from exactly one —
 * `totalAfterDiscard([x], 1)` sets aside the only card there is and puts the
 * whole field on nothing. A round result is that round's result.
 *
 * Everything else about the board travels: its scoring, its allowance, who it
 * ranks. And the rows come back in the same finishing order the leaderboard
 * would put them in, from the same `buildRows`, because that is the only
 * ordering in this codebase.
 *
 * An empty list is the ordinary answer for a round nobody has played —
 * `buildRows` drops anyone with no holes on it.
 */
export async function fetchRoundRows(
  tripId: string,
  roundId: string,
  lead: Leaderboard | null,
  legacyTeamScoring: TeamScoring | null,
): Promise<{ rows: BoardRow[]; error: string | null }> {
  // A knockout is not a table, so it has no podium.
  if (!lead || lead.competition === 'matchplay') return { rows: [], error: null }
  const { ctx, error } = await fetchTripContext(tripId, legacyTeamScoring, [roundId])
  if (error || !ctx) return { rows: [], error }
  // The casual flag is cleared for the same reason the discard rule is
  // dropped: a round's result is that round's result, whether or not the
  // trip is counting it. `buildRows` would otherwise return an empty board
  // for a casual round, and its page would read as never played.
  const own = { ...ctx, rounds: ctx.rounds.map(r => ({ ...r, casual: false })) }
  return { rows: buildRows({ ...lead, discardWorst: 0 }, own), error: null }
}

/**
 * A board's rows, over every round or over some of them.
 *
 * The nine queries. Shared by the hub's standing line and the round summary's
 * podium so there is one place that knows what a board needs. They differ only
 * in which rounds they ask about.
 */
async function fetchBoardRows(
  tripId: string,
  lead: Leaderboard,
  legacyTeamScoring: TeamScoring | null,
  onlyRoundIds?: string[],
): Promise<{ rows: BoardRow[]; error: string | null }> {
  const { ctx, error } = await fetchTripContext(tripId, legacyTeamScoring, onlyRoundIds)
  if (error || !ctx) return { rows: [], error }
  return { rows: buildRows(lead, ctx), error: null }
}

/**
 * Every card on a trip, assembled — and nothing decided about them.
 *
 * The same nine queries `fetchBoardRows` has always run, split out because a
 * board is no longer the only thing built from them: the stats screens need
 * the same cards and none of the ranking. The split is where it already was
 * — fetch on one side of `buildRowContext`, decide on the other.
 *
 * `holes` comes back alongside because the difficulty order prints a par and
 * a stroke index off the card, and `courseByRound` because a course played
 * twice is one set of eighteen holes with twice the evidence.
 */
export async function fetchTripContext(
  tripId: string,
  legacyTeamScoring: TeamScoring | null,
  onlyRoundIds?: string[],
  /**
   * Whether to ask for the putts and fairway columns.
   *
   * Off for a board, which does not read them — and that is not only
   * tidiness. `scores.putts` and `scores.fairway_hit` arrive with migration
   * 028, which is run by hand; naming them in the query every board depends
   * on would make the leaderboard and the standing line fail on any database
   * where that migration has not been applied yet. Only the stats path asks,
   * and the stats path is switched off on such a trip anyway.
   */
  withStats = false,
): Promise<{
  ctx: RowContext | null
  holes: RowHole[]
  courseByRound: Map<string, string>
  error: string | null
}> {
  const empty = { ctx: null, holes: [], courseByRound: new Map<string, string>() }
  const statCols = withStats ? ', putts, fairway_hit' : ''
  // `*` so the casual flags ride along without being named — migration 031
  // is run by hand, and this query is under every board and standing line.
  const { data: rounds, error: roundsError } = await supabase
    .from('rounds')
    .select('*')
    .eq('trip_id', tripId)
    .order('round_number')

  if (roundsError) {
    console.error('fetchTripContext rounds query failed:', roundsError)
    return { ...empty, error: 'Could not read the rounds.' }
  }

  const all = rounds ?? []
  const roundRows = onlyRoundIds
    ? all.filter(r => onlyRoundIds.includes(r.id as string))
    : all
  if (roundRows.length === 0) return { ...empty, error: null }

  const roundIds = roundRows.map(r => r.id as string)
  const courseIds = [...new Set(roundRows.map(r => r.course_id as string).filter(Boolean))]
  const nil = '00000000-0000-0000-0000-000000000000'
  const someCourses = courseIds.length > 0 ? courseIds : [nil]

  const [playersRes, teamsRes, holesRes, scoresRes, liveScoresRes, hcpsRes, teesRes, openRes,
         memberships] =
    await Promise.all([
      supabase.from('players')
        .select('id, name, handicap, gender')
        .eq('trip_id', tripId).eq('is_composite', false).order('name'),
      supabase.from('teams')
        .select('id, name, color, team_set').eq('trip_id', tripId).order('created_at'),
      supabase.from('holes')
        .select('id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies')
        .in('course_id', someCourses).order('hole_number'),
      supabase.from('scores')
        .select('player_id, round_id, hole_id, gross_score, stableford_points, no_return' + statCols)
        .in('round_id', roundIds),
      supabase.from('live_scores')
        .select('player_id, round_id, hole_number, gross_score, stableford_points' + statCols)
        .in('round_id', roundIds),
      supabase.from('round_handicaps')
        .select('round_id, player_id, playing_handicap, tee_id')
        .in('round_id', roundIds),
      supabase.from('tees')
        .select('id, slope, course_rating, par').in('course_id', someCourses),
      supabase.from('live_rounds')
        .select('round_id, live_player_locks(player_id)')
        .eq('status', 'active').in('round_id', roundIds),
      fetchMemberships(tripId),
    ])

  const failed = [playersRes, teamsRes, holesRes, scoresRes, liveScoresRes, hcpsRes, teesRes, openRes]
    .find(r => r.error)
  if (failed?.error) {
    console.error('fetchTripContext query failed:', failed.error)
    return { ...empty, error: 'Could not work out the standings.' }
  }

  const players = playersRes.data ?? []
  const holes = (holesRes.data ?? []) as unknown as RowHole[]

  type OpenRound = { round_id: string; live_player_locks: { player_id: string }[] | null }
  const open = (openRes.data ?? []) as unknown as OpenRound[]

  // The same assembly the leaderboard uses, from the same function. This
  // screen fetches its own rows; what it does with them is not its own.
  const ctx = buildRowContext({
    players,
    teams: teamsRes.data ?? [],
    memberships,
    holes,
    rounds: roundRows.map(r => ({
      id: r.id,
      round_number: r.round_number,
      casual: r.casual === true,
      casual_stats: r.casual_stats === true,
    })),
    courseByRound: new Map(roundRows.map(r => [r.id as string, r.course_id as string])),
    // Cast because the column list is now built rather than written out, and
    // supabase-js types a result by parsing the literal it was given. Same
    // treatment `holes` and the open rounds already get in this function.
    scores: (scoresRes.data ?? []) as unknown as ScoreRow[],
    liveScores: (liveScoresRes.data ?? []) as unknown as LiveScoreRow[],
    roundHandicaps: hcpsRes.data ?? [],
    tees: teesRes.data ?? [],
    activeRoundIds: open.map(r => r.round_id),
    livePlayerIds: open.flatMap(r => (r.live_player_locks ?? []).map(l => l.player_id)),
    legacyTeamScoring,
  })

  return {
    ctx,
    holes,
    courseByRound: new Map(roundRows.map(r => [r.id as string, r.course_id as string])),
    error: null,
  }
}

/**
 * A trip's cards, as statistics.
 *
 * The same nine queries and the same assembly as a leaderboard, so a signed
 * card beats a live one here too and an abandoned card is still not in play.
 * `legacyTeamScoring` is null because nothing here builds a team row.
 */
export async function fetchTripStats(
  tripId: string,
  onlyRoundIds?: string[],
): Promise<{
  stats: HoleStat[]
  holes: RowHole[]
  players: RowPlayer[]
  rounds: RowRound[]
  courseByRound: Map<string, string>
  error: string | null
}> {
  const { ctx, holes, courseByRound, error } =
    await fetchTripContext(tripId, null, onlyRoundIds, true)
  if (error || !ctx) {
    return { stats: [], holes: [], players: [], rounds: [], courseByRound: new Map(), error }
  }

  // A casual round feeds the stats only if it opted in — `casual_stats`,
  // asked when the round was marked casual on a trip already tracking
  // stats, and flippable later on the round's page. The round goes whole:
  // out of the cards, out of the round list, and out of `courseByRound` so
  // an excluded round's course cannot become a picker chip with no holes
  // behind it.
  const excluded = new Set(
    ctx.rounds.filter(r => r.casual && !r.casual_stats).map(r => r.id)
  )
  const rounds = ctx.rounds.filter(r => !excluded.has(r.id))
  const resolved = ctx.resolved.filter(s => !excluded.has(s.roundId))

  return {
    stats: holeStats({ players: ctx.players, holes: ctx.holes, resolved }),
    holes,
    players: ctx.players,
    rounds,
    courseByRound: new Map([...courseByRound].filter(([roundId]) => !excluded.has(roundId))),
    error: null,
  }
}
