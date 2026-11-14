import { overallOf } from '@/lib/sessions'
import { readSessionResults } from '../session/sessionMatches'
import { isKnockoutEvent } from '@/lib/bracketSetup'
import { eventReader } from '@/lib/eventReader'
import { parseFormats } from '@/lib/formats'
import { isMatchTally, parseLeaderboards, type Leaderboard } from '@/lib/leaderboards'
import { tripBoards } from '@/lib/leaderboardsCompat'
import { parseTeamScoring } from '@/lib/teamScoring'
import { fetchMemberships } from '@/lib/teamMembers'
import { isEvent } from '@/lib/eventHub'
import { parseLeagueSetup } from '@/lib/leagueSetup'
import { readScores, readLiveScores, readRoundHandicaps } from '@/lib/scoreReads'
import { makeCopyKeeper } from '@/lib/sharedCopy'
import { golfIrelandLinkedIds } from '../golfIreland'
import { readRoundCards } from '@/lib/golfIrelandCards'
import type { Score, LiveScore, RoundHcp } from './TripLeaderboardClient'

/**
 * Everything the golf leaderboard reads, kept as one shared server copy per
 * event (lib/sharedCopy.ts has the rules). The page renders from this and
 * reads nothing itself.
 *
 * Why: every phone on a live board refreshes it every fifteen seconds
 * (`Poller`), and each refresh was the whole event read out of Supabase
 * again — data sent out of Supabase is what its free plan meters, and a
 * 100-player tournament's board is a lot of rows. With the copy, a look
 * inside `GOLF_BOARD_SECONDS` of the last read reads nothing.
 *
 * What can be in the copy: only this event's rows, read through
 * `eventReader`, and nothing about who is looking — the copy is the same
 * for every phone. A per-viewer read added to this page goes in the page,
 * never in here.
 */

/**
 * How old a board's copy may be before the next look reads the database
 * again. Short enough that a score entered on one phone is on every other
 * board within one poll or so (15s + this); long enough that a crowd on one
 * board is a handful of reads a minute. The one copy of the figure.
 */
export const GOLF_BOARD_SECONDS = 10

/**
 * How long a copy is held after its read — the oldest board a failed read
 * may fall back on, and when a board nobody is looking at is let go.
 */
const HOLD_MS = 10 * 60_000

/** The event code has no event (or the trips read failed) — never kept. */
export class NoSuchBoard extends Error {
  constructor() { super('no such event') }
}

/** One of the board's reads came back with an error — never kept. */
class BoardReadFailed extends Error {
  constructor(what: string, cause: unknown) {
    super(`leaderboard read failed: ${what}`)
    console.error(`Leaderboard ${what} read failed:`, cause)
  }
}

/**
 * What this page reads off a round.
 *
 * The query asks for `rounds(*)` so the casual flag rides along without being
 * named — migration 031 is run by hand. This names the columns actually used.
 */
export type BoardRound = {
  id: string
  round_number: number
  status?: string
  casual?: boolean
  scheduled_date?: string | null
  course_id?: string | null
  courses: { id: string; name: string } | null
}

/**
 * What the trip plays for. A stored list wins; a trip created before the
 * column existed has its old flags read as the boards they described, so the
 * client only ever renders one shape. A tags tally lives under the bracket,
 * which alone reads the results.
 */
export function boardsOf(trip: { leaderboards?: unknown; formats?: unknown; team_scoring?: unknown }): Leaderboard[] {
  return tripBoards(parseLeaderboards(trip.leaderboards), parseFormats(trip.formats), parseTeamScoring(trip.team_scoring))
    .filter(lb => !isMatchTally(lb))
}

/**
 * A match play event's leaderboard is its bracket (docs/event-use-cases.md,
 * story 2) — unless the organiser has added a board beside the draw, in which
 * case the table stays and its strip links to the bracket as on a trip.
 */
function opensBracket(trip: { kind?: unknown; bracket_setup?: unknown; leaderboards?: unknown }): boolean {
  const own = parseLeaderboards(trip.leaderboards)
  return isEvent(trip.kind)
    && isKnockoutEvent(trip.bracket_setup)
    && own.length > 0 && own.every(lb => lb.competition === 'matchplay' || isMatchTally(lb))
}

/** Hands back `res.data`, or fails the whole read — a failed read is never shown as an empty board. */
function must<T>(what: string, res: { data: T | null; error: unknown }): T {
  if (res.error) throw new BoardReadFailed(what, res.error)
  return (res.data ?? []) as T
}

async function readBoard(tripCode: string) {
  const db = eventReader(tripCode)

  // The trip and its rounds in one request.
  //
  // Everything below is scoped by round or by course, so the rounds have to
  // be known before the big batch can be asked for — which used to mean a
  // second round trip, waited for on its own, between the trip lookup and the
  // nine queries under it. Embedding them costs nothing: the two are joined
  // by `rounds.trip_id`, so Postgres does the work this end and one request
  // comes back with both.
  //
  // `rounds(*)` rather than a column list, so the casual flag rides along
  // without being named — migration 031 is run by hand, and this page must
  // keep working on a database without it. The ordering has to name the
  // embedded table; left off, the rounds come back in whatever order the
  // join produced and the board's columns are shuffled.
  const { data: trip } = await db
    .from('trips')
    .select('*, rounds(*, courses(id, name))')
    .eq('trip_code', tripCode)
    .order('round_number', { referencedTable: 'rounds' })
    .single()
  if (!trip) throw new NoSuchBoard()

  const rounds = (trip.rounds ?? []) as BoardRound[]

  // Asked before the batch, so a bracket costs nothing it did not need.
  if (opensBracket(trip)) return { bracket: true as const }

  // Parsed up front: the Golf Ireland cards are read in the batch below,
  // and only for a league that reads them.
  const leagueSetup = isEvent((trip as { kind?: unknown }).kind)
    ? parseLeagueSetup((trip as { bracket_setup?: unknown }).bracket_setup)
    : null

  const roundIds  = rounds.map(r => r.id)
  const courseIds = rounds.map(r => r.courses?.id).filter(Boolean)
  const nilId     = '00000000-0000-0000-0000-000000000000'

  const [teamsRes, playersRes, holesRes, scoresRes, liveScoresRes, hcpsRes, teesRes, openRes,
         memberships, nicknamesRes, giLinked, roundCards, picksRes] =
    await Promise.all([
      db.from('teams').select('id, name, color, team_set').eq('trip_id', trip.id).order('created_at'),
      db.from('players')
        .select('id, name, handicap, gender, is_composite')
        .eq('trip_id', trip.id).eq('is_composite', false).order('name'),
      db.from('holes')
        .select('id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId])
        .order('hole_number'),
      // Every score, however many — lib/scoreReads.ts reads past Supabase's
      // 1,000-row cap, which a trip of fourteen playing four rounds reaches.
      readScores<Score>(db,
        'player_id, hole_id, gross_score, stableford_points, no_return, round_id',
        roundIds.length > 0 ? roundIds : [nilId]),
      // In-progress scores — merged client-side so the board moves during play
      readLiveScores<LiveScore>(db,
        'player_id, round_id, hole_number, gross_score, stableford_points',
        roundIds.length > 0 ? roundIds : [nilId]),
      // `tee_id` comes with them: a board playing off a percentage needs the
      // course handicap before it was rounded, and that can only be worked out
      // again from the tee it was played off.
      readRoundHandicaps<RoundHcp>(db,
        'round_id, player_id, playing_handicap, tee_id',
        roundIds.length > 0 ? roundIds : [nilId]),
      // The ratings behind those tees, so the unrounded course handicap can be
      // rebuilt. Only a board playing off a percentage reads it.
      db.from('tees')
        .select('id, slope, course_rating, par')
        .in('course_id', courseIds.length > 0 ? courseIds : [nilId]),
      // A round is "in play" when a scorecard is open on it — not merely
      // because a score was once entered against it. The locks come with it:
      // who is on that card is what decides which rows wear the live dot, and
      // it has to be per player — not everybody plays every round, and a
      // signed card is not live however busy the rest of the trip is.
      db.from('live_rounds')
        .select('id, round_id, live_player_locks(player_id)')
        .eq('status', 'active')
        .in('round_id', roundIds.length > 0 ? roundIds : [nilId]),
      // Who is in which team, on every sheet. A trip can run a league between
      // fours and a knockout between pairings, so this cannot be a field on
      // the player — see lib/teamSets.ts.
      fetchMemberships(trip.id, db),
      // Leaderboard nicknames, on their own and fail-soft: naming the column
      // in the players select above would fail the whole roster on a
      // database that has not run migration 047, and a board without
      // nicknames still stands.
      db.from('players').select('id, nickname').eq('trip_id', trip.id),
      // A Golf Ireland league's linked players — the mark beside their
      // names. No query unless the league reads Golf Ireland.
      golfIrelandLinkedIds(trip.id, (trip as { bracket_setup?: unknown }).bracket_setup),
      // Its Golf Ireland cards, each on the round it was played as — read
      // on the server, which alone can (lib/golfIrelandCards.ts).
      readRoundCards(trip.id, leagueSetup, rounds),
      // An event's players' own colours, on their own and fail-soft
      // (migration 063). A trip offers no picker, so it asks for nothing.
      isEvent((trip as { kind?: unknown }).kind)
        ? db.from('players').select('id, colour').eq('trip_id', trip.id)
        : Promise.resolve({ data: null }),
    ])

  // The reads a board cannot stand without. Nicknames and colours are
  // fail-soft by design (a database without their migrations), as are the
  // memberships and the Golf Ireland reads, which answer empty themselves.
  const teams       = must('teams', teamsRes)
  const players     = must('players', playersRes)
  const holes       = must('holes', holesRes)
  const scores      = must('scores', scoresRes)
  const liveScores  = must('live scores', liveScoresRes)
  const hcps        = must('handicaps', hcpsRes)
  const tees        = must('tees', teesRes)
  const open        = must('live rounds', openRes)

  const boards = boardsOf(trip)

  // A Dynamic Overall Leaderboard's Matches sessions: each match and where
  // it stands, read on the server — what the Overall counts them from.
  const sessionMatches = overallOf(boards) && boards.some(b => b.competition === 'matches')
    ? await readSessionResults(db, trip, boards,
        players as { id: string; name: string; handicap: number | null; gender: string }[],
        { teams: teams as { id: string; name: string }[], memberships })
        .catch(e => { throw new BoardReadFailed('session matches', e) })
    : []

  return {
    bracket: false as const,
    trip, rounds, leagueSetup, boards,
    teams, players, holes, scores, liveScores, hcps, tees, open,
    memberships,
    nicknames: (nicknamesRes.data ?? []) as { id: string; nickname: string | null }[],
    picks: picksRes.data as { id: string; colour?: string | null }[] | null,
    giLinked, roundCards, sessionMatches,
  }
}

export type BoardCopy = Awaited<ReturnType<typeof readBoard>>

/** One per server: every look at every event's board goes through it. */
const keeper = makeCopyKeeper<BoardCopy>({
  maxAgeMs: GOLF_BOARD_SECONDS * 1000,
  holdMs: HOLD_MS,
  // An event that is not there now is not shown from an older copy.
  fallBackOn: e => !(e instanceof NoSuchBoard),
})

/**
 * The board for `tripCode` — the shared copy, or one fresh read when the
 * copy is older than `GOLF_BOARD_SECONDS`. `null` when the code has no
 * event, which the page answers with notFound as it always has. A failed
 * read with no copy to fall back on throws, to the site's error screen —
 * never an empty board.
 */
export async function boardCopy(tripCode: string): Promise<BoardCopy | null> {
  try {
    return await keeper.look(tripCode, () => readBoard(tripCode))
  } catch (e) {
    if (e instanceof NoSuchBoard) return null
    throw e
  }
}
