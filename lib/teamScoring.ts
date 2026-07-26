// How a team's points for a round are worked out. One setting per trip,
// stored on trips.team_scoring.

export type TeamScoringMode = 'hero' | 'better_ball' | 'aggregate'

export type TeamScoring = {
  mode: TeamScoringMode
  countingScores: number   // better_ball: how many scores count on each hole
  aggregateHoles: number   // aggregate: how many of the closing holes count
}

export const DEFAULT_TEAM_SCORING: TeamScoring = {
  mode: 'better_ball',
  countingScores: 2,
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
    description: 'A composite card built hole by hole from the team\'s best scores. Forgiving of one bad hole.',
  },
  {
    key: 'aggregate',
    label: 'Aggregate',
    description: 'Everyone\'s score counts. Optionally only over the closing holes, so nobody is out of it early.',
  },
]

export function parseTeamScoring(raw: unknown): TeamScoring {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TEAM_SCORING }
  const r = raw as Record<string, unknown>
  const mode = TEAM_SCORING_MODES.some(m => m.key === r.mode)
    ? (r.mode as TeamScoringMode)
    : DEFAULT_TEAM_SCORING.mode
  const counting = Number(r.countingScores)
  const holes    = Number(r.aggregateHoles)
  return {
    mode,
    countingScores: Number.isFinite(counting) ? Math.min(4, Math.max(1, Math.round(counting))) : DEFAULT_TEAM_SCORING.countingScores,
    aggregateHoles: Number.isFinite(holes)    ? Math.min(18, Math.max(1, Math.round(holes)))   : DEFAULT_TEAM_SCORING.aggregateHoles,
  }
}

/** One-line summary of the current setting, for the setup and leaderboard screens. */
export function describeTeamScoring(ts: TeamScoring): string {
  if (ts.mode === 'hero') return 'Best single card in the team counts each round'
  if (ts.mode === 'better_ball') {
    return ts.countingScores === 1
      ? 'Best score on each hole counts'
      : `Best ${ts.countingScores} scores on each hole count`
  }
  return ts.aggregateHoles >= 18
    ? 'Every score counts on all 18 holes'
    : `Every score counts on the last ${ts.aggregateHoles} holes`
}

// ─── Calculation ───────────────────────────────────────────────

/** The minimum a score needs to expose for team scoring. */
export type TeamScoreInput = {
  playerId: string
  roundId: string
  holeNumber: number
  points: number
}

export type TeamRoundResult = {
  roundId: string
  points: number
  /** Hero mode only — who carried the team this round. */
  heroPlayerId: string | null
  /** True once anyone on the team has scored a hole in this round. */
  played: boolean
}

/**
 * Points a team scored in one round under the given mode.
 * `memberIds` may be any size — teams are deliberately not fixed at three.
 */
export function teamRoundPoints(
  memberIds: string[],
  roundId: string,
  scores: TeamScoreInput[],
  scoring: TeamScoring,
): TeamRoundResult {
  const members = new Set(memberIds)
  const mine = scores.filter(s => s.roundId === roundId && members.has(s.playerId))

  if (mine.length === 0) {
    return { roundId, points: 0, heroPlayerId: null, played: false }
  }

  if (scoring.mode === 'hero') {
    let bestId: string | null = null
    let best = -1
    for (const id of memberIds) {
      const total = mine
        .filter(s => s.playerId === id)
        .reduce((sum, s) => sum + s.points, 0)
      // A player with no scores at all shouldn't win the hero slot with 0
      const hasPlayed = mine.some(s => s.playerId === id)
      if (hasPlayed && total > best) { best = total; bestId = id }
    }
    return { roundId, points: Math.max(0, best), heroPlayerId: bestId, played: true }
  }

  if (scoring.mode === 'better_ball') {
    let total = 0
    for (let hole = 1; hole <= 18; hole++) {
      total += mine
        .filter(s => s.holeNumber === hole)
        .map(s => s.points)
        .sort((a, b) => b - a)
        .slice(0, scoring.countingScores)
        .reduce((sum, p) => sum + p, 0)
    }
    return { roundId, points: total, heroPlayerId: null, played: true }
  }

  // aggregate — every score counts, over the closing `aggregateHoles` holes
  const firstHole = 18 - scoring.aggregateHoles + 1
  const total = mine
    .filter(s => s.holeNumber >= firstHole)
    .reduce((sum, s) => sum + s.points, 0)
  return { roundId, points: total, heroPlayerId: null, played: true }
}
