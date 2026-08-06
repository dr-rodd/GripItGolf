// Raw database rows → the context a leaderboard is built from.
//
// `buildRows` takes a `RowContext`: players, teams, memberships, holes,
// rounds, every score resolved from both tables, and two maps of handicaps.
// Assembling one is where the competition's rules quietly live — which
// version of a score counts, what a handicap really was before it was
// rounded, whose card is still open — and it is **the only place that
// assembly happens**.
//
// That matters more than it sounds. Two screens ask the same question: the
// leaderboard, which is a client component handed its rows as props, and the
// trip hub, which is a server component that fetches its own. They once had
// an assembly apiece, copied from one another. They agreed on the day they
// were written and had already drifted by the time anybody looked — see the
// `legacyTeamScoring` note on `buildRowContext` below.
//
// So: **fetching stays with each caller, deciding never does.** The two get
// their rows in whatever way suits them and hand them to one function.
//
// Pure. No I/O — the caller does the queries and hands the rows in.

import type {
  ResolvedScore, RowHole, RowRound, RowContext, RowPlayer, RowTeam,
} from './boardRows'
import type { Membership } from './teamSets'
import type { TeamScoring } from './teamScoring'
import { exactCourseHandicap, type TeeRating } from './courseHandicap'

/** A committed score, as `scores` stores it. */
export type ScoreRow = {
  player_id: string
  round_id: string
  hole_id: string
  gross_score: number | null
  stableford_points: number | null
  no_return: boolean
}

/** An in-progress score, as `live_scores` stores it — keyed by hole *number*. */
export type LiveScoreRow = {
  player_id: string
  round_id: string
  hole_number: number
  gross_score: number | null
  stableford_points: number | null
}

export type HandicapRow = {
  round_id: string
  player_id: string
  playing_handicap: number
  tee_id?: string | null
}

export type TeeRow = TeeRating & { id: string }

/**
 * Committed and in-progress scores as one list.
 *
 * A committed score wins wherever both exist: the card was signed, and the
 * live row behind it is a leftover. `live: true` is what makes a round read
 * as how far ahead of level it stands rather than as a finished total.
 *
 * A live row is matched to its hole by number within the round's course,
 * because `live_scores` has no hole id — that is the shape of the table, not
 * a shortcut taken here.
 */
export function resolveScores(
  scores: readonly ScoreRow[],
  liveScores: readonly LiveScoreRow[],
  holes: readonly RowHole[],
  courseByRound: ReadonlyMap<string, string>,
): ResolvedScore[] {
  const holeById = new Map(holes.map(h => [h.id, h]))
  const out: ResolvedScore[] = []
  const seen = new Set<string>()

  for (const s of scores) {
    const hole = holeById.get(s.hole_id)
    if (!hole) continue
    seen.add(`${s.player_id}:${s.round_id}:${hole.hole_number}`)
    out.push({
      playerId: s.player_id,
      roundId: s.round_id,
      holeId: s.hole_id,
      holeNumber: hole.hole_number,
      gross: s.no_return ? null : s.gross_score,
      points: s.stableford_points ?? 0,
      noReturn: s.no_return,
      live: false,
    })
  }

  const byCourseAndNumber = new Map(holes.map(h => [`${h.course_id}:${h.hole_number}`, h]))

  for (const ls of liveScores) {
    if (seen.has(`${ls.player_id}:${ls.round_id}:${ls.hole_number}`)) continue
    if (ls.gross_score == null) continue
    const courseId = courseByRound.get(ls.round_id)
    const hole = courseId ? byCourseAndNumber.get(`${courseId}:${ls.hole_number}`) : undefined
    if (!hole) continue
    out.push({
      playerId: ls.player_id,
      roundId: ls.round_id,
      holeId: hole.id,
      holeNumber: ls.hole_number,
      gross: ls.gross_score,
      points: ls.stableford_points ?? 0,
      noReturn: false,
      live: true,
    })
  }

  return out
}

/** Playing handicaps as stored — whole numbers — keyed `${roundId}:${playerId}`. */
export function handicapMap(rows: readonly HandicapRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const h of rows) m.set(`${h.round_id}:${h.player_id}`, h.playing_handicap)
  return m
}

/**
 * The same handicaps before they were rounded, where the tee is known.
 *
 * A board playing off a percentage needs the real course handicap, not the
 * whole number stored beside it — 11.63 is stored as 12, and 90% of those
 * two are a shot apart. Rounds with no tee recorded are absent, and the
 * stored whole number is the fallback: it is all that was ever known.
 */
export function exactHandicapMap(
  rows: readonly HandicapRow[],
  tees: readonly TeeRow[],
  indexByPlayer: ReadonlyMap<string, number | null>,
): Map<string, number> {
  const teeById = new Map(tees.map(t => [t.id, t]))
  const m = new Map<string, number>()
  for (const h of rows) {
    const tee = h.tee_id ? teeById.get(h.tee_id) : undefined
    const index = indexByPlayer.get(h.player_id)
    if (!tee || index == null) continue
    m.set(`${h.round_id}:${h.player_id}`, exactCourseHandicap(index, tee))
  }
  return m
}

/**
 * Rounds in the order they are played, which is the order a board columns
 * them — and the order the leaderboard prints them across the top.
 *
 * Generic over the row so both callers get their own shape back: the board
 * needs only an id and a number, while the screen also carries the course
 * the round is played on.
 */
export function sortRounds<T extends RowRound>(rounds: readonly T[]): T[] {
  return [...rounds].sort((a, b) => a.round_number - b.round_number)
}

// ─── The one assembly ──────────────────────────────────────

/** Everything the two callers have between them, as their queries return it. */
export type RowContextInput = {
  players: RowPlayer[]
  teams: RowTeam[]
  memberships: Membership[]
  holes: RowHole[]
  /** In any order — they are sorted here. */
  rounds: RowRound[]
  /** Round id → the id of the course it is played on. */
  courseByRound: ReadonlyMap<string, string>
  scores: readonly ScoreRow[]
  liveScores: readonly LiveScoreRow[]
  roundHandicaps: readonly HandicapRow[]
  /** Ratings only. Read by boards playing off a percentage of the handicap. */
  tees: readonly TeeRow[]
  /** Rounds with a scorecard open right now. */
  activeRoundIds: readonly string[]
  /** Players with a card open right now, from the locks on those rounds. */
  livePlayerIds: readonly string[]
  /**
   * The trip's old single team-scoring setting, or null.
   *
   * **Supplied by the caller, deliberately, and this is the sharp edge of
   * the whole module.** It should be the trip's setting only when the boards
   * were derived from `trips.formats` rather than chosen — `isLegacy(stored)`
   * — because a trip that has since picked real boards must not be scored on
   * options the new model never asked for.
   *
   * It is an input rather than something worked out here because the two
   * callers do not pass the same thing today, and unifying them silently
   * inside an extraction would have hidden a real behaviour change inside a
   * commit that claimed to move code and nothing else.
   */
  legacyTeamScoring: TeamScoring | null
}

/**
 * The context a board is built from.
 *
 * Everything conditional in here is conditional for a reason, and the
 * reasons are on the functions above: a committed score always beats an
 * in-progress one for the same hole, a score whose hole is not in the list
 * is dropped rather than guessed at, and a handicap is only rebuilt
 * unrounded where the tee it was played off was actually recorded.
 */
export function buildRowContext(input: RowContextInput): RowContext {
  // ── Only a card that is open counts as in progress ──
  //
  // `live_scores` has no foreign key to `live_rounds`: migration 003 rekeyed
  // it to (player_id, round_id, hole_number), and only `live_player_locks`
  // cascades when a session ends. So a card half-entered and abandoned leaves
  // its holes in the table for good, and the hourly cleanup deliberately will
  // not close a session that has any scores against it.
  //
  // Read back without this filter, those rows are indistinguishable from a
  // card being played right now: they stand on the leaderboard as a partial
  // score, they mark the round in play, and — since the round summary — they
  // give a round a podium nobody earned.
  //
  // A live score therefore only counts while its round actually has a card
  // open on it. The orphaned rows stay in the table and stop being read,
  // which is the safe direction: nothing is deleted on the strength of an
  // inference about a session that ended.
  const open = new Set(input.activeRoundIds)
  const liveScores = input.liveScores.filter(s => open.has(s.round_id))

  return {
    players: input.players,
    teams: input.teams,
    memberships: input.memberships,
    holes: input.holes,
    rounds: sortRounds(input.rounds),
    resolved: resolveScores(
      input.scores, liveScores, input.holes, input.courseByRound,
    ),
    hcpFor: handicapMap(input.roundHandicaps),
    exactHcpFor: exactHandicapMap(
      input.roundHandicaps,
      input.tees,
      new Map(input.players.map(p => [p.id, p.handicap])),
    ),
    // A round is in play when a card is open on it. It used to also count a
    // round with uncommitted scores against it, which is the same phantom
    // seen from the other side — an abandoned card left its round reading as
    // in play for the rest of the trip.
    liveRoundIds: new Set(input.activeRoundIds),
    livePlayerIds: new Set(input.livePlayerIds),
    legacyTeamScoring: input.legacyTeamScoring,
  }
}
