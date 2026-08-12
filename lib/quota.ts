// Quota play — beat your own number.
//
// Every player starts the round owing a quota: 36 minus their course
// handicap. An 18-handicap owes 18 points, scratch owes 36, and a plus
// handicap owes more than 36 — the handicap is negative, and subtracting it
// raises the bar, which is the quota mirror of giving shots back. Points are
// then earned off the GROSS score against par, no stroke indices anywhere,
// and the round's result is points earned minus the quota — positive beat it,
// negative fell short. The handicap speaks exactly once, in the target, never
// per hole; that is what makes the format quick to keep in your head standing
// on a tee.
//
// **Which points, though, is a choice**, and it is the trip's to make: a
// Quota leaderboard is asked its scale when it is created. Clubs run several
// and they differ only in what going under par is worth — see QUOTA_SCALES.
//
// Two edges no scale names, decided here so they are decided once: double
// bogey or worse — or a hole with no score — earns nothing, and going further
// under par continues whatever step that scale is already on.
//
// A board's handicap allowance reduces the course handicap before the
// subtraction, exactly as it reduces the handicap everywhere else, so 85%
// quota and full quota are two boards off the same cards.
//
// This is the only copy of these rules. The board (lib/boardRows.ts), the
// live panel in scoring and the matchplay decision all import from here; none
// of them restates a table.
//
// Pure. No I/O, no React.

import type { Leaderboard } from './leaderboards'

export const QUOTA_BASE = 36

/**
 * The scales a quota can be played on.
 *
 * Two, and they differ only in what going under par is worth. That difference
 * is the whole of the choice, so each carries the words that describe it and
 * the form prints them under the control rather than hiding them in a help
 * page — nobody carries a points table in their head.
 *
 *   liverpool  1, 2, 3, 4 — one point a step, which is gross Stableford
 *   chicago    1, 2, 4, 8 — doubling from par up
 *
 * At par and above the two agree, because a bogey is one point and a double
 * bogey is nothing wherever you play.
 *
 * **There was a third**, an in-between 1, 2, 4, 6, and it was this app's
 * default for exactly as long as it took somebody to notice it differed from
 * Chicago at eagle alone. Two names for nearly the same thing is worse than
 * one name, so it was retired and the boards playing it moved onto Chicago —
 * which is why `DEFAULT_QUOTA_SCALE` is Chicago and not the first row here.
 */
export type QuotaScale = 'liverpool' | 'chicago'

export const QUOTA_SCALES: {
  key: QuotaScale
  label: string
  /** Bogey, par, birdie, eagle — in words, for the form. */
  hint: string
}[] = [
  { key: 'liverpool', label: 'Liverpool style',
    hint: 'Bogey 1, par 2, birdie 3, eagle 4.' },
  { key: 'chicago', label: 'Chicago style',
    hint: 'Bogey 1, par 2, birdie 4, eagle 8.' },
]

/**
 * What a board with nothing stored plays.
 *
 * Chicago, because the retired scale it replaces differed from it only at
 * eagle — so a Quota board set up before the question was asked keeps the
 * closest thing to what it had. Every other absent setting in this codebase
 * reads back as the no-op; this one cannot, because there is no such thing as
 * a quota with no scale.
 */
export const DEFAULT_QUOTA_SCALE: QuotaScale = 'chicago'

export function parseQuotaScale(v: unknown): QuotaScale | null {
  return QUOTA_SCALES.find(s => s.key === v)?.key ?? null
}

/** The scale this board scores on. */
export function quotaScaleOf(lb: Pick<Leaderboard, 'quotaScale'>): QuotaScale {
  return parseQuotaScale(lb.quotaScale) ?? DEFAULT_QUOTA_SCALE
}

/** "Chicago style" / "Liverpool style". */
export function quotaScaleLabel(scale: QuotaScale): string {
  return QUOTA_SCALES.find(s => s.key === scale)?.label ?? 'Quota'
}

/**
 * What a hole earns, off the gross against the par the player is playing —
 * `effectivePar`, so a ladies card reads its own numbers — on the scale the
 * board is playing.
 *
 * Null gross — unscored, or a no-return — earns nothing, never a penalty:
 * the quota itself is the pressure.
 */
export function quotaPoints(
  gross: number | null, par: number, scale: QuotaScale,
): number {
  if (gross == null) return 0
  const under = par - gross
  if (under <= -2) return 0        // double bogey or worse
  if (under <= 0) return under + 2 // bogey 1, par 2
  // Under par the two part company. Above it they agree, which is why that
  // half is written once above rather than by each of them.
  return scale === 'liverpool'
    ? under + 2                    // birdie 3, eagle 4, albatross 5 …
    : 2 ** (under + 1)             // birdie 4, eagle 8, albatross 16 …
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
