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
import {
  type TeamScoring, DEFAULT_TEAM_SCORING, teamRoundPoints,
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
  team_id: string | null
}

export type RowTeam = { id: string; name: string; color: string }

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
  teams: RowTeam[]
  holes: RowHole[]
  /** In round order. */
  rounds: RowRound[]
  resolved: ResolvedScore[]
  /** Playing handicap, keyed `${roundId}:${playerId}`. */
  hcpFor: Map<string, number>
  /** Rounds with a card open or uncommitted scores against them. */
  liveRoundIds: Set<string>
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

export function shotsReceived(playingHandicap: number, strokeIndex: number): number {
  const whole = Math.floor(playingHandicap / 18)
  const remainder = Math.round(playingHandicap) % 18
  return whole + (strokeIndex <= remainder ? 1 : 0)
}

export function effectivePar(hole: RowHole, gender: string): number {
  return gender === 'F' && hole.par_ladies != null ? hole.par_ladies : hole.par
}

export function effectiveSI(hole: RowHole, gender: string): number {
  return gender === 'F' && hole.stroke_index_ladies != null
    ? hole.stroke_index_ladies
    : hole.stroke_index
}

const firstName = (n: string) => n.split(' ')[0]

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

// ─── Building a board ──────────────────────────────────────────

/**
 * The rows for one leaderboard, in finishing order.
 *
 * Matchplay returns nothing: a draw is not a table, and it lives on its own
 * route. The caller decides what to show in its place.
 */
export function buildRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  if (lb.competition === 'matchplay') return []
  if (lb.audience === 'team') return teamRows(lb, ctx)
  if (lb.scoring === 'strokes') return strokeRows(lb, ctx)
  if (lb.scoring === 'custom') return customRows(lb, ctx)
  return stablefordRows(lb, ctx)
}

/** Whether any of these players has a round still open. */
function liveFor(playerIds: string[], ctx: RowContext): boolean {
  return ctx.resolved.some(s => playerIds.includes(s.playerId) && ctx.liveRoundIds.has(s.roundId))
}

// ── Individual Stableford ──

function stablefordRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  const discard = lb.discardWorst ?? 0

  return ctx.players
    .map(p => {
      const perRound: Record<string, number> = {}
      const relativeByRound: Record<string, number> = {}
      const playedRounds: string[] = []
      const liveRounds: string[] = []
      let holesPlayed = 0

      for (const r of ctx.rounds) {
        const mine = ctx.resolved.filter(s => s.playerId === p.id && s.roundId === r.id)
        perRound[r.id] = mine.reduce((sum, s) => sum + s.points, 0)
        // Two points a hole is level, so this is how far ahead they stand on
        // the holes they have actually played
        relativeByRound[r.id] = perRound[r.id] - mine.length * 2
        holesPlayed += mine.length
        if (mine.length > 0) playedRounds.push(r.id)
        if (mine.some(s => s.live)) liveRounds.push(r.id)
      }

      const played = playedRounds.map(id => perRound[id])
      const total = totalAfterDiscard(played, discard)
      const dropped = discardedIndices(played, discard).map(i => playedRounds[i])
      const diff = total - holesPlayed * 2

      const row: BoardRow = {
        id: p.id,
        name: p.name,
        subLabel: `${holesPlayed} hole${holesPlayed === 1 ? '' : 's'} · ${
          diff === 0 ? 'level' : diff > 0 ? `+${diff}` : diff
        }`,
        perRound,
        playedRounds,
        droppedRounds: dropped,
        liveRounds,
        relativeByRound,
        total,
        isLive: liveFor([p.id], ctx),
        playerIds: [p.id],
      }
      return { row, holesPlayed }
    })
    .filter(r => r.holesPlayed > 0)
    .map(r => r.row)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

// ── Individual Strokeplay ──
// Lower is better, so nett is the headline and rows sort ascending.

function strokeRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  const discard = lb.discardWorst ?? 0
  const holeById = new Map(ctx.holes.map(h => [h.id, h]))

  return ctx.players
    .map(p => {
      const perRound: Record<string, number> = {}
      const relativeByRound: Record<string, number> = {}
      const playedRounds: string[] = []
      const liveRounds: string[] = []
      let gross = 0, holesPlayed = 0

      for (const r of ctx.rounds) {
        const mine = ctx.resolved.filter(
          s => s.playerId === p.id && s.roundId === r.id && s.gross != null
        )
        const g = mine.reduce((sum, s) => sum + (s.gross ?? 0), 0)
        const shots = mine.reduce((sum, s) => {
          const hole = holeById.get(s.holeId)
          if (!hole) return sum
          const ph = ctx.hcpFor.get(`${r.id}:${p.id}`) ?? p.handicap ?? 0
          return sum + shotsReceived(ph, effectiveSI(hole, p.gender))
        }, 0)
        perRound[r.id] = g - shots

        // Par of the holes actually played, so a card nine holes in reads
        // against nine holes of par rather than eighteen
        const parPlayed = mine.reduce((sum, sc) => {
          const hole = holeById.get(sc.holeId)
          return hole ? sum + effectivePar(hole, p.gender) : sum
        }, 0)
        relativeByRound[r.id] = perRound[r.id] - parPlayed

        gross += g
        holesPlayed += mine.length
        if (mine.length > 0) playedRounds.push(r.id)
        if (mine.some(sc => sc.live)) liveRounds.push(r.id)
      }

      // Low scores win here, so the worst round is the highest one
      const playedNett = playedRounds.map(id => perRound[id])
      const nett = totalAfterDiscard(playedNett, discard, { lowerWins: true })
      const dropped = discardedIndices(playedNett, discard, { lowerWins: true })
        .map(i => playedRounds[i])

      const row: BoardRow = {
        id: p.id,
        name: p.name,
        subLabel: `${holesPlayed} hole${holesPlayed === 1 ? '' : 's'} · ${gross} gross`,
        perRound,
        playedRounds,
        droppedRounds: dropped,
        liveRounds,
        relativeByRound,
        total: nett,
        isLive: liveFor([p.id], ctx),
        playerIds: [p.id],
      }
      return { row, holesPlayed }
    })
    .filter(r => r.holesPlayed > 0)
    .map(r => r.row)
    .sort((a, b) => a.total - b.total)
}

// ── Individual custom points ──
// Each round is placed on its own Stableford result, positions are paid from
// this board's table, and the total is the sum across rounds.

function customRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  const discard = lb.discardWorst ?? 0
  const table = resolveCustomPoints(lb.customPoints ?? [], ctx.players.length)

  const awardedByRound = new Map<string, Map<string, number>>()
  for (const r of ctx.rounds) {
    const standings = ctx.players
      .map(p => {
        const mine = ctx.resolved.filter(s => s.playerId === p.id && s.roundId === r.id)
        return mine.length > 0
          ? { playerId: p.id, score: mine.reduce((sum, s) => sum + s.points, 0) }
          : null
      })
      .filter(Boolean) as { playerId: string; score: number }[]
    awardedByRound.set(r.id, awardRound(standings, table))
  }

  return ctx.players
    .map(p => {
      const perRound: Record<string, number> = {}
      const playedRounds: string[] = []
      const liveRounds: string[] = []

      for (const r of ctx.rounds) {
        const awarded = awardedByRound.get(r.id)?.get(p.id)
        if (awarded === undefined) continue
        perRound[r.id] = awarded
        playedRounds.push(r.id)
        // No relative figure on purpose: a prize table pays finishing
        // position, and there is no level to be ahead of. The green still
        // says the position can move before the card is in.
        if (ctx.resolved.some(sc => sc.playerId === p.id && sc.roundId === r.id && sc.live)) {
          liveRounds.push(r.id)
        }
      }

      const played = playedRounds.map(id => perRound[id])
      const total = totalAfterDiscard(played, discard)
      const dropped = discardedIndices(played, discard).map(i => playedRounds[i])

      const row: BoardRow = {
        id: p.id,
        name: p.name,
        subLabel: playedRounds.length > 0
          ? `${playedRounds.length} round${playedRounds.length === 1 ? '' : 's'}`
          : '',
        perRound,
        playedRounds,
        droppedRounds: dropped,
        liveRounds,
        total,
        isLive: liveFor([p.id], ctx),
        playerIds: [p.id],
      }
      return { row, played: playedRounds.length }
    })
    .filter(r => r.played > 0)
    .map(r => r.row)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

// ── Teams ──

function teamRows(lb: Leaderboard, ctx: RowContext): BoardRow[] {
  const scoring = teamScoringFor(lb, ctx.legacyTeamScoring)
  const byPosition = lb.aggregation === 'custom_points'
  const table = byPosition
    ? resolveCustomPoints(lb.customPoints ?? [], ctx.teams.length)
    : []

  // Every team's raw points for every round, before the trip decides how the
  // rounds are added together.
  const raw = ctx.teams.map(team => {
    const memberIds = ctx.players.filter(p => p.team_id === team.id).map(p => p.id)
    const perRound: Record<string, number> = {}
    const heroByRound: Record<string, string | null> = {}
    const playedRounds: string[] = []
    const liveRounds: string[] = []

    for (const r of ctx.rounds) {
      const res = teamRoundPoints(memberIds, r.id, ctx.resolved, scoring)
      perRound[r.id] = res.points
      heroByRound[r.id] = res.heroPlayerId
      if (res.played) playedRounds.push(r.id)
      // No relative figure: what counts as level depends on the mode and the
      // team's size, so a signed number here would mislead.
      if (ctx.resolved.some(sc => memberIds.includes(sc.playerId) && sc.roundId === r.id && sc.live)) {
        liveRounds.push(r.id)
      }
    }
    return { team, memberIds, perRound, heroByRound, playedRounds, liveRounds }
  }).filter(t => t.memberIds.length > 0)

  // Paid by position: each round is placed on its raw points, and what shows
  // in the round column is what that position was worth — not the points that
  // earned it, which would make the total look wrong beside its own columns.
  const awardedByRound = new Map<string, Map<string, number>>()
  if (byPosition) {
    for (const r of ctx.rounds) {
      const standings = raw
        .filter(t => t.playedRounds.includes(r.id))
        .map(t => ({ playerId: t.team.id, score: t.perRound[r.id] }))
      awardedByRound.set(r.id, awardRound(standings, table))
    }
  }

  return raw
    .map(t => {
      const perRound = byPosition
        ? Object.fromEntries(
            t.playedRounds.map(id => [id, awardedByRound.get(id)?.get(t.team.id) ?? 0])
          )
        : t.perRound
      const total = t.playedRounds.reduce((sum, id) => sum + (perRound[id] ?? 0), 0)

      const members = ctx.players.filter(p => p.team_id === t.team.id)
      const row: BoardRow = {
        id: t.team.id,
        name: t.team.name,
        color: t.team.color,
        subLabel: members.map(m => firstName(m.name)).join(', '),
        perRound,
        playedRounds: t.playedRounds,
        liveRounds: t.liveRounds,
        total,
        isLive: liveFor(t.memberIds, ctx),
        playerIds: t.memberIds,
        heroByRound: t.heroByRound,
      }
      return row
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}
