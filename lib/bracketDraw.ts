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
// * **By hand** — the bracket itself (Ross, 5 Nov 2026), sized off the
//   field with a round more or fewer to taste, every place tapped and given
//   a player, in any round — a player put in a later round has byes to it
//   (lib/bracketEditor.ts, the rules). Random and seeded fill the same
//   bracket, and any place can be changed by hand after.
//
// The draw can be made now, left for later, or **set for a date and a time**
// it goes live (Ross, 5 Nov 2026) — a draw built now and kept back until
// then (`premade`), or one made at that moment from whoever has joined: at
// random, by handicap, or in an order the organiser set with late joiners
// after it. The first visit after the moment makes it (`/api/match/draw-due`,
// one visit only — `claimDue`), the nightly job is the backstop, and the
// event's home screen counts down to it (`drawLiveAt`).
//
// **Editing a draw later is editing its first-round slots** (the next phase:
// docs/event-use-cases.md) — which is why every method produces slots
// rather than a finished tree. Pure. No I/O.

import { nextPowerOfTwo, seedOrder, MIN_PLAYERS, MAX_BRACKET } from './matchplay'
import { irishInstant } from './irishTime'
import {
  MAX_ROUNDS, addRound, emptyLayout, filledLayout, grownTo, layoutIssue, layoutSlots, mayPlaceLocked,
  mayRemoveRound, optimalShape, placeAt, removeRound, roundsFor, withinShape, withoutLeavers, type BracketLayout,
} from './bracketEditor'

/** How the bracket was last filled: from a hat, by seed, or by hand from empty. */
export type DrawMethod = 'random' | 'seeded' | 'manual'

export const DRAW_METHODS: { key: DrawMethod; label: string; hint: string }[] = [
  { key: 'random', label: 'Random', hint: 'Filled from a hat. Tap again to draw again.' },
  { key: 'seeded', label: 'Seeded', hint: 'You number the field. 1 and 2 meet only in the Final.' },
  { key: 'manual', label: 'By hand', hint: 'Start empty and put each player in yourself.' },
]

/** When the draw is made. */
export type DrawWhen = 'now' | 'later' | 'date'

export const DRAW_TIMINGS: { key: DrawWhen; label: string; hint: string }[] = [
  { key: 'now', label: 'Draw now', hint: 'Use the current field.' },
  { key: 'later', label: 'Draw later', hint: 'Allows time for more players to enter.' },
  { key: 'date', label: 'Set date', hint: 'A pre-made draw or random allocation will go live at a time of your choosing.' },
]

/**
 * How a draw set for a date is made: built now and kept back until then
 * (`premade`), or made at that moment from whoever has joined.
 */
export type AutoSeeding = 'premade' | 'random' | 'handicap' | 'order'

export const AUTO_SEEDINGS: { key: AutoSeeding; label: string; hint: string }[] = [
  { key: 'premade', label: 'Pre-made', hint: 'Build the draw now — it stays hidden until it goes live.' },
  { key: 'random', label: 'Random allocation', hint: 'Drawn at random from whoever has joined by then.' },
  { key: 'handicap', label: 'By handicap', hint: 'Seeded by handicap, lowest first, from whoever has joined by then.' },
  { key: 'order', label: 'My order', hint: 'The numbering you set, late joiners after by handicap.' },
]

/**
 * The plan for the draw, kept in `trips.bracket_setup.draw` — no migration.
 * Absent means nothing planned: the organiser makes it by hand.
 */
export type DrawPlan = {
  when: 'later' | 'date'
  /** The day it goes live — `when: 'date'` only. */
  on?: string
  /** The time it goes live that day, Irish time ("20:00"). Absent is the start of the day. */
  at?: string
  seeding?: AutoSeeding
  /** Player ids in seed order, for `seeding: 'order'`. */
  order?: string[]
  /** A pre-made draw's first round, place by place by player id (null a bye) — `seeding: 'premade'`. */
  slots?: (string | null)[]
  /** Its seed numbers, place by place (null where nobody is), where it was seeded. */
  seeds?: (number | null)[]
  /** When a visit took the job of making it (`claimDue`) — so two visits never both do. */
  claimedAt?: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** The stored plan, or null — never half of one. A pre-made one without its draw reads as random. */
export function parseDrawPlan(raw: unknown): DrawPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.when === 'later') return { when: 'later' }
  if (r.when !== 'date' || typeof r.on !== 'string' || !DATE.test(r.on)) return null
  const order = Array.isArray(r.order) ? r.order.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  const slots = Array.isArray(r.slots) && r.slots.length >= 2 && (r.slots.length & (r.slots.length - 1)) === 0
    && r.slots.every(x => x === null || (typeof x === 'string' && x.length > 0))
    ? r.slots as (string | null)[] : null
  const seeds = Array.isArray(r.seeds) && slots && r.seeds.length === slots.length
    && r.seeds.every(n => n === null || Number.isInteger(n))
    ? r.seeds as (number | null)[] : null
  let seeding = AUTO_SEEDINGS.find(s => s.key === r.seeding)?.key ?? 'random'
  if (seeding === 'premade' && !slots) seeding = 'random'
  return {
    when: 'date', on: r.on,
    ...(typeof r.at === 'string' && TIME.test(r.at) ? { at: r.at } : {}),
    seeding,
    ...(seeding === 'order' && order.length > 0 ? { order } : {}),
    ...(seeding === 'premade' && slots ? { slots, ...(seeds ? { seeds } : {}) } : {}),
    ...(typeof r.claimedAt === 'string' && !Number.isNaN(Date.parse(r.claimedAt)) ? { claimedAt: r.claimedAt } : {}),
  }
}

/** The moment a dated draw goes live — its day and time, Irish time (lib/irishTime.ts). */
export function drawLiveAt(plan: DrawPlan | null): Date | null {
  if (plan?.when !== 'date' || !plan.on) return null
  return irishInstant(plan.on, plan.at ?? '00:00')
}

/** How long a visit has to make a draw it took on before another may. */
export const CLAIM_MS = 5 * 60_000

/**
 * Is a dated draw due to be made? Once its moment has come, only while
 * nothing is drawn, and not while a visit that took it on in the last few
 * minutes may still be making it.
 */
export function drawDue(plan: DrawPlan | null, now: Date, alreadyDrawn: boolean): boolean {
  const live = drawLiveAt(plan)
  if (alreadyDrawn || !live || now < live) return false
  const claimed = plan?.claimedAt ? Date.parse(plan.claimedAt) : NaN
  return Number.isNaN(claimed) || now.getTime() - claimed >= CLAIM_MS
}

/** "Goes live on Sat 14 Nov at 8:00 pm, at random". */
export function describeDrawPlan(
  plan: DrawPlan | null, shortDate: (d: string) => string, clock: (t: string) => string = t => t,
): string {
  if (!plan || plan.when === 'later') return 'Not drawn yet — made from the organiser area.'
  const how = plan.seeding === 'premade' ? 'as you made it'
    : plan.seeding === 'handicap' ? 'by handicap'
      : plan.seeding === 'order' ? 'in your order' : 'at random'
  return `Goes live on ${shortDate(plan.on as string)}${plan.at ? ` at ${clock(plan.at)}` : ''}, ${how}.`
}

/**
 * A pre-made draw's places as the field now stands — anybody who has left
 * since it was made is a bye, never a ghost in the draw.
 */
export function premadeSlots(slots: readonly (string | null)[], field: readonly string[]): (string | null)[] {
  const inField = new Set(field)
  return slots.map(id => (id && inField.has(id) ? id : null))
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

/**
 * The field in a leaderboard's finishing order (Ross, 4 Nov 2026: seeds
 * from the event the field came from) — those on the board first, as they
 * finished, then everybody it never had, in the order they were.
 */
export function byStandings(order: readonly string[], standings: readonly string[]): string[] {
  const inField = new Set(order)
  const placed = standings.filter((id, i) => inField.has(id) && standings.indexOf(id) === i)
  const done = new Set(placed)
  return [...placed, ...order.filter(id => !done.has(id))]
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
  /** The bracket as laid out on screen (lib/bracketEditor.ts). */
  layout: BracketLayout
  /**
   * Changed by hand since it was filled. Until then a random or seeded
   * bracket is filled afresh from its order whenever the field or the rounds
   * change; after, it is the organiser's and only ever changed by them.
   */
  edited?: boolean
  /**
   * Locked to the best spread (Ross, 5 Nov 2026: "a lock symbol, default
   * locked") — the fewest rounds and only the places a seeded draw's byes
   * leave (lib/bracketEditor.ts `optimalShape`). Unlocked, any place in any
   * round, and a round more or fewer. Absent is unlocked.
   */
  locked?: boolean
}

/** A fresh draft for this field: the bracket it needs, empty and locked (Ross: start with the bracket). */
export function newDraft(field: readonly string[], method: DrawMethod = 'manual'): DrawDraft {
  const rounds = roundsFor(field.length)
  return {
    method, order: [...field], locked: true,
    layout: method === 'manual' ? emptyLayout(rounds) : filledLayout(rounds, field),
  }
}

const filledFromOrder = (d: DrawDraft) => d.method !== 'manual' && !d.edited

/**
 * The draft lined up with the field as it now stands (somebody added or
 * taken out): never fewer places than players, and a bracket still as it
 * was filled filled again from its order.
 */
export function syncDraft(draft: DrawDraft, field: readonly string[]): DrawDraft {
  const order = reconcileOrder(draft.order, field)
  if (draft.locked) {
    // Locked keeps to the spread for the field as it now stands: refilled
    // where it was filled, else everybody outside its places taken out.
    const shape = optimalShape(field.length)
    if (filledFromOrder(draft)) return { ...draft, order, layout: filledLayout(shape.rounds, order) }
    return { ...draft, order, layout: withinShape(withoutLeavers(draft.layout, field), shape) }
  }
  const rounds = Math.max(draft.layout.rounds, roundsFor(field.length))
  if (filledFromOrder(draft)) return { ...draft, order, layout: filledLayout(rounds, order) }
  return { ...draft, order, layout: grownTo(withoutLeavers(draft.layout, field), rounds) }
}

/** The bracket filled at random, again: a new shuffle every time. */
export function drawnAtRandom(draft: DrawDraft, field: readonly string[], rand: () => number = Math.random): DrawDraft {
  const order = shuffled(field, rand)
  return { ...draft, method: 'random', order, layout: filledLayout(draft.layout.rounds, order), edited: false }
}

/** The bracket filled by seed, from this order. */
export function drawnBySeed(draft: DrawDraft, order: readonly string[]): DrawDraft {
  return { ...draft, method: 'seeded', order: [...order], layout: filledLayout(draft.layout.rounds, order), edited: false }
}

/** The bracket emptied, its rounds kept, to be filled by hand. */
export function clearedDraft(draft: DrawDraft): DrawDraft {
  return { ...draft, method: 'manual', layout: emptyLayout(draft.layout.rounds), edited: false }
}

/** One place changed by hand (lib/bracketEditor.ts `placeAt`). */
export function placedInDraft(draft: DrawDraft, r: number, c: number, id: string | null, fieldSize?: number): DrawDraft {
  if (draft.locked && !mayPlaceLocked(draft.layout, optimalShape(fieldSize ?? draft.order.length), r, c)) return draft
  const layout = placeAt(draft.layout, r, c, id)
  return layout === draft.layout ? draft : { ...draft, layout, edited: true }
}

/** Whether the **+** or **−** beside the rounds can be pressed. */
export function mayChangeRounds(draft: DrawDraft, delta: 1 | -1, fieldSize: number): boolean {
  // Locked is the fewest rounds, by definition.
  if (draft.locked) return false
  const R = draft.layout.rounds
  if (delta > 0) return R < MAX_ROUNDS
  if (filledFromOrder(draft)) return R > roundsFor(fieldSize)
  return mayRemoveRound(draft.layout, fieldSize)
}

/**
 * A round more or fewer. A bracket still as it was filled is filled again at
 * the new size — a bigger one gives the top of the order byes through more
 * rounds; one laid out by hand keeps everybody where they stand as seen from
 * the Final (lib/bracketEditor.ts `addRound`, `removeRound`).
 */
export function withRounds(draft: DrawDraft, delta: 1 | -1, fieldSize: number): DrawDraft {
  if (!mayChangeRounds(draft, delta, fieldSize)) return draft
  if (filledFromOrder(draft)) return { ...draft, layout: filledLayout(draft.layout.rounds + delta, draft.order) }
  return { ...draft, layout: delta > 0 ? addRound(draft.layout) : removeRound(draft.layout, fieldSize) }
}

/**
 * The lock, turned. Unlocking keeps the bracket exactly as it is; locking
 * brings it back to the best spread — refilled where it was filled, else
 * anybody outside the spread's places taken out to be placed again.
 */
export function withLock(draft: DrawDraft, locked: boolean, field: readonly string[]): DrawDraft {
  return syncDraft({ ...draft, locked }, field)
}

/** A seeded draft's seed number for a player, or null. */
export function seedOf(draft: DrawDraft, id: string | null): number | null {
  if (draft.method !== 'seeded' || !id) return null
  const at = draft.order.indexOf(id)
  return at === -1 ? null : at + 1
}

/** The first round the draft makes, and its seed numbers when it is seeded. */
export function draftSlots(draft: DrawDraft): { slots: (string | null)[]; seeds: (number | null)[] | null } {
  const slots = layoutSlots(draft.layout)
  return { slots, seeds: draft.method === 'seeded' ? slots.map(id => seedOf(draft, id)) : null }
}

/** Why this draft cannot be saved, or null when it can. Hand it a synced draft. */
export function draftIssue(draft: DrawDraft, field: readonly string[], ceiling: number = MAX_BRACKET): string | null {
  return drawCountIssue(field.length, ceiling) ?? layoutIssue(draft.layout, field)
}
