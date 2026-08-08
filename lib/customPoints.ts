// Custom points: a prize table awarded by finishing position each round.
//
// Societies often run their own table — ten for the winner, five for second,
// three for third — rather than ranking on raw Stableford. Each round is
// scored on its own, positions are awarded from the table, and the season
// board is the sum across rounds.
//
// Pure and deterministic. See scripts/test-custom-points.ts.

import { MAX_CUSTOM_POINTS } from './formats'

export { MAX_CUSTOM_POINTS }

/**
 * The table a trip starts with: the winner gets a point per player, and each
 * place below drops one. Eight players gives 8, 7, 6, 5, 4, 3, 2, 1.
 *
 * A sensible shape to edit rather than a rule — every value can be changed,
 * and nothing below is affected by how the defaults were arrived at.
 */
export function defaultCustomPoints(playerCount: number): number[] {
  const n = Math.max(0, Math.floor(playerCount))
  return Array.from({ length: n }, (_, i) => Math.min(MAX_CUSTOM_POINTS, n - i))
}

/**
 * Whether this table is exactly the one `defaultCustomPoints` would make —
 * that is, whether anybody has actually decided anything about it.
 */
export function isDefaultCustomPoints(table: readonly number[]): boolean {
  if (table.length === 0) return false
  const fresh = defaultCustomPoints(table.length)
  return table.every((v, i) => v === fresh[i])
}

/**
 * The table to use, grown or trimmed to the current player count.
 *
 * An **edited** table is padded with zeroes rather than regenerated: deciding
 * that the winner gets ten should not be undone by somebody signing up.
 *
 * An **untouched default** is not a set of numbers, though — it is a shape,
 * "a point per player, dropping one by one" — so it follows the field. That
 * distinction is the whole of this function, and missing it is what left a
 * trip of six paying first and second only: the board had been made while
 * the field was two, `[2, 1]` was stored, and every later arrival was padded
 * in on nought. A team board made it certain rather than merely likely, since
 * teams are picked after the board exists and the field is therefore always
 * empty at that point.
 *
 * A table that has been edited into the exact shape of a default is treated
 * as one. There is nothing to tell them apart, and following the field is the
 * better guess about what was meant.
 */
export function resolveCustomPoints(stored: number[], playerCount: number): number[] {
  const n = Math.max(0, Math.floor(playerCount))
  if (stored.length === 0 || isDefaultCustomPoints(stored)) return defaultCustomPoints(n)
  return Array.from({ length: n }, (_, i) => clampPoints(stored[i] ?? 0))
}

/**
 * The rows the editor shows — and therefore the rows it stores.
 *
 * This is `resolveCustomPoints`'s sibling and differs in exactly one way: an
 * **edited table keeps its own length**. Scoring still pads a short table with
 * noughts when it reads it, because the board must be scorable whatever the
 * field turns out to be. The editor must not, because in the editor the length
 * is a thing somebody is setting.
 *
 * Resolving on the way in was what made the two stepper buttons do nothing.
 * They wrote a longer or shorter table, the next render sized it back to the
 * field, and the write vanished — the plus silently, the minus by leaving a
 * row behind on nought. The rule that avoids that whole class of bug is that
 * this function is **idempotent**: what it shows, fed back to it, is
 * unchanged. `resolveCustomPoints` is not, and cannot be, because following
 * the field is the entire point of it.
 *
 * An untouched default still follows the field, which is the behaviour worth
 * keeping: a board is usually made before the teams are picked, and a shape
 * has no length to defend.
 */
export function editableRows(stored: readonly number[], fieldSize: number): number[] {
  if (stored.length === 0 || isDefaultCustomPoints(stored)) {
    return defaultCustomPoints(Math.max(1, Math.floor(fieldSize)))
  }
  return stored.map(clampPoints)
}

export function clampPoints(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(MAX_CUSTOM_POINTS, Math.max(0, Math.round(n)))
}

// ─── When the table and the field disagree ─────────────────────
//
// The board itself never breaks over this: `resolveCustomPoints` pads a short
// table with noughts and trims a long one when the rows are read, so the
// competition is always scorable. What it cannot do is tell anybody. A place
// silently worth nothing, or a place quietly dropped off the bottom, is the
// kind of thing found out at the prizegiving.
//
// So these two say it, at the two moments that cause it: a team sheet
// changing size, and a player joining. Both are warnings rather than
// refusals — the table has already been made sensible, and stopping somebody
// adding a player at the range because a prize table is a row short would be
// the worse trade.

/** Shown when the number of teams stops matching the table. */
export const TEAM_POINTS_MISMATCH =
  "The amount of teams doesn't match the Points by Position allocation. "
  + 'Please return to leaderboards settings to confirm.'

/** Shown when a player is added to a trip that pays by position. */
export const PLAYER_POINTS_MISMATCH =
  'Check the Points by Position leaderboard settings to ensure that player '
  + "addition hasn't resulted in disruption to points allocation"

/**
 * Whether a stored table has stopped matching the field it pays out to.
 *
 * **An untouched default is never out of step**, and that is the whole
 * subtlety here. It is not a set of figures but a shape — a point per
 * finisher, dropping one by one — so it follows the field wherever the field
 * goes, and warning about it would be warning that nothing happened. Only a
 * table somebody has actually decided can fall behind, because only that one
 * is kept.
 *
 * `fieldSize` of zero is not a mismatch either: no teams picked and nobody
 * joined is the state every board starts in, and a warning on an empty trip
 * is noise on the one screen where it can safely be ignored.
 */
export function pointsOutOfStep(stored: readonly number[], fieldSize: number): boolean {
  if (fieldSize <= 0) return false
  if (stored.length === 0 || isDefaultCustomPoints(stored)) return false
  return stored.length !== Math.floor(fieldSize)
}

/** The shape of a board, as much of it as this question needs. */
type PositionBoard = {
  combine?: string | null
  audience?: string | null
  customPoints?: number[]
}

/**
 * Whether any board paying by position has fallen out of step.
 *
 * A team board pays out to the teams and an individual board to the players,
 * so the two are counted separately — sizing a team board's table off the
 * player count would pay places nobody can come in.
 */
export function anyPointsOutOfStep(
  boards: readonly PositionBoard[],
  counts: { players: number; teams: number },
): boolean {
  return boards.some(b =>
    b.combine === 'position'
    && pointsOutOfStep(b.customPoints ?? [],
      b.audience === 'team' ? counts.teams : counts.players))
}

export function customPointsError(points: number[]): string | null {
  if (points.some(p => !Number.isFinite(p))) return 'Points must be numbers.'
  if (points.some(p => p < 0)) return 'Points cannot be negative.'
  if (points.some(p => p > MAX_CUSTOM_POINTS)) {
    return `The most any position can be worth is ${MAX_CUSTOM_POINTS}.`
  }
  return null
}

// ─── Awarding ──────────────────────────────────────────────────

export type RoundStanding = {
  playerId: string
  /** Whatever decides the round — Stableford points, or nett strokes. */
  score: number
  /** True when the round is won by the lowest score, as in strokeplay. */
  lowerWins?: boolean
}

/**
 * Points each player takes from one round.
 *
 * Players level on score share the places they occupy between them: two tied
 * for first with a 10/6 table take eight each. Splitting is what a society
 * would do with an actual prize pot, and it keeps the total awarded the same
 * however the round finishes.
 *
 * Anyone with no score that round is simply absent from the result.
 */
export function awardRound(
  standings: RoundStanding[],
  table: number[],
  opts: { lowerWins?: boolean } = {},
): Map<string, number> {
  const out = new Map<string, number>()
  if (standings.length === 0) return out

  const lowerWins = opts.lowerWins ?? false
  const sorted = [...standings].sort((a, b) =>
    lowerWins ? a.score - b.score : b.score - a.score
  )

  let i = 0
  while (i < sorted.length) {
    // Everyone level with the player at i
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1].score === sorted[i].score) j++

    const places = j - i + 1
    let pot = 0
    for (let k = i; k <= j; k++) pot += table[k] ?? 0
    const share = pot / places

    for (let k = i; k <= j; k++) out.set(sorted[k].playerId, share)
    i = j + 1
  }
  return out
}

// ─── Dropping the worst rounds ─────────────────────────────────

/**
 * A player's total once their weakest rounds are set aside.
 *
 * `discard` is how many to drop. A player who has played no more rounds than
 * would be dropped keeps them all — dropping everything would leave nothing to
 * rank on, and someone who has played once should not be treated as if they
 * scored nothing.
 */
export function totalAfterDiscard(
  roundScores: number[],
  discard: number,
  opts: { lowerWins?: boolean } = {},
): number {
  const scores = roundScores.filter(s => Number.isFinite(s))
  if (scores.length === 0) return 0

  const drop = Math.max(0, Math.floor(discard))
  if (drop <= 0 || scores.length <= drop) {
    return scores.reduce((a, b) => a + b, 0)
  }

  // Worst is the lowest score normally, the highest when low scores win
  const sorted = [...scores].sort((a, b) =>
    opts.lowerWins ? b - a : a - b
  )
  return sorted.slice(drop).reduce((a, b) => a + b, 0)
}

/** Which rounds were set aside, by index into the input — for display. */
export function discardedIndices(
  roundScores: number[],
  discard: number,
  opts: { lowerWins?: boolean } = {},
): number[] {
  const drop = Math.max(0, Math.floor(discard))
  const withIndex = roundScores
    .map((score, index) => ({ score, index }))
    .filter(r => Number.isFinite(r.score))

  if (drop <= 0 || withIndex.length <= drop) return []

  withIndex.sort((a, b) => (opts.lowerWins ? b.score - a.score : a.score - b.score))
  return withIndex.slice(0, drop).map(r => r.index).sort((a, b) => a - b)
}
