// A course's card, shaped for a phone.
//
// Eighteen holes do not fit across a phone in one row, and a golfer does not
// read them that way anyway — the card is two nines with a total under each,
// which is how every printed scorecard has always been laid out.
//
// **One set of numbers, never two.** A course can carry a ladies par and
// stroke index alongside the men's, and showing both side by side would be
// four rows of small figures on a screen with room for two. So the card is
// the one the reader plays off, decided by who is holding the phone.
//
// `ladies_data_verified` is deliberately not consulted. It is a column on
// `courses` that never reaches the scoring calculation — Cleanup 1 established
// that — and a flag that does not gate the maths has no business gating the
// display of the same numbers.
//
// Yardages are not here because they are not anywhere: the eight `yardage_*`
// columns exist and have never been populated. An empty column is worse than
// no column.
//
// Pure. No I/O.

import { effectivePar, effectiveSI, type RowHole } from './boardRows'

/** One hole as the card prints it. */
export type CardHole = {
  number: number
  par: number
  strokeIndex: number
}

/** Nine holes and what they add up to. */
export type CardNine = {
  holes: CardHole[]
  par: number
}

export type CourseCard = {
  front: CardNine
  back: CardNine
  /** Front plus back. The number on the bottom right of every scorecard. */
  par: number
  /**
   * Whether these are the ladies numbers.
   *
   * The card says so on itself: a player looking at a par 5 where the card
   * beside them says par 4 should be able to tell which one they are reading.
   */
  ladies: boolean
}

/**
 * Whether this course has a ladies card recorded at all.
 *
 * Both columns, on at least one hole. A course with par but no stroke index
 * would produce a card half in one set of numbers and half in the other,
 * which is worse than showing the men's throughout.
 */
export function hasLadiesCard(holes: readonly RowHole[]): boolean {
  return holes.some(h => h.par_ladies != null)
    && holes.some(h => h.stroke_index_ladies != null)
}

/**
 * The card this player reads.
 *
 * `gender` is the player's own, from the roster — so a course with a ladies
 * card shows it to the women on the trip and the men's to everyone else,
 * including a visitor this device does not recognise.
 *
 * Falls back to the men's numbers hole by hole where a ladies figure is
 * missing, which is what `effectivePar` and `effectiveSI` do for the scoring
 * itself. The card and the board therefore agree about every hole.
 */
export function courseCard(
  holes: readonly RowHole[],
  gender: string,
): CourseCard {
  const ladies = gender === 'F' && hasLadiesCard(holes)
  const g = ladies ? 'F' : 'M'

  const ordered = [...holes].sort((a, b) => a.hole_number - b.hole_number)
  const shaped: CardHole[] = ordered.map(h => ({
    number: h.hole_number,
    par: effectivePar(h, g),
    strokeIndex: effectiveSI(h, g),
  }))

  const front = nine(shaped.filter(h => h.number <= 9))
  const back = nine(shaped.filter(h => h.number > 9))

  return { front, back, par: front.par + back.par, ladies }
}

function nine(holes: CardHole[]): CardNine {
  return { holes, par: holes.reduce((sum, h) => sum + h.par, 0) }
}

/**
 * Whether there is a card worth printing.
 *
 * A course with no holes recorded — which the platform allows, since a course
 * can be added before its card is — gets no scorecard section rather than a
 * grid of blanks.
 */
export function hasCard(holes: readonly RowHole[]): boolean {
  return holes.length > 0
}
