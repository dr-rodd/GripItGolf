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
 * What a course's card is, in the four states it can actually be in.
 *
 * `card_verified` on its own answers a question nobody is asking. What matters
 * first is whether the course can be **played** — that is `hasCard`, which is
 * holes — and only then whether a photograph has confirmed the numbers:
 *
 *   · `confirmed`  — eighteen holes, tees to play off, and a scorecard photo
 *                    agreed with the card
 *   · `researched` — eighteen holes and tees, from a bulk import or an older
 *                    seed. It plays perfectly well; nobody has photographed it
 *   · `unrated`    — a card, but not one tee with a course rating and slope.
 *                    **Cannot be scored**, and a photograph will not fix it:
 *                    Irish cards print SSS, so the ratings come from elsewhere
 *   · `none`       — no holes at all. **Cannot be scored**, and here a photo
 *                    is exactly the answer — it creates the eighteen
 *
 * A course with no holes is not "unverified", it is unplayable, and showing
 * those two the same way is how somebody picks a course for a trip and finds
 * out on the first tee.
 *
 * **This names the blocker, not the paperwork**, which is why two of the four
 * are failures and why the order below is what it is. The hole count is checked
 * first — admin can set `card_verified` by hand and a photograph cannot have
 * confirmed a card that does not exist. The tee count is checked next, ahead of
 * the flag for the same reason in reverse: a confirmed card with nothing to
 * play off still cannot be started, and `unrated` is the only thing on the row
 * that would ever say so. Add the ratings and it flips to `confirmed` — nothing
 * is lost by ranking the blocker first.
 */
export type CardState = 'confirmed' | 'researched' | 'unrated' | 'none'

export function cardState(
  holeCount: number,
  cardVerified: boolean | null | undefined,
  teeCount: number,
): CardState {
  if (holeCount <= 0) return 'none'
  if (teeCount <= 0) return 'unrated'
  return cardVerified ? 'confirmed' : 'researched'
}

/** What each state is called on screen, and the `Badge` tone that carries it. */
export const CARD_STATE_LABEL: Record<CardState, string> = {
  confirmed: 'Verified',
  researched: 'Awaiting photo',
  unrated: 'Awaiting ratings',
  none: 'No scorecard',
}

export const CARD_STATE_TONE: Record<CardState, 'win' | 'neutral' | 'loss'> = {
  confirmed: 'win',
  researched: 'neutral',
  unrated: 'loss',
  none: 'loss',
}

/**
 * A tee a card can be played off: a course rating, a slope and a par, the
 * three a course handicap needs. Migration 073's trigger asks the same.
 */
export function isRatedTee(t: {
  course_rating?: number | null; slope?: number | null; par?: number | null
}): boolean {
  return t.course_rating != null && t.slope != null && t.par != null
}

/** How many of a course's tees a card can be played off. */
export function ratedTeeCount(tees: readonly {
  course_rating?: number | null; slope?: number | null; par?: number | null
}[]): number {
  return tees.filter(isRatedTee).length
}

/**
 * Why no card can start on this course, or null when one can (D68, Ross,
 * 11 Nov 2026) — **the one question every door asks**: the stroke round,
 * the knockout and session match cards, a league period's Start a card, and
 * the server (`startPeriodCard`, migration 073's trigger on `live_rounds`).
 *
 *   · `none`    — fewer than eighteen holes. A photo of the printed card
 *                 fixes it in place (`ScorecardGate`).
 *   · `unrated` — the holes, but no tee with a rating, a slope and a par.
 *                 A photo will not fix it: Irish cards print SSS.
 *
 * Read off `cardState`, so the label a picker shows and the refusal a door
 * gives can never disagree. **Choosing a course is never refused** (D69) —
 * only starting a card on one.
 */
export type CardBlocker = 'none' | 'unrated'

export function cardBlocker(holeCount: number, teeCount: number): CardBlocker | null {
  if (holeCount < 18) return 'none'
  const state = cardState(holeCount, null, teeCount)
  return state === 'none' || state === 'unrated' ? state : null
}

/** The plain line under a course's name where a card cannot start (D69) — never a pill. */
export const CARD_BLOCKER_LABEL: Record<CardBlocker, string> = {
  none: 'No scorecard',
  unrated: 'No ratings',
}

/** What `ScorecardGate` says, and what a refused start says. */
export const GATE_TITLE: Record<CardBlocker, string> = {
  none: 'No scorecard for this course yet',
  unrated: 'No tee ratings for this course yet',
}

export function gateLine(blocker: CardBlocker, event: boolean): string {
  if (blocker === 'none') return 'Photograph the printed card to add its pars and indexes.'
  // Never "Trip Setup" (Ross, 11 Nov 2026): it has no way to add ratings.
  return event
    ? 'This course has no tee ratings yet, so handicaps can’t be worked out. Ask the organiser.'
    : 'This course has no tee ratings yet, so handicaps can’t be worked out.'
}

/**
 * A listed course's blocker, from the counts read with the list
 * (`DirectoryCourse.hole_count`/`rated_tees`). Null where the counts were
 * not read — no line is drawn rather than a guess.
 */
export function listedBlocker(c: { hole_count?: number | null; rated_tees?: number | null }): CardBlocker | null {
  if (c.hole_count == null) return null
  return cardBlocker(c.hole_count, c.rated_tees ?? 0)
}

/**
 * A course read with its card's counts embedded — `courses(…, holes(count),
 * tees(course_rating, slope, par))` alongside what a page already reads —
 * as a blocker. Null where the embed was not asked for.
 */
export function embeddedBlocker(course: unknown): CardBlocker | null {
  const c = course as {
    holes?: { count: number }[]
    tees?: { course_rating?: number | null; slope?: number | null; par?: number | null }[]
  } | null
  if (!c || !Array.isArray(c.holes) || !Array.isArray(c.tees)) return null
  return cardBlocker(c.holes[0]?.count ?? 0, ratedTeeCount(c.tees))
}

/**
 * The blockers of the courses some rows point at, by course id — the rows
 * read **in a query of their own**, fail-soft, with each course's counts
 * embedded (`course_id, courses(holes(count), tees(course_rating, slope,
 * par))`). A refused read draws no lines rather than costing the page.
 */
export function blockersByCourse(
  res: { data: unknown[] | null; error: unknown },
): Map<string, CardBlocker> {
  const out = new Map<string, CardBlocker>()
  if (res.error) return out
  for (const r of (res.data ?? []) as { id?: string; course_id?: string | null; courses?: unknown }[]) {
    // A row pointing at a course (`CARD_COUNTS`), or a course itself (`COURSE_CARD_COUNTS`).
    const id = 'courses' in r ? r.course_id : r.id
    const b = id ? embeddedBlocker('courses' in r ? r.courses : r) : null
    if (id && b) out.set(id, b)
  }
  return out
}

/** The embed `blockersByCourse` reads — one copy, so every page asks the same. */
export const CARD_COUNTS = 'course_id, courses(holes(count), tees(course_rating, slope, par))'

/** The same counts asked of the courses themselves, by id. */
export const COURSE_CARD_COUNTS = 'id, holes(count), tees(course_rating, slope, par)'
