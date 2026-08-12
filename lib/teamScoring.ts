// How a team's points for a round are worked out. One setting per trip,
// stored on trips.team_scoring.

export type TeamScoringMode = 'hero' | 'better_ball' | 'aggregate' | 'cut_dead_weight'

export type TeamScoring = {
  mode: TeamScoringMode
  countingScores: number   // better_ball: how many scores count on each hole
  aggregateFinish: number  // better_ball: closing holes where EVERYONE counts (0 = off)
  aggregateHoles: number   // aggregate: how many of the closing holes count
}

export const DEFAULT_TEAM_SCORING: TeamScoring = {
  mode: 'better_ball',
  countingScores: 2,
  aggregateFinish: 0,
  aggregateHoles: 18,
}

export const TEAM_SCORING_MODES: {
  key: TeamScoringMode
  label: string
  description: string
}[] = [
  {
    key: 'hero',
    label: 'Hero',
    description: 'One card carries the team — the best individual round in the team counts, and the rest are carried.',
  },
  {
    key: 'better_ball',
    label: 'Better Ball',
    description: 'A composite card built hole by hole from the team\'s best scores. Can open up to everyone for a grandstand finish.',
  },
  {
    key: 'cut_dead_weight',
    label: 'Cut the dead weight',
    description: 'Everyone counts except the worst card of the day. That player is back in next round.',
  },
  {
    key: 'aggregate',
    label: 'Aggregate',
    description: 'Everyone\'s score counts on every hole that matters. The purest team format.',
  },
]

export function parseTeamScoring(raw: unknown): TeamScoring {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TEAM_SCORING }
  const r = raw as Record<string, unknown>
  const mode = TEAM_SCORING_MODES.some(m => m.key === r.mode)
    ? (r.mode as TeamScoringMode)
    : DEFAULT_TEAM_SCORING.mode
  const counting = Number(r.countingScores)
  const finish   = Number(r.aggregateFinish)
  const holes    = Number(r.aggregateHoles)
  return {
    mode,
    countingScores:  Number.isFinite(counting) ? Math.min(4,  Math.max(1, Math.round(counting))) : DEFAULT_TEAM_SCORING.countingScores,
    aggregateFinish: Number.isFinite(finish)   ? Math.min(18, Math.max(0, Math.round(finish)))   : DEFAULT_TEAM_SCORING.aggregateFinish,
    aggregateHoles:  Number.isFinite(holes)    ? Math.min(18, Math.max(1, Math.round(holes)))    : DEFAULT_TEAM_SCORING.aggregateHoles,
  }
}

/** One-line summary of the current setting, for the setup and leaderboard screens. */
/** "the last hole" / "the last 3 holes" — reads properly at either end. */
function lastHoles(n: number) {
  return n === 1 ? 'the last hole' : `the last ${n} holes`
}

export function describeTeamScoring(ts: TeamScoring): string {
  if (ts.mode === 'hero') return 'Best single card in the team counts each round'
  if (ts.mode === 'better_ball') {
    const base = ts.countingScores === 1
      ? 'Best score on each hole counts'
      : `Best ${ts.countingScores} scores on each hole count`
    return ts.aggregateFinish > 0
      ? `${base}, and everyone counts on ${lastHoles(ts.aggregateFinish)}`
      : base
  }
  return ts.aggregateHoles >= 18
    ? 'Every score counts on all 18 holes'
    : `Every score counts on ${lastHoles(ts.aggregateHoles)}`
}

// ─── Calculation ───────────────────────────────────────────────

/**
 * What a round is being scored on.
 *
 * The team formats are the same shape of question either way — best on the
 * hole, best card, everyone but the worst — but the direction reverses. On
 * Stableford the best score is the highest; on strokes it is the lowest, and
 * a team's round is a nett stroke total rather than a points total.
 */
export type ScoringBasis = 'stableford' | 'strokes'

/** The minimum a score needs to expose for team scoring. */
export type TeamScoreInput = {
  playerId: string
  roundId: string
  holeNumber: number
  points: number
  /** Nett strokes for the hole. Only read when the basis is strokes. */
  nett?: number
}

export type TeamRoundResult = {
  roundId: string
  /** The team's score for the round, in whatever the basis was. */
  score: number
  /** Hero mode only — who carried the team this round. */
  heroPlayerId: string | null
  /** True once anyone on the team has scored a hole in this round. */
  played: boolean
}

/** Lower wins on strokes, higher on Stableford. One rule, used everywhere. */
export function beats(a: number, b: number, basis: ScoringBasis): boolean {
  return basis === 'strokes' ? a < b : a > b
}

/**
 * The best `count` figures on one hole — better ball, for a single hole.
 *
 * Exported because a four-ball knockout match asks the same question a team
 * board does: what did this side score on this hole? A pairing is a team of
 * two and its card is the better of them, so `lib/matchDecision.ts` reads it
 * from here rather than sorting a second time under its own assumptions.
 *
 * A copy asked for one figure and the other for two would be the same rule
 * with two answers about which way round strokes sort.
 */
export function bestOnHole(
  values: readonly number[], basis: ScoringBasis, count: number,
): number[] {
  return [...values]
    .sort((a, b) => basis === 'strokes' ? a - b : b - a)
    .slice(0, Math.max(0, count))
}

/**
 * The single worst card of a round.
 *
 * Ties are broken by id so the same player is cut every time the same round
 * is scored — a total that changed depending on query order would be worse
 * than any particular choice of who to drop.
 */
function worstOf(
  totals: { id: string; total: number }[],
  basis: ScoringBasis,
): { id: string; total: number } {
  return totals.reduce((worst, m) =>
    beats(worst.total, m.total, basis) || (m.total === worst.total && m.id < worst.id) ? m : worst)
}

/**
 * A team's score for one round under the given mode.
 *
 * `memberIds` may be any size — teams are deliberately not fixed at three.
 */
export function teamRoundPoints(
  memberIds: string[],
  roundId: string,
  scores: TeamScoreInput[],
  scoring: TeamScoring,
  basis: ScoringBasis = 'stableford',
): TeamRoundResult {
  const members = new Set(memberIds)
  const mine = scores.filter(s => s.roundId === roundId && members.has(s.playerId))
  const value = (s: TeamScoreInput) => basis === 'strokes' ? s.nett ?? 0 : s.points

  if (mine.length === 0) {
    return { roundId, score: 0, heroPlayerId: null, played: false }
  }

  if (scoring.mode === 'hero') {
    let bestId: string | null = null
    let best: number | null = null
    for (const id of memberIds) {
      // A player with no scores at all shouldn't win the hero slot with 0
      if (!mine.some(s => s.playerId === id)) continue
      const total = mine
        .filter(s => s.playerId === id)
        .reduce((sum, s) => sum + value(s), 0)
      if (best === null || beats(total, best, basis)) { best = total; bestId = id }
    }
    return { roundId, score: best ?? 0, heroPlayerId: bestId, played: true }
  }

  if (scoring.mode === 'cut_dead_weight') {
    // Every member counts except whoever had the worst round. Judged on the
    // whole card, not hole by hole: it is one bad day being set aside, and
    // that player is eligible again next round.
    const totals = memberIds
      .map(id => ({
        id,
        played: mine.some(s => s.playerId === id),
        total: mine.filter(s => s.playerId === id).reduce((sum, s) => sum + value(s), 0),
      }))
      .filter(m => m.played)

    // With one player there is nothing to cut — dropping them would leave
    // the team with no score at all.
    const counting = totals.length > 1
      ? totals.filter(m => m.id !== worstOf(totals, basis).id)
      : totals

    return {
      roundId,
      score: counting.reduce((sum, m) => sum + m.total, 0),
      heroPlayerId: null,
      played: true,
    }
  }

  if (scoring.mode === 'better_ball') {
    // Holes inside the closing stretch open up to the whole team, so a
    // trailing side can still catch up over the last few.
    const finishFrom = scoring.aggregateFinish > 0
      ? 18 - scoring.aggregateFinish + 1
      : Infinity

    let total = 0
    for (let hole = 1; hole <= 18; hole++) {
      const holeScores = mine.filter(s => s.holeNumber === hole).map(value)
      const counting = hole >= finishFrom ? holeScores.length : scoring.countingScores
      total += bestOnHole(holeScores, basis, counting).reduce((sum, p) => sum + p, 0)
    }
    return { roundId, score: total, heroPlayerId: null, played: true }
  }

  // aggregate — every score counts, over the closing `aggregateHoles` holes
  const firstHole = 18 - scoring.aggregateHoles + 1
  const total = mine
    .filter(s => s.holeNumber >= firstHole)
    .reduce((sum, s) => sum + value(s), 0)
  return { roundId, score: total, heroPlayerId: null, played: true }
}
