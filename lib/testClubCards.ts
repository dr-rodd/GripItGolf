// A test club character's card, hole by hole (D312) — the only copy of how
// one is made up. Pure: handed the course's holes as the player plays them
// (their own par and stroke index), their course handicap, a form word and
// a seed, it answers eighteen gross scores. The same inputs always give the
// same card, which is what makes loading a week twice change nothing.
//
// The model: a club golfer finishes a few strokes over nett par — more the
// higher the handicap, with more spread — and a form word moves that
// (hot, good, steady, poor, awful, or wild for Jed's swings), or a number
// does it exactly. The strokes over are then shared out across the holes,
// the harder holes (low stroke index) more likely to take one, a few
// pars and the odd birdie given back where the total is under. A set piece
// (a "suspicious 4 on 18") overrides its hole whatever the rest says.
//
// Shots come from lib/handicap.ts — a plus handicap gives them back, as on
// every real card.

import { shotsReceived } from './handicap'

export type CardForm = 'hot' | 'good' | 'steady' | 'poor' | 'awful' | 'wild' | number
export const CARD_FORMS: readonly CardForm[] = ['hot', 'good', 'steady', 'poor', 'awful', 'wild']

export interface CardHoleSpec { number: number; par: number; si: number }
export interface SetPiece { hole: number; gross: number }

/** A seeded stream of numbers in [0, 1) — mulberry32 on the seed's hash. */
export function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
  let a = h >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A standard normal draw from two uniforms (Box–Muller). */
function normal(r: () => number): number {
  const u = Math.max(r(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

/**
 * Strokes over nett par for the round: about 1.5 plus an eighth of the
 * course handicap on an ordinary day (a scratch golfer a shot or two over, a
 * 30 handicap about five — 31 Stableford points), spread wider the higher
 * the handicap. A number form is the answer itself.
 */
export function targetOver(courseHcp: number, form: CardForm, r: () => number): number {
  if (typeof form === 'number') return Math.round(form)
  const ch = Math.max(0, courseHcp)
  const mean = 1.5 + ch / 8
  const spread = 1.8 + ch / 10
  const shift = { hot: -4, good: -2, steady: 0, poor: 3, awful: 7, wild: 0 }[form]
  const width = form === 'wild' ? spread * 2.2 : form === 'steady' ? spread * 0.6 : spread
  return Math.round(mean + shift + normal(r) * width)
}

/** The card: eighteen gross scores, by hole number. */
export function makeCard(o: {
  holes: readonly CardHoleSpec[]
  courseHcp: number
  form: CardForm
  seed: string
  set?: readonly SetPiece[]
}): { hole: number; gross: number }[] {
  const r = seeded(o.seed)
  const holes = [...o.holes].sort((a, b) => a.number - b.number)
  // Nett par on every hole to begin with.
  const gross = new Map(holes.map(h => [h.number, h.par + shotsReceived(o.courseHcp, h.si)]))
  let over = targetOver(o.courseHcp, o.form, r)

  // Strokes over go where a golfer drops them: weighted to the hard holes,
  // never more than four over nett par on one hole (a blob is a blob).
  const weight = (h: CardHoleSpec) => 1 + (19 - h.si) / 18
  const nettPar = (h: CardHoleSpec) => h.par + shotsReceived(o.courseHcp, h.si)
  for (let guard = 0; over > 0 && guard < 400; guard++) {
    const total = holes.reduce((t, h) => t + weight(h), 0)
    let pick = r() * total
    const h = holes.find(x => (pick -= weight(x)) < 0) ?? holes[holes.length - 1]
    const g = gross.get(h.number)!
    if (g - nettPar(h) >= 4) continue
    gross.set(h.number, g + 1)
    over--
  }
  // Strokes under come back on the easy holes and the long ones — a birdie
  // at most, never below two, never two under nett par on one hole.
  for (let guard = 0; over < 0 && guard < 400; guard++) {
    const h = holes[Math.floor(r() * holes.length)]
    const g = gross.get(h.number)!
    if (g <= 2 || g <= h.par - 1 || g <= nettPar(h) - 2) continue
    if (h.si < 6 && r() < 0.6) continue
    gross.set(h.number, g - 1)
    over++
  }
  for (const s of o.set ?? []) if (gross.has(s.hole)) gross.set(s.hole, Math.max(1, Math.min(15, Math.round(s.gross))))
  return holes.map(h => ({ hole: h.number, gross: gross.get(h.number)! }))
}

/** Stableford points for a hole off the full course handicap — the canonical rule, through lib/handicap.ts. */
export const holePoints = (gross: number, par: number, si: number, courseHcp: number) =>
  Math.max(0, par + 2 - (gross - shotsReceived(courseHcp, si)))

/**
 * One extra hole of a match that went down the 19th (D311): nett par, give or
 * take — the same seed, the same hole. Level matches are decided here, so it
 * is kept to a golfer's ordinary range rather than a card's whole story.
 */
export function extraHoleGross(par: number, si: number, courseHcp: number, seed: string): number {
  const r = seeded(seed)()
  const delta = r < 0.14 ? -1 : r < 0.62 ? 0 : r < 0.92 ? 1 : 2
  return Math.max(2, par + shotsReceived(courseHcp, si) + delta)
}
