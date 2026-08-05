// Playing off a percentage of your course handicap.
//
// Competitive golf rarely plays off the full figure. A four-ball gives 85% of
// it, a singles competition 95%, and a club may scale that further to suit the
// field. The percentage is called an allowance, and it is a property of the
// competition — not of the player and not of the round.
//
// That distinction is the whole design here. **Nothing is ever stored at a
// reduced handicap.** `round_handicaps.playing_handicap` is the full WHS
// figure, `scores.stableford_points` is what the Postgres trigger computed
// from it, and gross is gross. A leaderboard applies its own allowance when it
// reads those cards, which is what lets one set of scorecards feed a team
// board at 85% and a singles board at 95% on the same afternoon.
//
// Store the reduction instead and the second board is unscoreable: the number
// it needs was rounded away when the first one was written.
//
// Pure. No I/O.

import type { Leaderboard } from './leaderboards'

/** No reduction. A board without an allowance is playing off all of it. */
export const FULL_ALLOWANCE = 100

/**
 * The floor.
 *
 * Foursomes is the lowest allowance the rules of golf actually name, at 50%.
 * Below that a handicap has stopped meaning anything, but the field is left
 * open down to 10 rather than pinned at 50 — a society that wants to run
 * something odd is not wrong, it is just not covered by a recommendation.
 */
export const MIN_ALLOWANCE = 10

/** The percentages offered as taps, before anyone reaches for the keypad. */
export const ALLOWANCE_PRESETS = [100, 95, 90, 85] as const

/** Whole percent, inside the range. Anything unreadable is no reduction. */
export function clampAllowance(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return FULL_ALLOWANCE
  return Math.min(FULL_ALLOWANCE, Math.max(MIN_ALLOWANCE, Math.round(n)))
}

/** What this board plays off. Absent means all of it. */
export function allowanceOf(lb: Pick<Leaderboard, 'handicapAllowance'>): number {
  return lb.handicapAllowance == null ? FULL_ALLOWANCE : clampAllowance(lb.handicapAllowance)
}

/**
 * A course handicap reduced to the allowance, to the nearest whole shot.
 *
 * **Give it the unrounded course handicap.** The percentage is taken off the
 * real figure, not off the whole number a card happens to show, and rounding
 * twice loses a shot: 11.63 shows as 12, but 90% of it is 10.47 → 10, where
 * 90% of the 12 would have been 11. `exactCourseHandicap` in
 * lib/courseHandicap.ts is what to hand it; the rounding happens here, once.
 *
 * Rounded, not truncated, so 18 off 85% is 15.3 → 15 and 16 off 85% is
 * 13.6 → 14. Truncating would quietly cost a shot at exactly the handicaps
 * where it is most argued about. A plus handicap is negative and rounds the
 * same way.
 *
 * At the full allowance this is simply the whole number the card shows.
 */
export function allowedHandicap(courseHandicap: number, allowance: number): number {
  if (allowance === FULL_ALLOWANCE) return Math.round(courseHandicap)
  return Math.round(courseHandicap * allowance / 100)
}

/**
 * The allowance the rules recommend for this board.
 *
 * From the WHS/Golf Ireland tables:
 *
 *   Four-ball stroke play or Stableford   85%
 *   Individual (singles) competition       95%
 *
 * A team board here is scored from individual cards combined — better ball,
 * hero, cut the dead weight — which is four-ball in everything but name, so it
 * takes the four-ball figure.
 *
 * Two allowances in those tables have nowhere to land yet. Foursomes is 50% of
 * the partners' *combined* handicaps, and this platform has no alternate-shot
 * format to attach that to. Four-ball match play is 90% of the difference from
 * the lowest player, which is a different shape of calculation altogether —
 * matchplay here is scored hole by hole off each player's own card, so the
 * draw is left at full and says so.
 */
export function suggestedAllowance(lb: Partial<Leaderboard>): number {
  if (lb.competition !== 'league') return FULL_ALLOWANCE
  return lb.audience === 'team' ? 85 : 95
}

/** "85% of course handicap" / "Full course handicap". */
export function describeAllowance(allowance: number): string {
  return allowance === FULL_ALLOWANCE
    ? 'Full course handicap'
    : `${allowance}% of course handicap`
}

// ─── Cycling through them while scoring ────────────────────────

/**
 * The handicaps a card has to be able to show, and where it opens.
 *
 * A group scoring a round may be playing for two boards at once on different
 * allowances, so the number on the card is not one number. The scorer needs to
 * see each of them, which means one control that walks a list.
 *
 * `steps` is every allowance in play, highest first, and always includes 100 —
 * the full figure is the reference every reduction is a reduction *of*, so it
 * belongs on the list whether or not a board happens to use it.
 *
 * `startIndex` points at the primary board's allowance. The first board a trip
 * made is what the trip is about, so that is the handicap the card opens on.
 *
 * A trip where nothing is reduced gets a single step. The caller reads that as
 * "no control": a button that cycles through one value is furniture.
 */
export function allowanceCycle(
  boards: readonly Leaderboard[],
): { steps: number[]; startIndex: number } {
  const league = boards.filter(b => b.competition === 'league')
  const steps = [...new Set([FULL_ALLOWANCE, ...league.map(allowanceOf)])]
    .sort((a, b) => b - a)

  // The primary is the first board made, whatever it is. A trip led by a
  // matchplay draw has no allowance to open on, so it opens on the full figure.
  const primary = boards[0]
  const opening = primary && primary.competition === 'league'
    ? allowanceOf(primary)
    : FULL_ALLOWANCE
  const startIndex = Math.max(0, steps.indexOf(opening))

  return { steps, startIndex }
}

/** Whether the scoring card needs the control at all. */
export function hasReduction(steps: readonly number[]): boolean {
  return steps.length > 1
}
