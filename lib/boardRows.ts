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
import { setOf, teamsOnSheet, membersOf, type Membership } from './teamSets'
import {
  type TeamScoring, type TeamScoreInput, type ScoringBasis,
  DEFAULT_TEAM_SCORING, teamRoundPoints,
} from './teamScoring'
import {
  resolveCustomPoints, awardRound, totalAfterDiscard, discardedIndices,
} from './customPoints'

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

export type RowRound = { id: string; round_number: number }

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
  /** Rounds with a card still open. */
  liveRounds?: string[]
  /**
   * How far ahead of level a round stands while it is in play. Against two
   * points a hole on Stableford, against par on Strokes. Absent where the
   * question has no meaning — a prize table has no level to be ahead of.
   */
  relativeByRound?: Record<string, number>
  total: number
  isLive: boolean
  /** Whose card the scorecard sheet shows when this row is opened. */
  playerIds: string[]
  /** Hero mode: who carried the team, per round. */
  heroByRound?: Record<string, string | null>
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
  if (allowance === FULL_ALLOWANCE) return ctx.resolved

  const holeById = new Map(ctx.holes.map(h => [h.id, h]))
  const playerById = new Map(ctx.players.map(p => [p.id, p]))

  return ctx.resolved.map(s => {
    const player = playerById.get(s.playerId)
    const gender = player?.gender ?? 'M'
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
 * A board names its format; the options that format takes — how many scores
 * count on a hole, whether the closing holes open up — are not asked for any
 * more. A trip that was already set up under the old single setting keeps it
 * verbatim, so switching to the new model does not silently re-score rounds
 * that have already been played.
 */
export function teamScoringFor(lb: Leaderboard, legacy: TeamScoring | null): TeamScoring {
  const mode = lb.teamFormat ?? DEFAULT_TEAM_SCORING.mode
  if (legacy && legacy.mode === mode) return legacy
  return { ...DEFAULT_TEAM_SCORING, mode }
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
  return lb.audience === 'team' ? teamRows(lb, ctx) : individualRows(lb, ctx)
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
): Map<string, { perRound: Record<string, number>; dropped: string[]; total: number }> {
  const out = new Map<string, { perRound: Record<string, number>; dropped: string[]; total: number }>()
  const byPosition = lb.combine === 'position'
  const table = byPosition ? resolveCustomPoints(lb.customPoints ?? [], fieldSize) : []

  // Paid by position: each round is placed on its own result, and what shows
  // in the round column is what that position was worth — not the score that
  // earned it, which would leave the total not adding up beside its columns.
  const awarded = new Map<string, Map<string, number>>()
  if (byPosition) {
    const roundIds = new Set(rows.flatMap(r => r.rounds.filter(x => x.played).map(x => x.roundId)))
    for (const roundId of roundIds) {
      const standings = rows
        .map(r => {
          const rs = r.rounds.find(x => x.roundId === roundId && x.played)
          return rs ? { playerId: r.id, score: rs.score } : null
        })
        .filter(Boolean) as { playerId: string; score: number }[]
      awarded.set(roundId, awardRound(standings, table, { lowerWins: lowerWins(lb) }))
    }
  }

  for (const row of rows) {
    const played = row.rounds.filter(r => r.played)
    const perRound: Record<string, number> = {}
    for (const r of row.rounds) {
      perRound[r.roundId] = byPosition
        ? awarded.get(r.roundId)?.get(row.id) ?? 0
        : r.score
    }

    // Prize points are always higher-is-better, whatever earned them
    const opts = { lowerWins: byPosition ? false : lowerWins(lb) }
    const values = played.map(r => perRound[r.roundId])
    const discard = lb.discardWorst ?? 0

    out.set(row.id, {
      perRound,
      dropped: discardedIndices(values, discard, opts).map(i => played[i].roundId),
      total: totalAfterDiscard(values, discard, opts),
    })
  }
  return out
}

/** Highest total wins, unless the board is nett strokes added up. */
function sortRows(lb: Leaderboard, rows: BoardRow[]): BoardRow[] {
  const ascending = lowerWins(lb) && lb.combine !== 'position'
  return rows.sort((a, b) =>
    (ascending ? a.total - b.total : b.total - a.total) || a.name.localeCompare(b.name))
}

// ── Individuals ──

function individualRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  const holeById = new Map(ctx.holes.map(h => [h.id, h]))
  const strokes = lb.scoring === 'strokes'
  const allowance = allowanceOf(lb)

  const perPlayer = ctx.players.map(p => {
    let holesPlayed = 0, gross = 0

    const rounds: RoundScore[] = ctx.rounds.map(r => {
      const mine = ctx.resolved.filter(s =>
        s.playerId === p.id && s.roundId === r.id && (!strokes || s.gross != null))
      holesPlayed += mine.length
      const ph = boardHandicap(ctx, r.id, p.id, p.handicap, allowance)

      if (!strokes) {
        const score = mine.reduce(
          (sum, s) => sum + boardPoints(s, holeById.get(s.holeId), p.gender, ph, allowance), 0)
        return {
          roundId: r.id,
          score,
          // Two points a hole is level, so this is how far ahead they stand
          // on the holes they have actually played
          relative: score - mine.length * 2,
          live: mine.some(s => s.live),
          played: mine.length > 0,
        }
      }

      const g = mine.reduce((sum, s) => sum + (s.gross ?? 0), 0)
      const shots = mine.reduce((sum, s) => {
        const hole = holeById.get(s.holeId)
        return hole ? sum + shotsReceived(ph, effectiveSI(hole, p.gender)) : sum
      }, 0)
      // Par of the holes actually played, so a card nine holes in reads
      // against nine holes of par rather than eighteen
      const parPlayed = mine.reduce((sum, s) => {
        const hole = holeById.get(s.holeId)
        return hole ? sum + effectivePar(hole, p.gender) : sum
      }, 0)
      gross += g

      return {
        roundId: r.id,
        score: g - shots,
        relative: g - shots - parPlayed,
        live: mine.some(s => s.live),
        played: mine.length > 0,
      }
    })

    return { player: p, rounds, holesPlayed, gross }
  }).filter(r => r.holesPlayed > 0)

  const combined = combineRounds(lb, perPlayer.map(r => ({ id: r.player.id, rounds: r.rounds })),
    ctx.players.length)

  const rows = perPlayer.map(({ player, rounds }) => {
    const c = combined.get(player.id)!
    // An individual row carries no second line. It used to count the holes
    // and rounds played — "42 holes · 3 rounds" — under every name, which is
    // a lot of type saying something the round columns already show, on the
    // one board that is meant to be read at a glance. What is worth knowing
    // about a round is in that round's own column.
    const row: BoardRow = {
      id: player.id,
      name: player.name,
      subLabel: '',
      perRound: c.perRound,
      playedRounds: rounds.filter(r => r.played).map(r => r.roundId),
      droppedRounds: c.dropped,
      liveRounds: rounds.filter(r => r.live).map(r => r.roundId),
      relativeByRound: relatives(lb, rounds),
      total: c.total,
      isLive: liveFor([player.id], ctx),
      playerIds: [player.id],
    }
    return row
  })

  return sortRows(lb, rows)
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

  const perTeam = teams.map(team => {
    const memberIds = membersOf(ctx.memberships, team.id)
    const rounds: RoundScore[] = ctx.rounds.map(r => {
      const res = teamRoundPoints(memberIds, r.id, inputs, scoring, basis)
      return {
        roundId: r.id,
        score: res.score,
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
    const row: BoardRow = {
      id: team.id,
      name: team.name,
      color: team.color,
      subLabel: members.map(m => firstName(m.name)).join(', '),
      perRound: c.perRound,
      playedRounds: rounds.filter(r => r.played).map(r => r.roundId),
      droppedRounds: c.dropped,
      liveRounds: rounds.filter(r => r.live).map(r => r.roundId),
      total: c.total,
      isLive: liveFor(memberIds, ctx),
      playerIds: memberIds,
      heroByRound: Object.fromEntries(rounds.map(r => [r.roundId, r.heroPlayerId ?? null])),
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
