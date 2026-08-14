// Two players level. What happens next.
//
// Golf's own answer is countback: whoever played the back nine better takes
// it, and if they are level there too, the back six, then the back three, then
// the last two. Beyond that the card has nothing left to say and the tie
// stands.
//
// That is one of three answers a competition can give, and they differ only
// where there is something to hand out:
//
//   countback        split them, and the better nine takes the better prize
//   everybody_wins   nobody is split — every level player takes the best of
//                    the prizes their places cover
//   even_split       nobody is split — the prizes their places cover are
//                    pooled and shared
//
// On a board that pays nothing the last two are the same thing, because
// sharing nothing and sharing nothing equally are the same act. They are still
// two settings rather than one, because the same board gains prizes the moment
// somebody switches it to points by position and the answer should not change
// underneath them.
//
// **Rounds added up have no back nine.** A trip total is several cards, and
// there is no ninth hole of it — which is why a board that breaks a round's
// tie on countback can still be told to leave the overall total level. The one
// exception is a board counting a single round, where the total *is* that card
// and the two questions are the same question.
//
// This is the only copy of the rule. The in-play panel inside the scoring card
// reads it too — it had its own, which is how the same two players could be
// ordered one way there and the other way on the trip leaderboard.
//
// Pure. No I/O, no React.

import type { Leaderboard } from './leaderboards'

// ─── The setting ───────────────────────────────────────────────

export type TieBreak = 'countback' | 'everybody_wins' | 'even_split'

/** What to do about a tie on a total made of more than one round. */
export type OverallTie = 'level' | 'last_round'

/**
 * What a board does with a tie.
 *
 * Absent means `even_split`, which is what every board did before the question
 * was asked. A new *prizes* board is seeded with `countback` by the form — the
 * default for something already saved and the default for something being made
 * are different questions, and answering them with one constant would re-score
 * trips that have already been played. A board that pays nothing is never
 * asked at all: the question is a prizes question, `offersTieBreak` in
 * lib/leaderboards.ts is the gate, and `parseLeaderboards` drops the answer
 * off any totals board that stored one before that was true.
 */
export function tieBreakOf(lb: Pick<Leaderboard, 'tieBreak'>): TieBreak {
  return TIE_BREAKS.some(t => t.key === lb.tieBreak)
    ? lb.tieBreak as TieBreak
    : 'even_split'
}

/** What a board does with a tie on the overall total. Absent means leave it. */
export function overallTieOf(lb: Pick<Leaderboard, 'overallTie'>): OverallTie {
  return lb.overallTie === 'last_round' ? 'last_round' : 'level'
}

/** The default for a board being made now, as opposed to one being read back. */
export const DEFAULT_TIE_BREAK: TieBreak = 'countback'

export const TIE_BREAKS: { key: TieBreak; label: string; hint: string }[] = [
  // Like every hint in lib/leaderboards.ts these are joined into the line
  // under a saved board's title, so each ends with a full stop.
  { key: 'countback', label: 'Tiebreak',
    hint: 'Ties broken by better back 9, then 6, then 3, then 2.' },
  { key: 'everybody_wins', label: 'Everybody Wins',
    hint: 'Level players all take the better prize.' },
  { key: 'even_split', label: 'Even Split',
    hint: 'Level players split the prizes between them.' },
]

export const OVERALL_TIES: { key: OverallTie; label: string; hint: string }[] = [
  { key: 'level', label: 'Leave it level',
    hint: 'Rounds added up have no one back 9.' },
  { key: 'last_round', label: 'Break it on the last round',
    hint: 'Countback on the most recent round both played.' },
]

/**
 * The board's tie rule, for the line under its title.
 *
 * Empty where there is nothing to say. A board that leaves ties standing and
 * pays nothing for them is every board this app had before the question was
 * asked, and a sentence about it would be a sentence saying nothing.
 */
export function describeTieBreak(
  lb: Pick<Leaderboard, 'tieBreak' | 'overallTie' | 'combine'>,
): string {
  const mode = tieBreakOf(lb)
  if (mode === 'countback') {
    // Which of the two it is matters to whoever is reading the board: one of
    // them will produce a winner and the other can still finish level.
    return overallTieOf(lb) === 'last_round'
      ? 'Ties broken on the back 9, then 6, 3 and 2.'
      : 'Round ties broken on the back 9, then 6, 3 and 2.'
  }
  if (lb.combine !== 'position') return ''
  return mode === 'everybody_wins'
    ? 'Level players all take the better prize.'
    : 'Level players split the prizes between them.'
}

// ─── The card's own answer ─────────────────────────────────────

/**
 * The closing stretches a countback reads, in the order it reads them.
 *
 * Nine, six, three, two. The last of them is the seventeenth and eighteenth
 * rather than the eighteenth alone: one hole is a coin toss between two
 * players who have matched each other for seventeen.
 */
export const SEGMENTS = [9, 6, 3, 2] as const
export type Segment = typeof SEGMENTS[number]

/** The first hole a segment covers. The back 9 starts at the tenth. */
export const segmentFrom = (seg: Segment): number => 19 - seg

/** What a card is worth over each closing stretch. */
export type Countback = Record<Segment, number>

export const LEVEL: Countback = { 9: 0, 6: 0, 3: 0, 2: 0 }

/**
 * A card's closing stretches, from its holes.
 *
 * `value` is whatever the board is scored on — Stableford points on this
 * board's allowance, or nett strokes. Which way round it reads is not decided
 * here: `splitBy` is told that, once.
 *
 * A hole with no score is simply not in the list, so a card played to the
 * fifteenth has a back nine of the holes it reached. Countback is only ever
 * consulted between two rows already level on the total, and comparing a
 * finished card against an unfinished one is the caller's business — the
 * in-play panel puts whoever has played more holes ahead before it ever gets
 * this far.
 */
export function countbackOf<T>(
  holes: readonly T[],
  holeNumber: (h: T) => number,
  value: (h: T) => number,
): Countback {
  const out: Countback = { 9: 0, 6: 0, 3: 0, 2: 0 }
  for (const h of holes) {
    const n = holeNumber(h)
    const v = value(h)
    for (const seg of SEGMENTS) if (n >= segmentFrom(seg)) out[seg] += v
  }
  return out
}

/** Which stretch splits two cards, and who it favours. Null if neither. */
export type Split = {
  segment: Segment
  /** Positive when the first card wins the countback. */
  favours: number
}

/**
 * The first closing stretch on which these two differ.
 *
 * Null when they match all the way down to the seventeenth, or when either
 * card is missing — a countback against a card that was never played is not a
 * tie broken, it is a tie nobody looked at.
 */
export function splitBy(
  a: Countback | undefined,
  b: Countback | undefined,
  lowerWins = false,
): Split | null {
  if (!a || !b) return null
  for (const segment of SEGMENTS) {
    if (a[segment] === b[segment]) continue
    const better = lowerWins ? b[segment] - a[segment] : a[segment] - b[segment]
    return { segment, favours: better }
  }
  return null
}

/**
 * A comparator over cards, for sorting — negative puts `a` first.
 *
 * Zero means the countback had nothing to say, so a caller sorting on it must
 * still have something behind it. Every board in this app falls back to the
 * name, which is what `rowOrder` in lib/boardRows.ts does.
 */
export function compareCountback(
  a: Countback | undefined,
  b: Countback | undefined,
  lowerWins = false,
): number {
  return -(splitBy(a, b, lowerWins)?.favours ?? 0)
}

// ─── Placing a group of level entrants ─────────────────────────

/**
 * One entrant in a round that is being placed and paid.
 *
 * `countback` is absent on a board that does not break ties that way, and on
 * an entrant whose card the caller could not read.
 */
export type Placeable = {
  id: string
  /** Whatever decides the round — Stableford points, or nett strokes. */
  score: number
  countback?: Countback
}

/** What an entrant took from a round, and why. */
export type Placing = {
  /** The place they finished, counting from 1. Shared where a tie stands. */
  place: number
  /** What the prize table paid them for it. */
  points: number
  /**
   * The stretch that split them from whoever they were level with.
   *
   * Only where a countback actually did the splitting — the badge on the
   * leaderboard is a claim that the card decided this, and a tie that stood is
   * not that.
   */
  splitBy?: Segment
}

/**
 * Who finished where, and what each place was worth.
 *
 * The prize table is read positionally: `table[0]` pays the winner. A table
 * shorter than the field pays nothing to the places past its end, which is
 * what a society's table does.
 *
 * Ties are resolved by `mode`:
 *
 *  · **countback** splits the level group by its cards. Whatever the cards
 *    cannot split is left as a tie and shared — that is "then accept a tie",
 *    and sharing the pot is what a prizegiving does with one.
 *  · **everybody_wins** gives every entrant in the group the best of the
 *    prizes their places cover, and awards more than the table holds. That is
 *    the point of it: two firsts are two firsts.
 *  · **even_split** pools those same prizes and shares them, so the total paid
 *    out is the same however the round finishes.
 *
 * The place numbers are golf's, not the array's: two sharing first are both
 * 1st and the next entrant is 3rd.
 */
export function placeRound(
  entrants: readonly Placeable[],
  table: readonly number[],
  opts: { mode?: TieBreak; lowerWins?: boolean } = {},
): Map<string, Placing> {
  const out = new Map<string, Placing>()
  if (entrants.length === 0) return out

  const mode = opts.mode ?? 'even_split'
  const lowerWins = opts.lowerWins ?? false
  const byScore = (a: Placeable, b: Placeable) =>
    lowerWins ? a.score - b.score : b.score - a.score

  const sorted = [...entrants].sort((a, b) =>
    byScore(a, b)
    // Inside a level group, countback decides the running order. It is applied
    // here as well as in the loop below so the group is already in finishing
    // order by the time places are handed out — sorting twice on two different
    // rules is how a board and its own prize column stop agreeing.
    || (mode === 'countback' ? compareCountback(a.countback, b.countback, lowerWins) : 0)
    || a.id.localeCompare(b.id))

  let i = 0
  while (i < sorted.length) {
    // Everyone level with the entrant at i, before any countback
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1].score === sorted[i].score) j++

    if (mode === 'countback' && j > i) {
      placeByCountback(sorted, i, j, table, lowerWins, out)
    } else {
      // The tie stands: one place for all of them, and the prizes those places
      // cover either shared out or handed to each in full.
      const covered: number[] = []
      for (let k = i; k <= j; k++) covered.push(table[k] ?? 0)
      const points = mode === 'everybody_wins'
        ? Math.max(...covered)
        : covered.reduce((s, p) => s + p, 0) / covered.length
      for (let k = i; k <= j; k++) out.set(sorted[k].id, { place: i + 1, points })
    }

    i = j + 1
  }
  return out
}

/**
 * A level group, split as far as its cards will go.
 *
 * The group is already in countback order. What is left is to find where it
 * actually breaks — consecutive entrants the countback could not separate stay
 * tied with each other and share those places, exactly as the whole group
 * would have. So three level on 36 where the first has the better back nine
 * and the other two match all the way down pays 1st, then a shared 2nd.
 *
 * The badge goes on both sides of a break, not only on the winner: being put
 * second on countback is as much the card's doing as being put first, and a
 * player who dropped a place wants to know it was the back nine that did it.
 */
function placeByCountback(
  sorted: readonly Placeable[],
  from: number, to: number,
  table: readonly number[],
  lowerWins: boolean,
  out: Map<string, Placing>,
) {
  // Where each run of still-level entrants begins and ends, and the stretch
  // that closed the run before it.
  let runStart = from
  let openedBy: Segment | undefined

  const close = (end: number, closedBy: Segment | undefined) => {
    const covered: number[] = []
    for (let k = runStart; k <= end; k++) covered.push(table[k] ?? 0)
    // A run of one takes its own place outright; a run the cards could not
    // split shares, which is the same pooling `even_split` does.
    const points = covered.reduce((s, p) => s + p, 0) / covered.length
    // The stretch that put this run where it is: whichever of the breaks
    // either side of it is the more telling. A run split from the entrant
    // above by the back 9 and from the one below by the back 3 was decided on
    // the back 9 — the earlier stretch is the one that placed it.
    const decidedBy = earlierSegment(openedBy, closedBy)
    for (let k = runStart; k <= end; k++) {
      out.set(sorted[k].id,
        { place: runStart + 1, points, ...(decidedBy ? { splitBy: decidedBy } : {}) })
    }
    runStart = end + 1
    openedBy = closedBy
  }

  for (let k = from; k < to; k++) {
    const split = splitBy(sorted[k].countback, sorted[k + 1].countback, lowerWins)
    if (split) close(k, split.segment)
  }
  close(to, undefined)
}

/**
 * Of two stretches, the one a countback reads first.
 *
 * Which is the one that placed an entrant: split from the row above on the
 * back 9 and from the row below on the back 3, it was the back 9 that decided
 * where they stand.
 */
export function earlierSegment(
  a: Segment | undefined, b: Segment | undefined,
): Segment | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return SEGMENTS.indexOf(a) <= SEGMENTS.indexOf(b) ? a : b
}
