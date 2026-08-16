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

/**
 * The tees this player can be given — their own gender's, or every tee on the
 * course when that gender has none.
 *
 * A course can legitimately arrive with only men's tees: a club that does not
 * publish a ladies card, or a bulk import whose ratings carried no ladies set.
 * Filtered strictly, a woman on such a course has nothing selectable — and
 * that does not merely stop her. `canStart` in `LiveScoringFlow` is an
 * `.every` over the selected players, so one player with no assignable tee
 * disables the round for everybody on the card, with the explanatory hint
 * suppressed and no way to back out of a solo selection.
 *
 * The resume path has always fallen back this way (`?? courseTees[0]`). This
 * is that rule, once, somewhere all four screens can reach it — the setup
 * auto-select, the tee picker, the resume, and manual score entry. A fifth
 * copy of `t.gender === player.gender` is how this reopens, which is what the
 * structural check in `test:handicap-allowance` is watching for.
 *
 * **Hardest tee first, by slope**, which is the order a scorecard prints and
 * the order a group talks in — the back tees at the top, the forward ones
 * below. It used to come back in whatever order the database happened to
 * return, so the same course could offer its tees one way on one screen and
 * another way on the next, and neither matched the card in the pocket. The
 * legacy `/score-entry` screen had already reached for this and solved it in
 * its own query (`.order('slope', { ascending: false })`); doing it here
 * makes it true of the four screens that go through this function as well,
 * and that query is now merely agreeing rather than deciding.
 *
 * Slope rather than name, because the names are not a sequence: a course can
 * print Black/Blue/White, or Championship/Medal/Society, or Sandstone/Slate/
 * Granite/Claret, and only the rating says which is the harder of two.
 *
 * **A tee with no slope sorts last, never first.** An unrated tee is one the
 * research or the card check could not fill in, and putting it at the head of
 * the list would make it both the first thing offered and — through
 * `teesForPlayer(...)[0]` on the resume path — the fallback guess. Ties go to
 * the name so the order is stable rather than merely sorted.
 *
 * A caller's "exactly one option" test is unaffected: sorting does not change
 * how many there are.
 */
export function teesForPlayer<
  T extends { gender: string; slope?: number | null; name?: string | null },
>(
  courseTees: readonly T[],
  gender: string,
): T[] {
  const mine = courseTees.filter(t => t.gender === gender)
  return bySlopeDesc(mine.length > 0 ? mine : courseTees)
}

/** Hardest first; unrated last; then by name, so the order never wobbles. */
function bySlopeDesc<T extends { slope?: number | null; name?: string | null }>(
  tees: readonly T[],
): T[] {
  return [...tees].sort((a, b) => {
    const sa = typeof a.slope === 'number' ? a.slope : null
    const sb = typeof b.slope === 'number' ? b.slope : null
    if (sa !== sb) {
      if (sa === null) return 1
      if (sb === null) return -1
      return sb - sa
    }
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}
