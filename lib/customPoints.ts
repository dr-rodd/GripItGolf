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

export function clampPoints(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(MAX_CUSTOM_POINTS, Math.max(0, Math.round(n)))
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
