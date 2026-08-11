// Quota play — beat your own number.
//
// Every player starts the round owing a quota: 36 minus their course
// handicap. An 18-handicap owes 18 points, scratch owes 36, and a plus
// handicap owes more than 36 — the handicap is negative, and subtracting it
// raises the bar, which is the quota mirror of giving shots back. Points are
// then earned off the GROSS score against par, no stroke indices anywhere:
//
//   bogey     1
//   par       2
//   birdie    4
//   eagle     6
//
// and the round's result is points earned minus the quota — positive beat
// it, negative fell short. The handicap speaks exactly once, in the target,
// never per hole; that is what makes the format quick to keep in your head
// standing on a tee.
//
// Two edges the table above does not name, decided here so they are decided
// once: an albatross continues the two-point step to 8, and double bogey or
// worse — or a hole with no score — earns nothing.
//
// A board's handicap allowance reduces the course handicap before the
// subtraction, exactly as it reduces the handicap everywhere else, so 85%
// quota and full quota are two boards off the same cards.
//
// This is the only copy of these rules. The board (lib/boardRows.ts) and the
// live panel in scoring both import from here; neither restates the table.
//
// Pure. No I/O, no React.

export const QUOTA_BASE = 36

/**
 * What a hole earns, off the gross against the par the player is playing —
 * `effectivePar`, so a ladies card reads its own numbers.
 *
 * Null gross — unscored, or a no-return — earns nothing, never a penalty:
 * the quota itself is the pressure.
 */
export function quotaPoints(gross: number | null, par: number): number {
  if (gross == null) return 0
  const over = gross - par
  if (over >= 2) return 0
  if (over === 1) return 1
  if (over === 0) return 2
  if (over === -1) return 4
  if (over === -2) return 6
  return 8
}

/**
 * The number this player is chasing: 36 minus the course handicap.
 *
 * The handicap arrives already whole and already reduced by any board
 * allowance — `allowedHandicap` has spoken before this is called. A plus
 * handicap is negative and pushes the target above 36.
 */
export function quotaTarget(courseHandicap: number): number {
  return QUOTA_BASE - courseHandicap
}
