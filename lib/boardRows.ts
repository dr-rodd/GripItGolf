// Turning scorecards into a leaderboard.
//
// One function — `buildRows` — takes a single leaderboard and the trip's
// scores, and returns the rows for that board. Everything it needs to know
// comes off the leaderboard itself: how it is scored, what it discards, what
// each position pays, how a team's members combine.
//
// That is the whole reason `lib/leaderboards.ts` exists. Before it, discard
// was one number for the trip and the team format was one setting for the
// trip, so two boards on the same trip could not be scored differently —
// running Stableford keeping every card alongside Strokes dropping the worst
// was not expressible, it was simply one setting applied twice.
//
// Pure. No I/O, no React.

import type { Leaderboard } from './leaderboards'
import { FULL_ALLOWANCE, allowanceOf, allowedHandicap } from './handicapAllowance'
import { shotsReceived } from './handicap'
import { quotaPoints, quotaTarget, quotaScaleOf } from './quota'
import { setOf, teamsOnSheet, membersOf, type Membership } from './teamSets'
import {
  type TeamScoring, type TeamScoreInput, type ScoringBasis,
  DEFAULT_TEAM_SCORING, teamRoundPoints, teamHolePoints,
} from './teamScoring'
import { shortNames } from './matchplayEntrants'
import { TAG_SET, tagRoundScore, countingPlayers } from './tagBoards'
import { isTagBoard, tagCountOf } from './leaderboards'
import {
  resolveCustomPoints, totalAfterDiscard, discardedIndices,
} from './customPoints'
import {
  type Countback, type Segment, type Placeable, type Placing,
  SEGMENTS, segmentFrom, countbackOf, splitBy, compareCountback, earlierSegment,
  placeRound, tieBreakOf, overallTieOf,
} from './tiebreak'

// ─── What a board is built from ────────────────────────────────

export type RowPlayer = {
  id: string
  name: string
  handicap: number | null
  gender: string
}

export type RowTeam = {
  id: string
  name: string
  color: string
  /** Which sheet this team is on. Absent means the trip's first. */
  team_set?: string | null
}

export type RowHole = {
  id: string
  hole_number: number
  par: number
  stroke_index: number
  course_id: string
  par_ladies?: number | null
  stroke_index_ladies?: number | null
}

export type RowRound = {
  id: string
  round_number: number
  /**
   * A casual round: scored as usual, kept off every board.
   *
   * `buildRows` drops these and their scores before any board reads them —
   * the one place that rule lives. A round summary still shows its own
   * result: `fetchRoundRows` clears the flag for its single round, the same
   * way it drops the discard rule, because a round's result is that round's
   * result whether or not the trip is counting it.
   *
   * Optional so every existing caller's rows still fit; absent means the
   * query never asked, which reads as counting — what every round did
   * before the flag existed.
   */
  casual?: boolean
  /** Whether a casual round's cards still feed the stats. Boards never read it. */
  casual_stats?: boolean
}

/** A score resolved from either the committed or the in-progress table. */
export type ResolvedScore = {
  playerId: string
  roundId: string
  holeId: string
  holeNumber: number
  gross: number | null
  points: number
  noReturn: boolean
  /**
   * Still in the in-progress table — the card has not been finalised.
   *
   * This is what decides whether a round shows green and reads as how far
   * ahead of level it stands, or plain and reads as its total.
   */
  live: boolean
  /**
   * Putts on the hole, and where the tee shot finished.
   *
   * Optional because no board reads them and most callers do not select the
   * columns: absent means the query never asked, null means it asked and
   * nobody answered. Only lib/holeStats.ts reads them.
   *
   * They ride on `ResolvedScore` rather than being fetched separately so
   * they inherit the three rules that already live in `resolveScores` — a
   * committed score beats an in-progress one, a score whose hole is not in
   * the list is dropped, and a live score counts only while its round has a
   * card open on it. All three are rules a putting average needs just as
   * much as a leaderboard does.
   */
  putts?: number | null
  fairway?: 'left' | 'fairway' | 'right' | null
}

/** One line on the board — a player or a team, depending on the board. */
export type BoardRow = {
  id: string
  name: string
  subLabel: string
  color?: string
  perRound: Record<string, number>
  /**
   * Rounds this row actually took part in. A zero in `perRound` is a real
   * score for these and a blank for any other round — losing every match is
   * not the same as not turning up.
   */
  playedRounds: string[]
  /** Rounds set aside by this board's discard rule — shown struck through. */
  droppedRounds?: string[]
  /**
   * The total with nothing set aside.
   *
   * Present only when this board's discard rule actually dropped a round
   * from this row, so its absence is the reliable "nothing was discarded"
   * answer and the leaderboard's Discard toggle keys off it.
   *
   * `total` stays the competition's total — after the discard — because that
   * is what decides the trip and what every other reader of a board row
   * (the hub's standing line, a round podium) is asking for. This is the
   * second figure, for the one screen that offers to show its working.
   */
  totalAll?: number
  /** Rounds with a card still open. */
  liveRounds?: string[]
  /**
   * How far ahead of level a round stands while it is in play. Against two
   * points a hole on Stableford, against par on Strokes, against the
   * player's own quota on Quota — where it is simply the score, negative
   * while points are still owed. Absent where the question has no meaning —
   * a prize table has no level to be ahead of.
   */
  relativeByRound?: Record<string, number>
  total: number
  isLive: boolean
  /** Whose card the scorecard sheet shows when this row is opened. */
  playerIds: string[]
  /** Hero mode: who carried the team, per round. */
  heroByRound?: Record<string, string | null>

  /**
   * The place this row finished, counting from 1 — shared where a tie stands.
   *
   * Stamped by whichever of the two orderings the board is showing, so it is
   * always the position beside the total on screen rather than the index of
   * the row in an array. Two level on a board that leaves ties standing are
   * both 1st and the next row is 3rd.
   */
  place: number

  /**
   * The closing stretch that split this row from the one level with it, on
   * the total — 9, 6, 3 or 2. See lib/tiebreak.ts.
   *
   * Absent unless a countback actually decided it, which is what makes it
   * safe to render as a claim that the card settled this.
   */
  tieBadge?: Segment
  /**
   * The round whose card that countback was read off.
   *
   * Set with `tieBadge`, and only there. The overall tie is broken on one
   * round — the last both played and neither dropped — and saying which is
   * what lets the round's own tile carry the note. Without it the fact would
   * have nowhere to live once the badge came off the board's total.
   */
  tieBadgeRoundId?: string
  /** The same, per round, where a countback decided what that round paid. */
  tieBadgeByRound?: Record<string, Segment>
  /**
   * What this row scored over each closing stretch, per round.
   *
   * Present only on a board that breaks its **overall** tie on countback, and
   * that is the whole of what it is for: `orderRowsUndiscarded` reorders rows
   * it is handed as props, with no context to consult, so the cards have to
   * travel with them. A board that leaves the total level carries none, which
   * is why both orderings agree without being told the setting twice.
   */
  countbackByRound?: Record<string, Countback>
}

export type RowContext = {
  players: RowPlayer[]
  /** Every team on the trip, across every sheet. A board takes its own. */
  teams: RowTeam[]
  /**
   * Who is in which team, on every sheet.
   *
   * Not a field on the player: a trip can run a league between fours and a
   * knockout between pairings, so one person holds two places at once. Which
   * of them counts is decided by the board — see lib/teamSets.ts.
   */
  memberships: Membership[]
  holes: RowHole[]
  /** In round order. */
  rounds: RowRound[]
  resolved: ResolvedScore[]
  /** Playing handicap as stored — a whole number — keyed `${roundId}:${playerId}`. */
  hcpFor: Map<string, number>
  /**
   * The same handicaps before rounding, where the tee they were played off is
   * known. Same keys.
   *
   * A board's allowance is a percentage of the real course handicap, not of
   * the whole number stored beside it — 11.63 shows as 12, but 90% of those
   * two are 10 and 11. `round_handicaps` cannot hold the unrounded figure
   * (the Postgres trigger reads that column and disagrees with itself about
   * fractions), so it is worked out again here from the tee recorded against
   * the round.
   *
   * Absent for a round whose handicap row was written before a tee was put
   * against it — `hcpFor` is the fallback, and is all that was ever known
   * about those.
   */
  exactHcpFor?: Map<string, number>
  /** Rounds with a card open or uncommitted scores against them. */
  liveRoundIds: Set<string>
  /**
   * Players with a scorecard open right now — a `live_player_locks` row on a
   * session still `active`.
   *
   * Per player, not per round. A row used to count as live because *some*
   * round was in play, so every player on the trip wore the live dot the
   * moment anyone teed off, and kept it after their own card was signed.
   * Not everyone plays every round, and a finished card is not live.
   */
  livePlayerIds: Set<string>
  /**
   * The trip's old single team-scoring setting, when these boards were
   * derived from `trips.formats` rather than chosen as leaderboards. It
   * carries options the new model does not ask for — how many scores count
   * on a hole, the grandstand finish — so a trip already running one keeps
   * scoring the way it always has.
   */
  legacyTeamScoring: TeamScoring | null
}

// ─── Handicap arithmetic ───────────────────────────────────────

/**
 * Re-exported, not defined here.
 *
 * It lives in lib/handicap.ts because a plus handicap gives shots back rather
 * than receiving them, and that is a fact about a handicap rather than about a
 * leaderboard. It was written out five times across the app and every copy had
 * the plus case wrong.
 */
export { shotsReceived }

export function effectivePar(hole: RowHole, gender: string): number {
  return gender === 'F' && hole.par_ladies != null ? hole.par_ladies : hole.par
}

export function effectiveSI(hole: RowHole, gender: string): number {
  return gender === 'F' && hole.stroke_index_ladies != null
    ? hole.stroke_index_ladies
    : hole.stroke_index
}

const firstName = (n: string) => n.split(' ')[0]

// ─── The handicap a board scores off ───────────────────────────
//
// A board's allowance is applied here, at the moment the cards are read, and
// nowhere else. What was written stays written at the full handicap — see
// lib/handicapAllowance.ts for why that is the only arrangement under which a
// trip can run two boards on two different allowances.
//
// Every board takes the same handicap for a player in a round, whatever its
// allowance: the real course handicap off the tee they played, not the whole
// number snapshotted beside it. Those two can differ, because `round_handicaps`
// is seeded with the player's index long before a tee is chosen. Preferring the
// snapshot on some boards and the real figure on others would put one round in
// two places on two tabs of the same page.
//
// Stableford points at the full handicap still come from the trigger, which is
// canonical. That is not an exception to the above: the card writes the
// handicap the trigger reads, so once both are working off the tee they agree
// by construction. A reduced board has no stored answer to agree with, and
// works its points out from the gross instead.

/**
 * The handicap this board scores a player off, for this round.
 *
 * The unrounded course handicap is preferred, because that is what an
 * allowance is a percentage of. Behind it: the whole number snapshotted in
 * `round_handicaps`, and behind that a player's own handicap, for a round
 * that never got a snapshot at all. The allowance is applied to whichever was
 * found, and the result is always whole — `shotsReceived` splits a handicap
 * into whole shots and a remainder and would read a fraction as a different
 * player.
 */
function boardHandicap(
  ctx: RowContext, roundId: string, playerId: string,
  fallback: number | null | undefined, allowance: number,
): number {
  const key = `${roundId}:${playerId}`
  return allowedHandicap(
    ctx.exactHcpFor?.get(key) ?? ctx.hcpFor.get(key) ?? fallback ?? 0,
    allowance,
  )
}

/**
 * What a hole is worth in Stableford points on this board.
 *
 * At the full handicap this is the number already stored — the Postgres
 * trigger's for a committed card, the scoring card's own for one still in
 * play. That trigger is canonical (see CLAUDE.md), and the two agree by
 * construction now that both are working off the same course handicap: what
 * the card writes to `round_handicaps` is what the trigger reads.
 *
 * Under a reduction there is no stored answer to use, because the reduction
 * belongs to the board rather than to the card, so the points are worked out
 * from the gross. Which is the only figure a reduction never changes.
 */
function boardPoints(
  s: ResolvedScore, hole: RowHole | undefined, gender: string,
  handicap: number, allowance: number,
): number {
  if (allowance === FULL_ALLOWANCE) return s.points
  if (!hole || s.noReturn || s.gross == null) return 0
  const par = effectivePar(hole, gender)
  const nett = s.gross - shotsReceived(handicap, effectiveSI(hole, gender))
  return Math.max(0, par + 2 - nett)
}

/**
 * Every score as this board reads it — points restated at its handicap.
 *
 * `buildRows` uses this internally. It is exported for the scorecard sheet
 * that opens off a board row: a board totalling 34 whose card adds up to 36 is
 * a bug report, and the fix is for both to be asking the same question.
 */
export function scoresForBoard(lb: Leaderboard, ctx: RowContext): ResolvedScore[] {
  const allowance = allowanceOf(lb)
  const quota = lb.scoring === 'quota'
  if (allowance === FULL_ALLOWANCE && !quota) return ctx.resolved

  const holeById = new Map(ctx.holes.map(h => [h.id, h]))
  const playerById = new Map(ctx.players.map(p => [p.id, p]))

  return ctx.resolved.map(s => {
    const player = playerById.get(s.playerId)
    const gender = player?.gender ?? 'M'
    // A quota board's per-hole points come off the gross against par and
    // nothing else — the handicap has already spoken, once, in the target.
    // Restated even at the full allowance: the stored points are Stableford's.
    if (quota) {
      const hole = holeById.get(s.holeId)
      return {
        ...s,
        points: hole
          ? quotaPoints(s.noReturn ? null : s.gross, effectivePar(hole, gender),
            quotaScaleOf(lb))
          : 0,
      }
    }
    const hcp = boardHandicap(ctx, s.roundId, s.playerId, player?.handicap, allowance)
    return { ...s, points: boardPoints(s, holeById.get(s.holeId), gender, hcp, allowance) }
  })
}

/**
 * The handicap this board shows for a player in a round — the same number the
 * points above were worked out from.
 *
 * Exported so the scorecard sheet can print it. It used to print the stored
 * snapshot, which is neither reduced by the board's allowance nor necessarily
 * the handicap the round was played off.
 */
export function boardHandicapFor(
  lb: Leaderboard, ctx: RowContext, roundId: string, playerId: string,
): number | null {
  const player = ctx.players.find(p => p.id === playerId)
  const key = `${roundId}:${playerId}`
  if (!ctx.exactHcpFor?.has(key) && !ctx.hcpFor.has(key) && player?.handicap == null) return null
  return boardHandicap(ctx, roundId, playerId, player?.handicap, allowanceOf(lb))
}

// ─── How a team's members combine ──────────────────────────────

/**
 * The scoring settings a team board runs under.
 *
 * A board names its format, and a better-ball board now names its own
 * options too — `lb.countingScores` and `lb.aggregateFinish`, asked in
 * settings. A trip that was already set up under the old single setting
 * keeps it verbatim, so switching to the new model does not silently
 * re-score rounds that have already been played; a legacy board never
 * carries the per-board answers, so the two cannot clash.
 */
export function teamScoringFor(lb: Leaderboard, legacy: TeamScoring | null): TeamScoring {
  const mode = lb.teamFormat ?? DEFAULT_TEAM_SCORING.mode
  const base = legacy && legacy.mode === mode ? legacy : { ...DEFAULT_TEAM_SCORING, mode }
  // Absent means the default, which is what `base` already holds either way.
  const patch: Partial<TeamScoring> = {}
  if (lb.countingScores !== undefined) patch.countingScores = lb.countingScores
  if (lb.aggregateFinish !== undefined) patch.aggregateFinish = lb.aggregateFinish
  return Object.keys(patch).length > 0 ? { ...base, ...patch } : base
}

/**
 * The team's score on each hole of one round, for the opened scorecard.
 *
 * The same settings, allowance and basis `teamRows` scores the board with —
 * through `teamScoringFor` and `teamScoreInputs`, not a restatement — so the
 * card's right-hand column is the round figure on the board, hole by hole.
 * The card used to sum every member's points on every hole, which is only
 * what aggregate means: on a best-1 better ball it read as counting two
 * while the leaderboard counted one.
 *
 * Null for an individual board, where the player's own points are already
 * the column.
 */
export function teamCardHolePoints(
  lb: Leaderboard, ctx: RowContext, roundId: string, memberIds: string[],
): Map<number, number> | null {
  if (lb.audience !== 'team') return null
  const basis: ScoringBasis = lb.scoring === 'strokes' ? 'strokes' : 'stableford'
  return teamHolePoints(
    memberIds, roundId,
    teamScoreInputs(ctx, allowanceOf(lb)),
    teamScoringFor(lb, ctx.legacyTeamScoring),
    basis,
  )
}


// ─── The two shells ────────────────────────────────────────────

/**
 * The rows for one leaderboard, in finishing order.
 *
 * Two shells, not one per format: an individual board and a team board, each
 * taking how a round is scored and how the rounds add up. Every board a trip
 * can run is a set of arguments to one of these, which is what makes the
 * grid finite — settings selects a cell, it never asks for maths that has to
 * be written.
 *
 * Matchplay returns nothing: a draw is not a table, and it lives on its own
 * route. The caller decides what to show in its place.
 */
export function buildRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  if (lb.competition === 'matchplay') return []
  const counted = withoutCasualRounds(ctx)
  // A tags board is a team board by audience — every predicate on the
  // platform treats it as one — but its rows are built from whole cards
  // rather than a composite one, so it takes its own shell.
  if (isTagBoard(lb)) return tagRows(lb, counted)
  return lb.audience === 'team' ? teamRows(lb, counted) : individualRows(lb, counted)
}

/**
 * The context with casual rounds — and their scores — taken out.
 *
 * This is the only place a round stops counting. Every board on every trip
 * comes through `buildRows`, so filtering here is what makes the leaderboard
 * page, the hub's standing line and a podium agree without each remembering
 * the rule. The scores stay in the database untouched; a casual round's own
 * page still reads them, because `fetchRoundRows` clears the flag first.
 */
function withoutCasualRounds(ctx: RowContext): RowContext {
  if (!ctx.rounds.some(r => r.casual)) return ctx
  const rounds = ctx.rounds.filter(r => !r.casual)
  const counted = new Set(rounds.map(r => r.id))
  return {
    ...ctx,
    rounds,
    resolved: ctx.resolved.filter(s => counted.has(s.roundId)),
  }
}

/**
 * Whether any of these players has a card open right now.
 *
 * Read off the open sessions themselves rather than inferred from a score
 * sitting in a round that happens to be in play — a finalised card leaves its
 * scores behind, and inferring from them marked everybody live for the rest
 * of the trip.
 */
function liveFor(playerIds: string[], ctx: RowContext): boolean {
  return playerIds.some(id => ctx.livePlayerIds.has(id))
}

/** Lowest wins on strokes, so sorting and discarding both reverse. */
const lowerWins = (lb: Leaderboard) => lb.scoring === 'strokes'

/**
 * One round, for one entrant, before the board decides what to do with it.
 *
 * `relative` is how far ahead of level the round stands while it is still
 * being played — against two points a hole on Stableford, against the par of
 * the holes played on strokes. Null where there is no level to be ahead of.
 */
type RoundScore = {
  roundId: string
  score: number
  relative: number | null
  live: boolean
  played: boolean
  heroPlayerId?: string | null
  /**
   * What this round was worth over each closing stretch, in whatever the
   * board is scored on. Only built when the board breaks ties on countback.
   */
  countback?: Countback
}

type Combined = {
  perRound: Record<string, number>
  dropped: string[]
  total: number
  /** Undefined unless something was actually dropped — see `BoardRow.totalAll`. */
  totalAll?: number
  /** Rounds whose prize was settled by a countback, and on which stretch. */
  badges?: Record<string, Segment>
}

/**
 * Whether this board breaks a tie on the **whole trip** by countback.
 *
 * Rounds added up have no back nine, so a board is normally left level there
 * even when every round of it is split — that is what `overallTie` is. The
 * exception is a board counting a single round, where the total is that one
 * card and refusing to read it would be refusing to read the card in front of
 * you. A round summary is exactly that board, which is why a round's own
 * result is always broken the way the trip says rounds are broken.
 */
function breaksOverallTie(lb: Leaderboard, roundCount: number): boolean {
  if (tieBreakOf(lb) !== 'countback') return false
  return overallTieOf(lb) === 'last_round' || roundCount <= 1
}

/**
 * Turn a row's rounds into its columns and its total.
 *
 * This is the second axis, and it is the same for individuals and teams. A
 * board either adds the rounds up — dropping the worst if it says so — or
 * places each round and pays the table.
 */
function combineRounds(
  lb: Leaderboard,
  rows: { id: string; rounds: RoundScore[] }[],
  fieldSize: number,
): Map<string, Combined> {
  const out = new Map<string, Combined>
  const byPosition = lb.combine === 'position'
  const table = byPosition ? resolveCustomPoints(lb.customPoints ?? [], fieldSize) : []

  // Paid by position: each round is placed on its own result, and what shows
  // in the round column is what that position was worth — not the score that
  // earned it, which would leave the total not adding up beside its columns.
  //
  // Placing and paying are one act, because what two level players are worth
  // is the board's tie rule: split them on countback and they take different
  // prizes, leave them level and they share or both take the better one. See
  // lib/tiebreak.ts.
  const awarded = new Map<string, Map<string, Placing>>()
  if (byPosition) {
    const roundIds = new Set(rows.flatMap(r => r.rounds.filter(x => x.played).map(x => x.roundId)))
    for (const roundId of roundIds) {
      const entrants = rows
        .map(r => {
          const rs = r.rounds.find(x => x.roundId === roundId && x.played)
          return rs ? { id: r.id, score: rs.score, countback: rs.countback } : null
        })
        .filter(Boolean) as Placeable[]
      awarded.set(roundId, placeRound(entrants, table, {
        mode: tieBreakOf(lb),
        lowerWins: lowerWins(lb),
      }))
    }
  }

  for (const row of rows) {
    const played = row.rounds.filter(r => r.played)
    const perRound: Record<string, number> = {}
    const badges: Record<string, Segment> = {}
    for (const r of row.rounds) {
      const placing = byPosition ? awarded.get(r.roundId)?.get(row.id) : undefined
      perRound[r.roundId] = byPosition ? placing?.points ?? 0 : r.score
      if (placing?.splitBy) badges[r.roundId] = placing.splitBy
    }

    // Prize points are always higher-is-better, whatever earned them
    const opts = { lowerWins: byPosition ? false : lowerWins(lb) }
    const values = played.map(r => perRound[r.roundId])
    const discard = lb.discardWorst ?? 0
    const dropped = discardedIndices(values, discard, opts).map(i => played[i].roundId)

    out.set(row.id, {
      perRound,
      dropped,
      total: totalAfterDiscard(values, discard, opts),
      // Nothing dropped, nothing to say — and the same function does both
      // totals rather than a bare `reduce` growing up beside it as a second
      // answer to what a row adds up to.
      totalAll: dropped.length > 0 ? totalAfterDiscard(values, 0, opts) : undefined,
      badges: Object.keys(badges).length > 0 ? badges : undefined,
    })
  }
  return out
}

/**
 * A row before it knows where it finished.
 *
 * The place is not something a row can be built with — it depends on what the
 * row beside it did, and on which of the two totals the board is showing. So
 * it is stamped by `placed`, once the order exists, and this is the shape
 * everything upstream of that works in.
 */
type UnplacedRow = Omit<BoardRow, 'place'>

/**
 * Highest total wins, unless the board is nett strokes added up — over
 * whichever total is being read. Then the cards, then the name.
 *
 * Split out so the leaderboard's Discard toggle can reorder by the all-in
 * total without writing the rule down a second time. There are already two
 * orderings in this codebase and a third would be one too many: this is the
 * *same* ordering asking a different column.
 */
function rowOrder(lb: Leaderboard, totalOf: (r: UnplacedRow) => number) {
  const ascending = lowerWins(lb) && lb.combine !== 'position'
  return (a: UnplacedRow, b: UnplacedRow) =>
    (ascending ? totalOf(a) - totalOf(b) : totalOf(b) - totalOf(a))
      // The cards, where the board reads them. `countbackByRound` is only
      // carried by a board that breaks its overall tie that way, so this is a
      // no-op on every other board without having to ask which it is.
      || compareCountback(...facing(lb, a, b))
      || a.name.localeCompare(b.name)
}

/**
 * The two cards a countback between these rows would read, and which way.
 *
 * **The last round both of them played and neither dropped.** A round the
 * board is not counting cannot decide the board — a discarded round is not
 * part of the total it is being asked to break — and a round only one of them
 * played is not a comparison, it is a card against nothing.
 *
 * The direction is the *scoring's*, not the total's: countback reads cards,
 * so the better back nine is the lower one on a strokes board even where the
 * board itself is paid in prize points and sorted high to low.
 */
function facing(
  lb: Leaderboard, a: UnplacedRow, b: UnplacedRow,
): [Countback | undefined, Countback | undefined, boolean] {
  const { a: ca, b: cb, lower } = facingRound(lb, a, b)
  return [ca, cb, lower]
}

/** The same, and which round it was — for the note that explains the result. */
function facingRound(
  lb: Leaderboard, a: UnplacedRow, b: UnplacedRow,
): { a?: Countback; b?: Countback; lower: boolean; roundId?: string } {
  const lower = lb.scoring === 'strokes'
  if (!a.countbackByRound || !b.countbackByRound) return { lower }
  const shared = a.playedRounds.filter(id =>
    b.playedRounds.includes(id)
    && !a.droppedRounds?.includes(id)
    && !b.droppedRounds?.includes(id))
  // `playedRounds` is built in round order, so the last shared one is the
  // most recent — which is the round a society goes back to.
  const roundId = shared[shared.length - 1]
  if (!roundId) return { lower }
  return { a: a.countbackByRound[roundId], b: b.countbackByRound[roundId], lower, roundId }
}

/** The board's own order: by the competition total, after any discard. */
function sortRows(lb: Leaderboard, rows: UnplacedRow[]): BoardRow[] {
  return placed(lb, rows.sort(rowOrder(lb, r => r.total)), r => r.total)
}

/**
 * The places, and the badges that explain them.
 *
 * Run over rows already in finishing order. Two rows level on the total share
 * a place unless the cards split them, and where the cards did the splitting
 * both sides of the break say so — being put second on countback is as much
 * the card's doing as being put first.
 *
 * Rows are rebuilt rather than stamped in place: these are props by the time
 * the Discard switch reorders them, and writing a place onto the object would
 * change the row the board is still holding.
 */
function placed(
  lb: Leaderboard, rows: UnplacedRow[], totalOf: (r: UnplacedRow) => number,
): BoardRow[] {
  const out: BoardRow[] = rows.map(r => ({ ...r, place: 1 }))
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1], row = out[i]
    // A prize share is a division, so two rows that finished level can land a
    // whisker apart in binary. Level is level.
    if (Math.abs(totalOf(prev) - totalOf(row)) > 1e-9) { row.place = i + 1; continue }
    const read = facingRound(lb, prev, row)
    const split = splitBy(read.a, read.b, read.lower)
    if (!split) {
      // Level, and the cards had nothing to say about it
      row.place = prev.place
      continue
    }
    row.place = i + 1
    // The stretch that placed a row is the first one to split it from anybody
    // — so a row split from the one above on the back 9 and from the one
    // below on the back 3 wears the 9.
    prev.tieBadge = earlierSegment(prev.tieBadge, split.segment)
    prev.tieBadgeRoundId = read.roundId
    row.tieBadge = split.segment
    row.tieBadgeRoundId = read.roundId
  }
  return out
}

/**
 * The same board, ordered as if nothing had been set aside.
 *
 * For the leaderboard's Discard toggle in its off state, where every round
 * counts. A copy rather than a sort in place: these rows are props by the
 * time anything calls this, and sorting them where they lie would reorder
 * the array the board was handed.
 *
 * `totalAll` is absent on any row that had nothing dropped, and `total` is
 * then already the all-in figure — so the fallback is exact, not a guess.
 */
export function orderRowsUndiscarded(lb: Leaderboard, rows: readonly BoardRow[]): BoardRow[] {
  const totalOf = (r: UnplacedRow) => r.totalAll ?? r.total
  return placed(lb, [...rows].sort(rowOrder(lb, totalOf)), totalOf)
}

// ── Individuals ──

/**
 * One player's every round, scored the way this board scores a round.
 *
 * Pulled out of `individualRows` because a tags board needs exactly this
 * and nothing else: a tag's round is a few of its players' rounds added
 * up, so the cards it selects between have to be the same figures the solo
 * board would show. Two implementations of "what did this player score
 * that round" is precisely how a tag total and the solo board beside it
 * would come to disagree about the same card.
 *
 * Players who have not played a hole all trip are dropped, as they always
 * were — an empty row on a leaderboard is somebody who is not in it.
 */
function perPlayerRounds(lb: Leaderboard, ctx: RowContext): {
  player: RowPlayer; rounds: RoundScore[]; holesPlayed: number; gross: number
}[] {
  const holeById = new Map(ctx.holes.map(h => [h.id, h]))
  const strokes = lb.scoring === 'strokes'
  const quota = lb.scoring === 'quota'
  const allowance = allowanceOf(lb)

  // The cards are only read for their closing stretches on a board that
  // breaks ties that way. Everywhere else this is four sums a round nobody
  // would ever look at.
  const reads = tieBreakOf(lb) === 'countback'
  // The board's own scale. A quota is meaningless without one — see
  // lib/quota.ts — and reading it once here keeps every card on one.
  const scale = quotaScaleOf(lb)

  const perPlayer = ctx.players.map(p => {
    let holesPlayed = 0, gross = 0

    const rounds: RoundScore[] = ctx.rounds.map(r => {
      const mine = ctx.resolved.filter(s =>
        s.playerId === p.id && s.roundId === r.id && (!strokes || s.gross != null))
      holesPlayed += mine.length
      const ph = boardHandicap(ctx, r.id, p.id, p.handicap, allowance)

      if (quota) {
        // Points off the gross alone; the handicap enters exactly once, in
        // the target — reduced by the board's allowance like any handicap,
        // so a full-quota and an 85%-quota board read the same cards. A
        // no-return hole earns nothing, as it does on Stableford. Per hole
        // first, like the other scorings: a countback is these same figures
        // cut at the tenth — the target subtracts out of both cards level.
        const perHole = mine.map(s => {
          const hole = holeById.get(s.holeId)
          return {
            n: s.holeNumber,
            v: hole
              ? quotaPoints(s.noReturn ? null : s.gross, effectivePar(hole, p.gender),
                scale)
              : 0,
          }
        })
        const pts = perHole.reduce((sum, h) => sum + h.v, 0)
        const score = pts - quotaTarget(ph)
        return {
          roundId: r.id,
          score,
          // Already a signed distance from the player's own number, so the
          // against-level figure is the score itself — negative while
          // points are still owed
          relative: score,
          live: mine.some(s => s.live),
          played: mine.length > 0,
          countback: reads ? countbackOf(perHole, h => h.n, h => h.v) : undefined,
        }
      }

      if (!strokes) {
        // Per hole first, then totalled — a countback is the same figures cut
        // at the tenth, so working them out twice is how the two would end up
        // disagreeing about a card the board is already showing.
        const perHole = mine.map(s => ({
          n: s.holeNumber,
          v: boardPoints(s, holeById.get(s.holeId), p.gender, ph, allowance),
        }))
        const score = perHole.reduce((sum, h) => sum + h.v, 0)
        return {
          roundId: r.id,
          score,
          // Two points a hole is level, so this is how far ahead they stand
          // on the holes they have actually played
          relative: score - mine.length * 2,
          live: mine.some(s => s.live),
          played: mine.length > 0,
          countback: reads ? countbackOf(perHole, h => h.n, h => h.v) : undefined,
        }
      }

      // Nett per hole, for the same reason
      const perHole = mine.map(s => {
        const hole = holeById.get(s.holeId)
        return {
          n: s.holeNumber,
          v: (s.gross ?? 0)
            - (hole ? shotsReceived(ph, effectiveSI(hole, p.gender)) : 0),
          par: hole ? effectivePar(hole, p.gender) : 0,
        }
      })
      const g = mine.reduce((sum, s) => sum + (s.gross ?? 0), 0)
      const nett = perHole.reduce((sum, h) => sum + h.v, 0)
      // Par of the holes actually played, so a card nine holes in reads
      // against nine holes of par rather than eighteen
      const parPlayed = perHole.reduce((sum, h) => sum + h.par, 0)
      gross += g

      return {
        roundId: r.id,
        score: nett,
        relative: nett - parPlayed,
        live: mine.some(s => s.live),
        played: mine.length > 0,
        countback: reads ? countbackOf(perHole, h => h.n, h => h.v) : undefined,
      }
    })

    return { player: p, rounds, holesPlayed, gross }
  }).filter(r => r.holesPlayed > 0)

  return perPlayer
}

function individualRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  const perPlayer = perPlayerRounds(lb, ctx)

  const combined = combineRounds(lb, perPlayer.map(r => ({ id: r.player.id, rounds: r.rounds })),
    ctx.players.length)

  const rows = perPlayer.map(({ player, rounds }) => {
    const c = combined.get(player.id)!
    // An individual row carries no second line. It used to count the holes
    // and rounds played — "42 holes · 3 rounds" — under every name, which is
    // a lot of type saying something the round columns already show, on the
    // one board that is meant to be read at a glance. What is worth knowing
    // about a round is in that round's own column.
    const row: UnplacedRow = {
      id: player.id,
      name: player.name,
      subLabel: '',
      perRound: c.perRound,
      playedRounds: rounds.filter(r => r.played).map(r => r.roundId),
      droppedRounds: c.dropped,
      liveRounds: rounds.filter(r => r.live).map(r => r.roundId),
      relativeByRound: relatives(lb, rounds),
      total: c.total,
      totalAll: c.totalAll,
      isLive: liveFor([player.id], ctx),
      playerIds: [player.id],
      tieBadgeByRound: c.badges,
      countbackByRound: cardsForOrdering(lb, ctx, rounds),
    }
    return row
  })

  return sortRows(lb, rows)
}

/**
 * The cards a row carries so the board can be reordered without its context.
 *
 * Nothing at all unless this board breaks the **overall** tie on countback —
 * see `breaksOverallTie`. A board that leaves the total level has no use for
 * them, and carrying them anyway would mean `orderRowsUndiscarded`, which is
 * handed rows and nothing else, silently breaking a tie the board had been
 * told to leave alone.
 */
function cardsForOrdering(
  lb: Leaderboard, ctx: RowContext, rounds: readonly RoundScore[],
): Record<string, Countback> | undefined {
  if (!breaksOverallTie(lb, ctx.rounds.length)) return undefined
  const out: Record<string, Countback> = {}
  for (const r of rounds) if (r.played && r.countback) out[r.roundId] = r.countback
  return out
}

/**
 * The against-level figures, but only where they mean something.
 *
 * A board paid by position has no level: what is showing in that column is
 * what a finishing place was worth, and a signed number beside it would be
 * answering a question nobody asked.
 */
function relatives(lb: Leaderboard, rounds: RoundScore[]): Record<string, number> | undefined {
  if (lb.combine === 'position') return undefined
  const out: Record<string, number> = {}
  for (const r of rounds) if (r.relative !== null) out[r.roundId] = r.relative
  return out
}

// ── Teams ──

function teamRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  const scoring = teamScoringFor(lb, ctx.legacyTeamScoring)
  const basis: ScoringBasis = lb.scoring === 'strokes' ? 'strokes' : 'stableford'
  const inputs = teamScoreInputs(ctx, allowanceOf(lb))

  // This board's own teams. A trip running a league and a knockout between
  // different sides has two sheets of them, and ranking one board against
  // the other's teams would produce a table of strangers.
  const sheet = setOf(lb)
  const teams = teamsOnSheet(ctx.teams, sheet) as RowTeam[]

  // A team's back nine is its team score over those holes, worked out under
  // the same format — the composite card, the hero's card, everyone but the
  // worst — rather than a sum of the members' own back nines. The format is
  // what makes a team score a team score, and dropping it for the countback
  // would answer a different question in the one place it matters most.
  const reads = tieBreakOf(lb) === 'countback'
  const bySegment = reads
    ? SEGMENTS.map(seg =>
      [seg, inputs.filter(s => s.holeNumber >= segmentFrom(seg))] as const)
    : []

  const perTeam = teams.map(team => {
    const memberIds = membersOf(ctx.memberships, team.id)
    const rounds: RoundScore[] = ctx.rounds.map(r => {
      const res = teamRoundPoints(memberIds, r.id, inputs, scoring, basis)
      const countback = reads
        ? Object.fromEntries(bySegment.map(([seg, sub]) =>
          [seg, teamRoundPoints(memberIds, r.id, sub, scoring, basis).score])) as Countback
        : undefined
      return {
        roundId: r.id,
        score: res.score,
        countback,
        // No level here: what counts as level depends on the format and the
        // team's size, so a signed number would mislead. Green still says
        // the total can move.
        relative: null,
        live: ctx.resolved.some(s =>
          memberIds.includes(s.playerId) && s.roundId === r.id && s.live),
        played: res.played,
        heroPlayerId: res.heroPlayerId,
      }
    })
    return { team, memberIds, rounds }
  }).filter(t => t.memberIds.length > 0)

  const combined = combineRounds(lb, perTeam.map(t => ({ id: t.team.id, rounds: t.rounds })),
    teams.length)

  const rows = perTeam.map(({ team, memberIds, rounds }) => {
    const c = combined.get(team.id)!
    const members = ctx.players.filter(p => memberIds.includes(p.id))
    // A board can name its rows by the players instead of the team — for the
    // group that never christened its teams. `shortNames` rather than bare
    // first names, so two Rosses on one team stay two different people.
    const byPlayers = lb.hideTeamName === true
    const row: UnplacedRow = {
      id: team.id,
      name: byPlayers ? shortNames(members.map(m => m.name)).join(', ') : team.name,
      color: team.color,
      // Empty rather than the members again: with the players already on the
      // top line, the same names underneath would say nothing twice.
      subLabel: byPlayers ? '' : members.map(m => firstName(m.name)).join(', '),
      perRound: c.perRound,
      playedRounds: rounds.filter(r => r.played).map(r => r.roundId),
      droppedRounds: c.dropped,
      liveRounds: rounds.filter(r => r.live).map(r => r.roundId),
      total: c.total,
      totalAll: c.totalAll,
      isLive: liveFor(memberIds, ctx),
      playerIds: memberIds,
      heroByRound: Object.fromEntries(rounds.map(r => [r.roundId, r.heroPlayerId ?? null])),
      tieBadgeByRound: c.badges,
      countbackByRound: cardsForOrdering(lb, ctx, rounds),
    }
    return row
  })

  return sortRows(lb, rows)
}

// ── Tags ──

/**
 * The sides, ranked — a tag's round is a few of its players' rounds.
 *
 * The shape of a team board's shell, with one difference that is the whole
 * feature: a tag's round score is built from **whole cards** rather than a
 * composite one, so the cards it chooses between are exactly the figures
 * `individualRows` would print for those players. Which few count is
 * lib/tagBoards.ts's rule, and the only copy of it.
 *
 * Everything after that is the pipeline every board shares — `combineRounds`
 * for the totals and the discard, `sortRows` for the order and the places —
 * so a tags board inherits the tie rules, the prize tables and the Discard
 * switch without any of them being written down again. Paying by finishing
 * position each day is not a mode here for exactly that reason: it is
 * `combine: 'position'`, and it already works.
 */
function tagRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  const mode = lb.tagMode!
  const count = tagCountOf(lb)
  const basis: ScoringBasis = lb.scoring === 'strokes' ? 'strokes' : 'stableford'

  // Whole cards, scored exactly as the solo board scores them.
  const perPlayer = perPlayerRounds(lb, ctx)
  const byPlayer = new Map(perPlayer.map(p => [p.player.id, p]))

  // The tags themselves, on the one sheet they ever live on.
  const tags = teamsOnSheet(ctx.teams, TAG_SET) as RowTeam[]
  const reads = tieBreakOf(lb) === 'countback'

  const perTag = tags.map(tag => {
    const memberIds = membersOf(ctx.memberships, tag.id)
    const members = memberIds.map(id => byPlayer.get(id)).filter(Boolean) as typeof perPlayer

    const rounds: RoundScore[] = ctx.rounds.map(r => {
      // Only cards actually played are candidates. A tag whose third
      // player is not out yet counts its best two of two, not its best two
      // of two-and-a-blank — a missing card is not a nought.
      const cards = members
        .map(m => ({ player: m.player, rs: m.rounds.find(x => x.roundId === r.id) }))
        .filter(c => c.rs?.played) as { player: RowPlayer; rs: RoundScore }[]

      const counting = countingPlayers(
        cards.map(c => ({ playerId: c.player.id, score: c.rs.score })),
        basis, mode, count,
      )
      const countingSet = new Set(counting)

      // The countback is the closing stretches of the cards that COUNTED,
      // not of every card the tag has. What the tag scored over the back
      // nine is what its counting players scored there — reading the rest
      // would answer a different question than the total did.
      const countback = reads
        ? SEGMENTS.reduce((acc, seg) => {
          acc[seg] = cards
            .filter(c => countingSet.has(c.player.id))
            .reduce((sum, c) => sum + (c.rs.countback?.[seg] ?? 0), 0)
          return acc
        }, {} as Countback)
        : undefined

      return {
        roundId: r.id,
        score: tagRoundScore(cards.map(c => c.rs.score), basis, mode, count),
        countback,
        // No level to be ahead of: how many cards count decides what level
        // would even mean, and it changes with the tag's turnout. Green
        // still says the total can move.
        relative: null,
        live: cards.some(c => c.rs.live),
        played: cards.length > 0,
      }
    })

    return { tag, memberIds, rounds }
  }).filter(t => t.memberIds.length > 0)

  const combined = combineRounds(lb, perTag.map(t => ({ id: t.tag.id, rounds: t.rounds })),
    tags.length)

  const rows = perTag.map(({ tag, memberIds, rounds }) => {
    const members = ctx.players.filter(p => memberIds.includes(p.id))
    const c = combined.get(tag.id)!
    const row: UnplacedRow = {
      id: tag.id,
      // A tag always has the name the organiser gave it, so it is never
      // named from its members the way a self-made team is.
      name: tag.name,
      color: tag.color,
      subLabel: `${members.length} player${members.length === 1 ? '' : 's'}`,
      perRound: c.perRound,
      playedRounds: rounds.filter(r => r.played).map(r => r.roundId),
      droppedRounds: c.dropped,
      liveRounds: rounds.filter(r => r.live).map(r => r.roundId),
      total: c.total,
      totalAll: c.totalAll,
      isLive: liveFor(memberIds, ctx),
      playerIds: memberIds,
      tieBadgeByRound: c.badges,
      countbackByRound: cardsForOrdering(lb, ctx, rounds),
    }
    return row
  })

  return sortRows(lb, rows)
}

/**
 * Every score with both a points value and a nett stroke value on it.
 *
 * A team format asks the same question either way — best on the hole, best
 * card, everyone but the worst — so the format code takes both and reads
 * whichever the board is scored on. Working the nett out here means it is
 * done once per page rather than once per team.
 *
 * Both figures are stated at the board's allowance, which is why this is per
 * board rather than per page: a four-ball at 85% and a singles board at 95%
 * read the same cards and must not read the same numbers off them.
 */
function teamScoreInputs(ctx: RowContext, allowance: number): TeamScoreInput[] {
  const holeById = new Map(ctx.holes.map(h => [h.id, h]))
  const genderOf = new Map(ctx.players.map(p => [p.id, p.gender]))
  const handicapOf = new Map(ctx.players.map(p => [p.id, p.handicap]))

  return ctx.resolved.map(s => {
    const hole = holeById.get(s.holeId)
    const gender = genderOf.get(s.playerId) ?? 'M'
    const ph = boardHandicap(ctx, s.roundId, s.playerId, handicapOf.get(s.playerId), allowance)
    const nett = hole && s.gross != null
      ? s.gross - shotsReceived(ph, effectiveSI(hole, gender))
      : undefined
    return {
      playerId: s.playerId,
      roundId: s.roundId,
      holeNumber: s.holeNumber,
      points: boardPoints(s, hole, gender, ph, allowance),
      nett,
    }
  })
}
