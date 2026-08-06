// Where the player stands, on the board the trip is actually about.
//
// Two ways to answer one question, and which one applies depends on the
// board:
//
//   the cheap path    `lib/playerSummary.ts` — one query for `scores`, then
//                     arithmetic. Correct **only** for an individual
//                     Stableford board totalled up, which is what most trips
//                     run and what the hub has always shown.
//
//   the full path     `lib/boardRows.ts` — correct for every board there is,
//                     but `RowContext` wants players, teams, memberships,
//                     holes, rounds, resolved scores, handicaps and tees.
//                     That is the leaderboard page's whole query budget.
//
// Taking the cheap path on a board it does not fit is not a rounding error:
// strokes sorts the other way, so it would print the leader last. Hence the
// narrow test below — anything it does not recognise falls through to the
// rows, and `scripts/test-hub.tsx` holds the two against each other on a
// board they both understand.
//
// Pure. No I/O.

import type { Leaderboard } from './leaderboards'
import type { BoardRow } from './boardRows'
import { type Standing, standingFor, ordinal } from './playerSummary'

/**
 * Whether the cheap path can answer for this board.
 *
 * Every clause is load-bearing:
 *
 *   league        a draw has no table at all
 *   individual    a team board ranks teams, and the cheap path knows nothing
 *                 about who is in which
 *   stableford    strokes is lowest-wins; the cheap path sorts highest-first
 *   not position  a prize table pays by finishing place, which is a different
 *                 number entirely from the points that earned it
 */
export function usesSimpleStandings(lb: Leaderboard | null | undefined): boolean {
  if (!lb) return false
  return lb.competition === 'league'
    && lb.audience === 'individual'
    && lb.scoring === 'stableford'
    && lb.combine !== 'position'
}

/** A place on a board, and how big the field is. */
export type Placing = { position: number; field: number }

/**
 * The player's placing, off the cheap path.
 *
 * Null when they have not played a hole — which is not the same as being
 * last, and the hub omits the line rather than inventing a position.
 */
export function placingFromStandings(
  playerId: string,
  rows: readonly Standing[],
): Placing | null {
  const mine = standingFor(playerId, rows)
  if (!mine) return null
  return { position: mine.position, field: rows.length }
}

/**
 * The same, off a real board's rows.
 *
 * `buildRows` hands them back **already in finishing order**, so the shared
 * place for a tie is simply where the first row on that total sits. Reading
 * it that way means this never has to know whether the board sorts up or
 * down — which is exactly the fact the cheap path gets wrong when it is
 * applied to a board it does not fit.
 *
 * `entrantIds` is the player on an individual board and everybody in their
 * team on a team one, because a team row carries its members' ids.
 */
export function placingFromRows(
  entrantIds: readonly string[],
  rows: readonly BoardRow[],
): Placing | null {
  const mine = rows.find(r => r.playerIds.some(id => entrantIds.includes(id)))
  if (!mine) return null
  const first = rows.findIndex(r => r.total === mine.total)
  return { position: first + 1, field: rows.length }
}

/**
 * "1st of 12" — the same wording the hub has always used.
 *
 * A shared place prints as the place itself, not as "T3": two players level
 * for third are both third, which is what the number already says.
 */
export function describePlacing(p: Placing | null): string {
  if (!p || p.position < 1 || p.field < 1) return ''
  return `${ordinal(p.position)} of ${p.field}`
}
