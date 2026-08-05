// The WHS course handicap, in one place.
//
//   Course handicap = Handicap Index × Slope ÷ 113 + (Course Rating − Par)
//
// It was written out three times — live scoring, standard entry, the legacy
// live screen — each rounding at the end, which was fine while the rounded
// whole number was the only thing anybody wanted.
//
// It stopped being fine when leaderboards gained a handicap allowance. A
// percentage of a *rounded* figure is not a percentage of the real one, and
// the difference is a shot: 11.63 rounds to 12, and 90% of those two numbers
// are 10 and 11. So the unrounded figure is the primary one here and the
// whole number is derived from it, rather than the other way round.
//
// Pure. No I/O.

/** What a set of tees contributes to the calculation. */
export type TeeRating = { slope: number; course_rating: number; par: number }

/**
 * The course handicap as the formula leaves it, before anything rounds it.
 *
 * This is the figure an allowance is taken off. Do not round before applying
 * one — see the note above, and `allowedHandicap` in lib/handicapAllowance.ts,
 * which does the rounding once at the end.
 */
export function exactCourseHandicap(handicapIndex: number, tee: TeeRating): number {
  return handicapIndex * (tee.slope / 113) + (tee.course_rating - tee.par)
}

/**
 * The whole number: what a card shows at the full handicap, and what a
 * `round_handicaps` row stores.
 *
 * Stored rounded on purpose. The Postgres stableford trigger takes
 * `FLOOR(handicap / 18)` and `MOD(handicap::INT, 18)` separately, and those
 * two disagree about a fraction — 17.5 stored raw gives no shot on any hole,
 * where 18 gives one on every hole. The trigger is canonical and is not being
 * rewritten to suit this, so what it reads stays whole.
 */
export function courseHandicap(handicapIndex: number, tee: TeeRating): number {
  return Math.round(exactCourseHandicap(handicapIndex, tee))
}
