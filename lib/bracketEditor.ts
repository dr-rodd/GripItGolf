// The draw laid out as a bracket, by hand — the only copy of its rules
// (Ross, 5 Nov 2026: "the user can key in a draw to look however they like,
// giving byes through multiple rounds if that's what they want, but can't
// create an unworkable draw where a player already exists in a slot that
// would need to be given to the result of a match").
//
// The bracket is a grid of **places**: round 1 has 2^rounds of them, each
// later round half as many, the Final two. A player can be put in any place
// of any round — a player put in a later round has a bye through every
// round before it. What keeps the draw workable is one rule, held both
// ways: **a place with a player in it has nobody under it**. So a place
// that the result of a match below will fill can never be given a player,
// and the places under a player put in a later round are not there at all.
//
// Whatever is laid out ends as the first round, slot by slot (`layoutSlots`
// — a player in a later round sits in the first slot of the places under
// them, the rest empty), which lib/matchplay.ts `bracketFromSlots` builds:
// a match with nobody in it is no match, and a bye runs as far as it goes.
//
// Indices: `r` is the round counted from 0 (the first round), `c` the place
// in it counted from the top. Place (r, c) is fed by the match of places
// (r − 1, 2c) and (r − 1, 2c + 1), and feeds place (r + 1, c >> 1). Pure.

import { MAX_BRACKET, nextPowerOfTwo, seedOrder } from './matchplay'

export type BracketLayout = {
  /** Rounds in the draw: 2^rounds places in the first, two in the Final. */
  rounds: number
  /** `cells[r][c]` — the player in place c of round r + 1, or null. */
  cells: (string | null)[][]
}

/** The most rounds a draw can have — a draw of 64 (lib/matchplay.ts). */
export const MAX_ROUNDS = Math.log2(MAX_BRACKET)

/** The rounds a draw of this many needs: the field rounded up to a power of two. */
export function roundsFor(fieldSize: number): number {
  return Math.min(MAX_ROUNDS, Math.log2(nextPowerOfTwo(Math.max(fieldSize, 2))))
}

const clamp = (rounds: number) => Math.max(1, Math.min(MAX_ROUNDS, Math.round(rounds)))

/** A bracket of this many rounds with nobody in it. */
export function emptyLayout(rounds: number): BracketLayout {
  const R = clamp(rounds)
  return { rounds: R, cells: Array.from({ length: R }, (_, r) => Array(2 ** (R - r)).fill(null)) }
}

/** Players in the places under (r, c) — not counting the place itself. */
function under(layout: BracketLayout, r: number, c: number): string[] {
  const out: string[] = []
  for (let d = r - 1; d >= 0; d--) {
    const span = 2 ** (r - d)
    for (let i = c * span; i < (c + 1) * span; i++) {
      const id = layout.cells[d][i]
      if (id) out.push(id)
    }
  }
  return out
}

/** Whether a place above (r, c) — one it would feed — already has a player. */
function takenAbove(layout: BracketLayout, r: number, c: number): boolean {
  for (let u = r + 1, i = c >> 1; u < layout.rounds; u++, i >>= 1) {
    if (layout.cells[u][i]) return true
  }
  return false
}

/** Everybody in the draw. */
export function layoutPlaced(layout: BracketLayout): string[] {
  return layout.cells.flat().filter((id): id is string => id !== null)
}

/**
 * What a place shows:
 *
 * * **player** — somebody is in it;
 * * **open** — it can take a player; `bye` when nobody is in it or under it
 *   and somebody is opposite, who walks through;
 * * **through** — one player under it, who reaches it by byes;
 * * **winner** — the result of a match under it fills it, so no player can
 *   be put in it;
 * * **hidden** — under a player put in a later round: not part of the draw.
 */
export type PlaceState =
  | { kind: 'player'; id: string }
  | { kind: 'open'; bye: boolean }
  | { kind: 'through'; id: string }
  | { kind: 'winner' }
  | { kind: 'hidden' }

export function placeState(layout: BracketLayout, r: number, c: number): PlaceState {
  const id = layout.cells[r]?.[c]
  if (id === undefined) return { kind: 'hidden' }
  if (id) return { kind: 'player', id }
  if (takenAbove(layout, r, c)) return { kind: 'hidden' }
  const below = under(layout, r, c)
  if (below.length === 1) return { kind: 'through', id: below[0] }
  if (below.length > 1) return { kind: 'winner' }
  const opposite = r < layout.rounds - 1
    && (layout.cells[r][c ^ 1] !== null || under(layout, r, c ^ 1).length > 0)
  return { kind: 'open', bye: opposite }
}

/** Whether a player can be put in (r, c): it holds one already, or it is open. */
export function mayPlace(layout: BracketLayout, r: number, c: number): boolean {
  const s = placeState(layout, r, c)
  return s.kind === 'player' || s.kind === 'open'
}

/** Whether the match of places (r, 2m) and (r, 2m + 1) is part of the draw. */
export function matchShown(layout: BracketLayout, r: number, m: number): boolean {
  return r >= layout.rounds - 1 || !(layout.cells[r + 1][m] || takenAbove(layout, r + 1, m))
}

/**
 * A player put in a place — **null empties it**. A player already in the
 * draw moves here, and whoever was here takes the place they left (a swap),
 * so nobody is ever in the draw twice. A place that cannot take a player is
 * left as it is.
 */
export function placeAt(layout: BracketLayout, r: number, c: number, id: string | null): BracketLayout {
  if (!mayPlace(layout, r, c)) return layout
  const cells = layout.cells.map(row => [...row])
  const here = cells[r][c]
  if (id !== null) {
    for (let d = 0; d < cells.length; d++) {
      const at = cells[d].indexOf(id)
      if (at !== -1) cells[d][at] = here
    }
  }
  cells[r][c] = id
  return { rounds: layout.rounds, cells }
}

/**
 * One more round, at the start (the **+**): everybody keeps their place as
 * seen from the Final — a quarter-finalist is still a quarter-finalist — and
 * the new first round under them is empty, places to fill or byes.
 */
export function addRound(layout: BracketLayout): BracketLayout {
  if (layout.rounds >= MAX_ROUNDS) return layout
  return {
    rounds: layout.rounds + 1,
    cells: [Array(2 ** (layout.rounds + 1)).fill(null), ...layout.cells.map(row => [...row])],
  }
}

/**
 * Whether the first round can go (the **−**): never the last round, never
 * fewer places than players, and only while no first-round match has two
 * players in it — a lone player moves up to the place their match fed.
 */
export function mayRemoveRound(layout: BracketLayout, fieldSize: number): boolean {
  if (layout.rounds <= 1 || 2 ** (layout.rounds - 1) < fieldSize) return false
  const first = layout.cells[0]
  for (let m = 0; m < first.length; m += 2) if (first[m] && first[m + 1]) return false
  return true
}

/** The draw a round shorter (see `mayRemoveRound`), or as it was where it cannot be. */
export function removeRound(layout: BracketLayout, fieldSize: number): BracketLayout {
  if (!mayRemoveRound(layout, fieldSize)) return layout
  const cells = layout.cells.slice(1).map(row => [...row])
  const first = layout.cells[0]
  for (let m = 0; m < first.length / 2; m++) {
    const lone = first[2 * m] ?? first[2 * m + 1]
    if (lone) cells[0][m] = lone
  }
  return { rounds: layout.rounds - 1, cells }
}

/** The bracket grown to at least this many rounds, everybody in it kept. */
export function grownTo(layout: BracketLayout, rounds: number): BracketLayout {
  let out = layout
  while (out.rounds < Math.min(rounds, MAX_ROUNDS)) out = addRound(out)
  return out
}

/** The bracket with anybody no longer in the field taken out. */
export function withoutLeavers(layout: BracketLayout, field: readonly string[]): BracketLayout {
  const inField = new Set(field)
  return { rounds: layout.rounds, cells: layout.cells.map(row => row.map(id => (id && inField.has(id) ? id : null))) }
}

/**
 * The first round the bracket makes, slot by slot (null empty) — a player in
 * a later round in the first slot of the places under them.
 */
export function layoutSlots(layout: BracketLayout): (string | null)[] {
  const slots: (string | null)[] = Array(2 ** layout.rounds).fill(null)
  layout.cells.forEach((row, r) => row.forEach((id, c) => { if (id) slots[c * 2 ** r] = id }))
  return slots
}

/**
 * A first round laid out as a bracket — each player shown in the furthest
 * place they reach on byes alone, which is where they first play (or, alone
 * in a half, the Final).
 */
export function layoutFromSlots(slots: readonly (string | null)[]): BracketLayout {
  const size = nextPowerOfTwo(Math.max(slots.length, 2))
  const layout = emptyLayout(Math.log2(size))
  const alone = (r: number, c: number) => {
    let n = 0
    for (let i = c * 2 ** r; i < (c + 1) * 2 ** r; i++) if (slots[i]) n++
    return n === 1
  }
  slots.forEach((id, i) => {
    if (!id) return
    let r = 0
    while (r + 1 < layout.rounds && alone(r + 1, i >> (r + 1))) r++
    layout.cells[r][i >> r] = id
  })
  return layout
}

/**
 * The bracket filled from an order, as a seeded draw seats it — seed 1 and
 * 2 in opposite halves, the byes to the top seeds — over however many
 * rounds the bracket has, so a bigger bracket gives the top seeds byes
 * through more of them.
 */
export function filledLayout(rounds: number, order: readonly string[]): BracketLayout {
  const R = clamp(rounds)
  return layoutFromSlots(seedOrder(2 ** R).map(n => order[n - 1] ?? null))
}

/** Why a first round cannot be built, or null: each half of the Final needs somebody. */
export function slotsIssue(slots: readonly (string | null)[]): string | null {
  const half = slots.length / 2
  const top = slots.slice(0, half).some(Boolean)
  const bottom = slots.slice(half).some(Boolean)
  return top && bottom ? null : 'Each half of the draw needs a player.'
}

/**
 * Why this bracket cannot be drawn yet, or null: everybody entered is in it
 * (where there are places enough), and each half of the Final has somebody.
 */
export function layoutIssue(layout: BracketLayout, field: readonly string[]): string | null {
  const places = 2 ** layout.rounds
  if (field.length > places) return `The draw has ${places} places for ${field.length} players. Add a round.`
  const placed = new Set(layoutPlaced(layout))
  const left = field.filter(id => !placed.has(id)).length
  if (left > 0) return `${left} ${left === 1 ? 'player is' : 'players are'} not in the draw yet.`
  return slotsIssue(layoutSlots(layout))
}
