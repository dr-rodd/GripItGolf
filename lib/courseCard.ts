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

/**
 * What a course's card is, in the three states it can actually be in.
 *
 * `card_verified` on its own answers a question nobody is asking. What matters
 * first is whether the course can be **played** — that is `hasCard`, which is
 * holes — and only then whether a photograph has confirmed the numbers:
 *
 *   · `confirmed`  — eighteen holes, and a scorecard photo agreed with them
 *   · `researched` — eighteen holes, from a bulk import or an older seed. It
 *                    plays perfectly well; nobody has photographed the card
 *   · `none`       — no holes at all. **This one cannot be scored**, and it is
 *                    the only state where "scoring is gated" is a true sentence
 *
 * A course with no holes is not "unverified", it is unplayable, and showing
 * those two the same way is how somebody picks a course for a trip and finds
 * out on the first tee.
 *
 * **The hole count is checked before the flag, and that order is the point.**
 * Admin can set `card_verified` by hand, and a photograph cannot have confirmed
 * a card that does not exist — so `none` wins.
 */
export type CardState = 'confirmed' | 'researched' | 'none'

export function cardState(
  holeCount: number,
  cardVerified: boolean | null | undefined,
): CardState {
  if (holeCount <= 0) return 'none'
  return cardVerified ? 'confirmed' : 'researched'
}

/** What each state is called on screen, and the `Badge` tone that carries it. */
export const CARD_STATE_LABEL: Record<CardState, string> = {
  confirmed: 'Verified',
  researched: 'Awaiting photo',
  none: 'No scorecard',
}

export const CARD_STATE_TONE: Record<CardState, 'win' | 'neutral' | 'loss'> = {
  confirmed: 'win',
  researched: 'neutral',
  none: 'loss',
}
