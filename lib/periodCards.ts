// Which of a player's cards counts in a period — the only copy.
//
// A continuous league's rounds are periods of time (lib/leagueSetup.ts),
// and a player may hand in any number of cards inside one. The league's
// rule decides what the period is worth to them (Ross, 8 Nov 2026):
//
//   · **Best card** — the one card that scores best on the board.
//   · **Best composite card** — each hole's best, across their cards in the
//     period (an eclectic). On a Stableford board that is hole by hole on
//     the points, which already carry the handicap, so it works across
//     different courses. On a strokes board a hole's number means the same
//     hole only on one course, so a composite there is built only when every
//     card is on one course; otherwise the period falls back to the best
//     card. A quota is earned against one card's own target, so a quota
//     board always takes the best card.
//
// Pure: handed each card's per-hole values as the board reads them,
// it answers which card, or which card on each hole. lib/boardRows.ts does
// the measuring and builds the period's round from the answer.

import type { PeriodRule } from './leagueSetup'

/** One card, as a board reads it — a value a hole, in the board's own units. */
export type PeriodCard = {
  roundId: string
  /** Sorts the cards when two are level: the earlier card wins, so the answer never flickers. */
  date: string
  courseId: string | null
  holes: readonly { n: number; v: number }[]
  /**
   * Added to the sum of the holes to give the card's score — a quota card's
   * target, taken off its points. Zero everywhere else.
   */
  offset?: number
}

export type PeriodPick =
  | { kind: 'card'; roundId: string }
  /** Each hole number with the card it is taken from. */
  | { kind: 'composite'; byHole: ReadonlyMap<number, string> }

const total = (c: PeriodCard) => c.holes.reduce((s, h) => s + h.v, 0) + (c.offset ?? 0)

/** The cards in the order a tie is broken: earliest first, then by id, so every phone agrees. */
function ordered(cards: readonly PeriodCard[]): PeriodCard[] {
  return [...cards].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.roundId < b.roundId ? -1 : a.roundId > b.roundId ? 1 : 0)
}

/**
 * The best whole card. On points the highest score. On strokes the lowest,
 * **among the cards with the most holes**: a card abandoned on the ninth
 * has fewer strokes on it than a finished one, and must not beat it.
 */
export function bestCard(cards: readonly PeriodCard[], lowerWins: boolean): PeriodCard | null {
  const list = ordered(cards).filter(c => c.holes.length > 0)
  if (list.length === 0) return null
  const pool = lowerWins
    ? list.filter(c => c.holes.length === Math.max(...list.map(x => x.holes.length)))
    : list
  return pool.reduce((best, c) => {
    const a = total(c), b = total(best)
    return (lowerWins ? a < b : a > b) ? c : best
  })
}

/**
 * Which card counts, or which card on each hole — null when the player has
 * no card in the period.
 *
 * `composite` is the league's rule; `compositeAllowed` is the board's say
 * (false on a quota board), and a strokes board's composite is refused here
 * when the cards are on more than one course.
 */
export function pickPeriodCard(
  cards: readonly PeriodCard[], rule: PeriodRule | undefined,
  opts: { lowerWins: boolean; compositeAllowed: boolean },
): PeriodPick | null {
  const best = bestCard(cards, opts.lowerWins)
  if (!best) return null
  if (rule !== 'composite' || !opts.compositeAllowed) return { kind: 'card', roundId: best.roundId }

  const list = ordered(cards).filter(c => c.holes.length > 0)
  if (opts.lowerWins && new Set(list.map(c => c.courseId)).size > 1) {
    return { kind: 'card', roundId: best.roundId }
  }
  // One card is a composite of itself — say so as the card, which reads the
  // same on the board and keeps the scorecard pointing at a real round.
  if (list.length === 1) return { kind: 'card', roundId: best.roundId }

  const byHole = new Map<number, string>()
  const value = new Map<number, number>()
  for (const c of list) {
    for (const h of c.holes) {
      const was = value.get(h.n)
      if (was === undefined || (opts.lowerWins ? h.v < was : h.v > was)) {
        value.set(h.n, h.v)
        byHole.set(h.n, c.roundId)
      }
    }
  }
  return { kind: 'composite', byHole }
}

/**
 * The card a composite's handicap is read from — the one it takes the most
 * holes from, the earliest where two tie. Its handicap is the one the
 * period's round is shown at; every other hole is restated to it so the
 * nett on each hole is exactly what it was on its own card.
 */
export function compositeBase(pick: Extract<PeriodPick, { kind: 'composite' }>, cards: readonly PeriodCard[]): string {
  const counts = new Map<string, number>()
  for (const id of pick.byHole.values()) counts.set(id, (counts.get(id) ?? 0) + 1)
  let base = '', most = -1
  for (const c of ordered(cards)) {
    const n = counts.get(c.roundId) ?? 0
    if (n > most) { most = n; base = c.roundId }
  }
  return base
}
