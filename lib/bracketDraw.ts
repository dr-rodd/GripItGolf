// Making a knockout's draw — the only copy of the rules (docs/event-use-
// cases.md, story 2, "The draw"). Three ways, all ending in the same place —
// the first round laid out slot by slot, which lib/matchplay.ts
// `bracketFromSlots` turns into the whole tree:
//
// * **Random** — the field shuffled, then seated as a seeded draw would be,
//   so the byes still fall where a draw puts them (spread down the draw,
//   never two in one match). No seed numbers are shown: nobody was seeded.
// * **Seeded** — a numbered list the organiser orders: typing a number moves
//   a player to it, dragging renumbers, and the list can be started from
//   handicap order or shuffled as often as liked. Seed 1 and 2 meet only in
//   the Final.
// * **Manual** — the organiser's own layout: the draw is sized off the field
//   so far, and each empty place is tapped and given a player. A place left
//   empty is a bye.
//
// The draw can be made at creation, left for later, or made **on a date** by
// the nightly job (`drawDue`) — random, or seeded by the field's handicaps,
// or by an order the organiser already set with late joiners after it.
//
// **Editing a draw later is editing its first-round slots** (the next phase:
// docs/event-use-cases.md) — which is why every method produces slots
// rather than a finished tree. Pure. No I/O.

import { nextPowerOfTwo, seedOrder, MIN_PLAYERS, MAX_BRACKET } from './matchplay'

export type DrawMethod = 'random' | 'seeded' | 'manual'

export const DRAW_METHODS: { key: DrawMethod; label: string; hint: string }[] = [
  { key: 'random', label: 'Random', hint: 'The field drawn out of a hat.' },
  { key: 'seeded', label: 'Seeded', hint: 'You number the field — 1 and 2 can only meet in the Final.' },
  { key: 'manual', label: 'Pick the matches', hint: 'You place each player in the draw yourself.' },
]

/** When the draw is made. */
export type DrawWhen = 'now' | 'later' | 'date'

export const DRAW_TIMINGS: { key: DrawWhen; label: string; hint: string }[] = [
  { key: 'now', label: 'Make the draw now', hint: 'From the players entered so far.' },
  { key: 'later', label: 'Later', hint: 'From the organiser area, once the field is in.' },
  { key: 'date', label: 'On a date', hint: 'Made by itself overnight, from whoever has joined by then.' },
]

/** How a draw made on its own, on a date, orders the field. */
export type AutoSeeding = 'random' | 'handicap' | 'order'

export const AUTO_SEEDINGS: { key: AutoSeeding; label: string; hint: string }[] = [
  { key: 'random', label: 'Random', hint: 'Drawn out of a hat on the night.' },
  { key: 'handicap', label: 'By handicap', hint: 'Lowest handicap seeded first.' },
  { key: 'order', label: 'My order', hint: 'The numbering you set, late joiners after by handicap.' },
]

/**
 * The plan for the draw, kept in `trips.bracket_setup.draw` — no migration.
 * Absent means nothing planned: the organiser makes it by hand.
 */
export type DrawPlan = {
  when: 'later' | 'date'
  /** The day the nightly job makes it — `when: 'date'` only. */
  on?: string
  seeding?: AutoSeeding
  /** Player ids in seed order, for `seeding: 'order'`. */
  order?: string[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** The stored plan, or null — never half of one. */
export function parseDrawPlan(raw: unknown): DrawPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.when === 'later') return { when: 'later' }
  if (r.when !== 'date' || typeof r.on !== 'string' || !DATE.test(r.on)) return null
  const seeding = AUTO_SEEDINGS.find(s => s.key === r.seeding)?.key ?? 'random'
  const order = Array.isArray(r.order) ? r.order.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  return { when: 'date', on: r.on, seeding, ...(seeding === 'order' && order.length > 0 ? { order } : {}) }
}

/** Is a dated draw due tonight? Only when nothing has been drawn yet. */
export function drawDue(plan: DrawPlan | null, today: string, alreadyDrawn: boolean): boolean {
  return !alreadyDrawn && plan?.when === 'date' && !!plan.on && plan.on <= today
}

/** "Drawn on Sat 14 Nov, by handicap". */
export function describeDrawPlan(plan: DrawPlan | null, shortDate: (d: string) => string): string {
  if (!plan || plan.when === 'later') return 'Not drawn yet — made from the organiser area.'
  const how = plan.seeding === 'handicap' ? 'by handicap'
    : plan.seeding === 'order' ? 'in your order' : 'at random'
  return `Drawn by itself on ${shortDate(plan.on as string)}, ${how}.`
}

// ─── The field ─────────────────────────────────────────────────

/** Somebody who can be put in the draw. */
export type DrawEntrant = { id: string; name: string; handicap: number | null }

/** Why this many cannot be drawn, or null when they can. */
export function drawCountIssue(count: number, ceiling: number = MAX_BRACKET): string | null {
  if (count < MIN_PLAYERS) return `A draw needs at least ${MIN_PLAYERS} players.`
  if (count > ceiling) return `This draw takes up to ${ceiling} players — ${count} have entered.`
  return null
}

/** A copy shuffled — Fisher–Yates over the random source handed in. */
export function shuffled<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Lowest handicap first; a handicap nobody has given yet goes last, never
 * first (pending is not scratch — lib/handicap.ts). Level ones keep the
 * order they arrived in.
 */
export function byHandicap<T extends { handicap: number | null }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.handicap === null && b.handicap === null) return 0
    if (a.handicap === null) return 1
    if (b.handicap === null) return -1
    return a.handicap - b.handicap
  })
}

// ─── Seeding ───────────────────────────────────────────────────

/**
 * The list with one id moved to a seed number — 1-based, as typed — and the
 * rest shuffled up or down to make room. Typing past the end moves it last.
 */
export function moveToSeed(order: readonly string[], id: string, seed: number): string[] {
  const from = order.indexOf(id)
  if (from === -1 || !Number.isFinite(seed)) return [...order]
  const rest = order.filter(x => x !== id)
  const at = Math.max(0, Math.min(rest.length, Math.round(seed) - 1))
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

/**
 * The seed order lined up with today's field: ids no longer in it dropped,
 * newcomers added after, in the order given (the caller passes them in
 * handicap order for a dated draw).
 */
export function reconcileOrder(order: readonly string[], field: readonly string[]): string[] {
  const inField = new Set(field)
  const kept = order.filter(id => inField.has(id))
  const seen = new Set(kept)
  return [...kept, ...field.filter(id => !seen.has(id))]
}

/** A seeded draw's first round: seed n placed where the seed order puts it. */
export function slotsFromSeeds(order: readonly string[]): { slots: (string | null)[]; seeds: number[] } {
  const size = nextPowerOfTwo(Math.max(order.length, 2))
  const seeds = seedOrder(size)
  return { slots: seeds.map(n => order[n - 1] ?? null), seeds }
}

// ─── Manual ────────────────────────────────────────────────────

/** An empty manual draw, sized off the field so far. */
export function emptySlots(fieldSize: number): (string | null)[] {
  return Array(nextPowerOfTwo(Math.max(fieldSize, 2))).fill(null)
}

/**
 * One player put in one place — taken out of wherever else they were, so
 * nobody is in the draw twice. Null empties the place.
 */
export function placeInSlot(slots: readonly (string | null)[], index: number, id: string | null): (string | null)[] {
  const out = slots.map(s => (id !== null && s === id ? null : s))
  if (index >= 0 && index < out.length) out[index] = id
  return out
}

/** The manual draw resized for a field that grew or shrank, keeping who is placed. */
export function resizeSlots(slots: readonly (string | null)[], fieldSize: number, field: readonly string[]): (string | null)[] {
  const size = nextPowerOfTwo(Math.max(fieldSize, 2))
  const inField = new Set(field)
  const kept = slots.map(s => (s && inField.has(s) ? s : null))
  if (kept.length === size) return kept
  if (kept.length < size) return [...kept, ...Array(size - kept.length).fill(null)]
  // Smaller: keep the placed players, in their order, packed into the new size.
  const placed = kept.filter((s): s is string => s !== null).slice(0, size)
  return [...placed, ...Array(size - placed.length).fill(null)]
}

/** Players not yet in the manual draw. */
export function unplaced(slots: readonly (string | null)[], field: readonly string[]): string[] {
  const placed = new Set(slots.filter(Boolean))
  return field.filter(id => !placed.has(id))
}

/**
 * Why this manual draw cannot be saved yet, or null. Everybody entered must
 * be in it, and no match may be empty on both sides — a place left empty is
 * a bye for the player opposite, and a bye needs somebody to walk through.
 */
export function manualIssue(slots: readonly (string | null)[], field: readonly string[]): string | null {
  const left = unplaced(slots, field).length
  if (left > 0) return `${left} ${left === 1 ? 'player is' : 'players are'} not in the draw yet.`
  for (let i = 0; i < slots.length; i += 2) {
    if (slots[i] === null && slots[i + 1] === null) {
      return `Match ${i / 2 + 1} has nobody in it — move a player into it.`
    }
  }
  return null
}

// ─── In play ───────────────────────────────────────────────────

/**
 * Has the draw started? Once any match has a result that was played — a
 * bye is awarded, not played — or any hole has been entered on a match
 * card, the draw is **in play** and is not redrawn from here: changing it
 * then is the editor's job (next phase), which touches only what has not
 * started and says so before it does.
 */
export function drawInPlay(
  matches: readonly { winner: string | null; aIsBye: boolean; bIsBye: boolean }[],
  cardEntries: number,
): boolean {
  return cardEntries > 0 || matches.some(m => m.winner !== null && !m.aIsBye && !m.bIsBye)
}

// ─── A draw being made ─────────────────────────────────────────

/** The draw on screen before it is saved — the builder's state. */
export type DrawDraft = {
  method: DrawMethod
  /** The field in order: shuffled for random, numbered for seeded. */
  order: string[]
  /** The manual layout, place by place. */
  slots: (string | null)[]
}

/** A fresh draft for this field: random, in the order it was entered. */
export function newDraft(field: readonly string[], method: DrawMethod = 'random'): DrawDraft {
  return { method, order: [...field], slots: emptySlots(field.length) }
}

/** The draft lined up with the field as it now stands (somebody added or taken out). */
export function syncDraft(draft: DrawDraft, field: readonly string[]): DrawDraft {
  return {
    method: draft.method,
    order: reconcileOrder(draft.order, field),
    slots: resizeSlots(draft.slots, field.length, field),
  }
}

/** The first round the draft makes, and its seed numbers when it is seeded. */
export function draftSlots(draft: DrawDraft): { slots: (string | null)[]; seeds: number[] | null } {
  if (draft.method === 'manual') return { slots: [...draft.slots], seeds: null }
  const { slots, seeds } = slotsFromSeeds(draft.order)
  return { slots, seeds: draft.method === 'seeded' ? seeds : null }
}

/** Why this draft cannot be saved, or null when it can. */
export function draftIssue(draft: DrawDraft, field: readonly string[], ceiling: number = MAX_BRACKET): string | null {
  const count = drawCountIssue(field.length, ceiling)
  if (count) return count
  if (draft.method === 'manual') return manualIssue(draft.slots, field)
  return null
}
