// A test club match, played hole by hole (D311, s1c) — the only copy of how
// a match card is made up. Pure: handed the course as each player plays it,
// each player's course handicap, the shots they receive in the match, a form
// and a seed, it answers every score written and where the card stands. The
// same inputs always give the same match.
//
// It plays the card's own rules, never restating them: the strokes a side
// receives and who wins a hole are lib/matchCard.ts's `playCard` (shots
// through `shotsReceived`, the one copy), the gross scores are
// lib/testClubCards.ts's `makeCard`, and a match level after 18 goes down
// the 19th off the course's holes (`extraCourseHole`) until one is won.

import { extraCourseHole, playCard, type CardHole, type CardSide, type CardState } from './matchCard'
import { extraHoleGross, makeCard, type CardForm } from './testClubCards'

export interface CourseHole { number: number; par: number; parLadies: number | null; si: number; siLadies: number | null }

export interface MatchPlayerSpec {
  id: string
  gender: string
  /** The course handicap the player's own card is made from (their tee). */
  courseHcp: number
  /** Shots received in the match — the difference from the lowest (`matchStrokes`). */
  receives: number
  form: CardForm
  seed: string
}

const parOf = (h: CourseHole, g: string) => (g === 'F' && h.parLadies ? h.parLadies : h.par)
const siOf = (h: CourseHole, g: string) => (g === 'F' && h.siLadies ? h.siLadies : h.si)

/**
 * The match, scored until it is settled — or, with `stopAfter`, until that
 * hole (a match in play: never past the point where it could be settled, so
 * `stopAfter` should be nine or fewer). Every hole each player has played.
 */
export function scoreMatch(o: {
  holes: readonly CourseHole[]
  a: MatchPlayerSpec
  b: MatchPlayerSpec
  stopAfter?: number
}): { rows: { playerId: string; hole: number; gross: number }[]; state: CardState; upTo: number } {
  const holes = [...o.holes].sort((x, y) => x.number - y.number).slice(0, 18)
  const cardHoles: CardHole[] = holes.map(h => ({ holeNumber: h.number, par: h.par, strokeIndex: h.si, strokeIndexLadies: h.siLadies }))
  const side = (p: MatchPlayerSpec): CardSide => ({ id: p.id, players: [{ id: p.id, gender: p.gender, receives: p.receives }] })
  const A = side(o.a), B = side(o.b)
  const own = new Map([o.a, o.b].map(p => [p.id, new Map(makeCard({
    holes: holes.map(h => ({ number: h.number, par: parOf(h, p.gender), si: siOf(h, p.gender) })),
    courseHcp: p.courseHcp, form: p.form, seed: p.seed,
  }).map(c => [c.hole, c.gross]))]))

  const scores = new Map<string, Map<number, number | null>>([[o.a.id, new Map()], [o.b.id, new Map()]])
  let state = playCard(cardHoles, A, B, scores, new Map()).state
  let upTo = 0
  for (let hole = 1; hole <= 36; hole++) {
    for (const p of [o.a, o.b]) {
      const g = hole <= 18
        ? own.get(p.id)!.get(hole)!
        : (() => {
            const h = holes[extraCourseHole(hole) - 1]
            return extraHoleGross(parOf(h, p.gender), siOf(h, p.gender), p.courseHcp, `${p.seed}:x${hole}`)
          })()
      scores.get(p.id)!.set(hole, g)
    }
    upTo = hole
    state = playCard(cardHoles, A, B, scores, new Map()).state
    if (state.settled) break
    if (o.stopAfter !== undefined && hole >= o.stopAfter) break
  }
  const rows = [o.a, o.b].flatMap(p => [...scores.get(p.id)!].filter(([h]) => h <= upTo).map(([hole, g]) => ({ playerId: p.id, hole, gross: g as number })))
  return { rows, state, upTo }
}
