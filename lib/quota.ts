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
// **The scale above is not the only one clubs play.** It is this app's
// `standard`, and it is what a Quota leaderboard scores on. A knockout match
// can be linked to a round and decided on quota too — see
// lib/matchDecision.ts — and that offers two others by name, so the scales
// all live here together rather than a second table growing up beside this
// one. Adding a scale means adding a row to QUOTA_SCALES and nothing else.
//
// This is the only copy of these rules. The board (lib/boardRows.ts), the
// live panel in scoring and the matchplay decision all import from here; none
// of them restates a table.
//
// Pure. No I/O, no React.

export const QUOTA_BASE = 36

/**
 * The scales a quota can be played on.
 *
 * They differ only in what going under par is worth, and that difference is
 * the whole of the choice — so each one carries the words that describe it,
 * and the form prints them under the control rather than hiding them in a
 * help page. Nobody carries a points table in their head.
 *
 *   standard   1, 2, 4, 6 — what a Quota leaderboard scores on
 *   liverpool  1, 2, 3, 4 — one point a step, which is gross Stableford
 *   chicago    1, 2, 4, 8 — doubling from par up
 *
 * Below par each is its own; at par and above all three agree, because a
 * bogey is one and a double is nothing wherever you play.
 */
export type QuotaScale = 'standard' | 'liverpool' | 'chicago'

export const QUOTA_SCALES: {
  key: QuotaScale
  label: string
  /** Bogey, par, birdie, eagle — in words, for the form. */
  hint: string
}[] = [
  { key: 'standard', label: 'Quota',
    hint: 'Bogey 1, par 2, birdie 4, eagle 6.' },
  { key: 'liverpool', label: 'Liverpool style',
    hint: 'Bogey 1, par 2, birdie 3, eagle 4.' },
  { key: 'chicago', label: 'Chicago style',
    hint: 'Bogey 1, par 2, birdie 4, eagle 8.' },
]

/**
 * What a hole earns, off the gross against the par the player is playing —
 * `effectivePar`, so a ladies card reads its own numbers.
 *
 * Null gross — unscored, or a no-return — earns nothing, never a penalty:
 * the quota itself is the pressure.
 */
export function quotaPoints(gross: number | null, par: number): number {
  return quotaPointsOn(gross, par, 'standard')
}

/**
 * The same, on a named scale.
 *
 * `quotaPoints` above is this one on `standard`, kept under its own name
 * because it is what every quota board in the app scores on and reads better
 * at the call site than a third argument repeated everywhere.
 *
 * Under par the scales part company and each says its own thing. **Above par
 * they agree**, and that is not a coincidence worth restating three times: a
 * bogey is one point and a double bogey is nothing on every scale anybody
 * plays, so it is written once here and the scales only answer for the holes
 * they actually disagree about.
 */
export function quotaPointsOn(
  gross: number | null, par: number, scale: QuotaScale,
): number {
  if (gross == null) return 0
  const under = par - gross
  if (under <= -2) return 0        // double bogey or worse
  if (under <= 0) return under + 2 // bogey 1, par 2
  if (scale === 'liverpool') return under + 2          // 3, 4, 5 …
  if (scale === 'chicago') return 2 ** (under + 1)     // 4, 8, 16 …
  return 2 * under + 2                                 // 4, 6, 8 …
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
