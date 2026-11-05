// Seeding a match play event's field from another event (Ross, 4 Nov 2026).
//
// On the creation form's field step an organiser can type another event's
// code — last year's knockout, a qualifier — and its players come across
// into the list, names, handicaps and tees, to be added to or taken out
// like any typed name. An event with a public PIN asks for it first, as its
// door does. With that event's organiser PIN as well, everything its players
// shared with it comes across too when the new event is made — their contact
// details, nicknames, colours and home clubs — and its notices: running the
// same event again next year without asking everyone again.
//
// Both PINs are the platform's soft lock (lib/passcode.ts), checked in the
// browser to give the tick and again on the server before anything closed
// to the browser is copied (app/api/event/import). The privacy notice says
// so: what a player shares with an event can be used by whoever holds its
// organiser PIN in the events they make from it.
//
// Pure. `app/dashboard/create/SeedFromEvent.tsx` does the asking.

import { formatHandicap } from './handicap'

/**
 * A player on a creation form's list. `sourceId` is who they were in the
 * event the field was seeded from; `brought` marks a row the seed added, as
 * against a typed one it matched by name.
 */
export type FieldPlayer = {
  name: string; handicap: string; gender: 'M' | 'F'; sourceId?: string; brought?: boolean
  /** The field step's tag for them, by its key (lib/fieldTags.ts). */
  tag?: string
}

/** A player of the other event, as read from it. */
export type SeedPlayer = { id: string; name: string; handicap: number | null; gender: string | null }

/** One of the other event's leaderboards, as it finished: its player ids, first to last. */
export type SeedBoard = { id: string; title: string; order: string[] }

/** The seeding, as the form holds it. */
export type FieldSeed = {
  on: boolean
  /**
   * The other event, once its code (and public PIN, where it has one) checks
   * out — with its organiser PIN's hash, to check that PIN against on this
   * phone (anybody with the code can read it: lib/passcode.ts).
   */
  source: {
    code: string; name: string; tripId: string; adminHash: string | null
    /** Its leaderboards as finishing orders, by its own player ids — for the draw's seeds. */
    boards: SeedBoard[]
  } | null
  /** That event's organiser PIN, once it checks out — everything comes across. */
  adminPin: string | null
}

export const NO_FIELD_SEED: FieldSeed = { on: false, source: null, adminPin: null }

const key = (name: string) => name.trim().toLowerCase()

/** A seeded player as a row on the form — a handicap as it would be typed, a plus one with its sign. */
export function fieldRow(p: SeedPlayer): FieldPlayer {
  return {
    name: p.name.trim(),
    handicap: p.handicap === null ? '' : formatHandicap(p.handicap),
    gender: p.gender === 'F' ? 'F' : 'M',
    sourceId: p.id,
    brought: true,
  }
}

/**
 * The list with the other event's players brought in: every name already
 * typed stays where it is — the organiser's own first, an empty first row
 * kept for it while they are playing — the other empty rows go, and the
 * seeded players follow, never a name twice. A typed name that was in the
 * other event is that player: it takes their link, so what they shared
 * comes across too, and their handicap and tees where none was typed.
 */
export function withSeeded(
  rows: readonly FieldPlayer[], seeded: readonly SeedPlayer[], organiserPlaying: boolean,
): FieldPlayer[] {
  const byName = new Map(seeded.map(p => [key(p.name), p]))
  const kept = rows
    .filter((r, i) => r.name.trim() || (i === 0 && organiserPlaying))
    .map(r => {
      const p = r.sourceId ? undefined : byName.get(key(r.name))
      if (!p || !key(r.name)) return r
      const was = fieldRow(p)
      return r.handicap.trim()
        ? { ...r, sourceId: p.id }
        : { ...r, sourceId: p.id, handicap: was.handicap, gender: was.gender }
    })
  const taken = new Set(kept.map(r => key(r.name)).filter(Boolean))
  const added: FieldPlayer[] = []
  for (const p of seeded) {
    const k = key(p.name)
    if (!k || taken.has(k)) continue
    taken.add(k)
    added.push(fieldRow(p))
  }
  const next = [...kept, ...added]
  return next.length > 0 ? next : [{ name: '', handicap: '', gender: 'M' }]
}

/**
 * The list with the seeded players taken back out — the seed switched off,
 * or another event's code: the rows it added go, and a typed one it matched
 * is typed again, its link dropped.
 */
export function withoutSeeded(rows: readonly FieldPlayer[]): FieldPlayer[] {
  const next = rows
    .filter(r => !r.brought)
    .map(r => (r.sourceId ? { name: r.name, handicap: r.handicap, gender: r.gender } : r))
  return next.length > 0 ? next : [{ name: '', handicap: '', gender: 'M' }]
}

/** What the add button says: "more" once a field has come across. */
export function addLabel(rows: readonly FieldPlayer[]): string {
  return rows.some(r => r.brought) ? '+ Add more players' : '+ Add another player'
}

/**
 * Who each seeded player is in the new event, for the server to copy what
 * they shared across — matched by name, which no two players share.
 */
export function seedPairs(
  rows: readonly FieldPlayer[], idFor: ReadonlyMap<string, string>, keyOf: (name: string) => string,
): { from: string; to: string }[] {
  return rows.flatMap(r => {
    const to = r.sourceId && r.name.trim() ? idFor.get(keyOf(r.name)) : undefined
    return r.sourceId && to ? [{ from: r.sourceId, to }] : []
  })
}

/**
 * The other event's leaderboards as the draw sees them — each finishing
 * order in this form's draw keys, through the players brought in (or a
 * typed name matched to one). A board none of this field is on is dropped.
 */
export function drawStandings(
  seed: FieldSeed, rows: readonly FieldPlayer[], keyOf: (name: string) => string,
): { id: string; title: string; order: string[] }[] {
  if (!seed.source) return []
  const keyFor = new Map(rows.flatMap(r => (r.sourceId && r.name.trim() ? [[r.sourceId, keyOf(r.name)] as const] : [])))
  return seed.source.boards
    .map(b => ({ id: b.id, title: b.title, order: b.order.flatMap(id => keyFor.get(id) ?? []) }))
    .filter(b => b.order.length > 0)
}

/** An event code as typed: six letters and numbers. */
export const EVENT_CODE = /^[A-Z0-9]{6}$/

/** A typed code, tidied — capitals, no spaces. */
export const tidyCode = (typed: string) => typed.replace(/\s+/g, '').toUpperCase().slice(0, 6)

/** The most notices brought across — enough for any event's, small enough to stay a list. */
export const MAX_SEEDED_NOTICES = 50

/** The most players whose details one import copies — well past any draw (64). */
export const MAX_SEEDED_PLAYERS = 200
