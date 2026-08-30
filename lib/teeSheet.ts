// The tee sheet — the only copy of its rules.
//
// An event's round can put its field out in groups: a list of tee times
// from the round's start, one group per slot. This file owns everything
// that makes that a sheet rather than a list of guesses — the interval and
// group-size bounds, the slot clock, how many slots a sheet shows, and how
// a slot's players read when some of them are a team.
//
// What is stored where (migration 050):
//   rounds.tee_interval_mins   minutes between groups; absent = 10, the
//                              same ten minutes the golf span has always
//                              assumed (lib/itinerary.ts TEE_INTERVAL_MINS)
//   rounds.tee_group_size      players per slot, 2–4; absent = 4
//   tee_assignments            one row per player per round: who stands in
//                              which slot. The slots themselves are never
//                              rows — a slot exists because the maths says
//                              so, and an empty one is a vacancy, not data.
//
// The sheet's start time is the round's own — the golf item's tee_time,
// where the countdown, the weather and the schedule already read it. No
// second copy of the clock.
//
// Editing is the organiser's, and — through the `edit_tee_sheet` event
// permission — optionally the field's. Both are UI gates in the platform's
// honest sense; the group-size cap is enforced by what the screen offers.
//
// Pure. No I/O.

import { TEE_INTERVAL_MINS, describeTime } from './itinerary'
import type { ItineraryItem } from './itinerary'

// ─── Settings and their bounds ─────────────────────────────────

export const DEFAULT_TEE_INTERVAL_MINS = TEE_INTERVAL_MINS
export const MIN_TEE_INTERVAL_MINS = 5
export const MAX_TEE_INTERVAL_MINS = 30

export const DEFAULT_GROUP_SIZE = 4
export const MIN_GROUP_SIZE = 2
export const MAX_GROUP_SIZE = 4

/**
 * The stored interval, or the default for anything that is not one.
 * Absent is checked before Number() gets a say — Number(null) is 0, and a
 * NULL column clamping to the floor instead of reading as the default is
 * exactly the quiet bug that check exists to stop.
 */
export function parseInterval(value: unknown): number {
  if (value == null || value === '') return DEFAULT_TEE_INTERVAL_MINS
  const n = Number(value)
  if (!Number.isInteger(n)) return DEFAULT_TEE_INTERVAL_MINS
  return Math.min(MAX_TEE_INTERVAL_MINS, Math.max(MIN_TEE_INTERVAL_MINS, n))
}

/** The stored group size, or the default for anything that is not one. */
export function parseGroupSize(value: unknown): number {
  if (value == null || value === '') return DEFAULT_GROUP_SIZE
  const n = Number(value)
  if (!Number.isInteger(n)) return DEFAULT_GROUP_SIZE
  return Math.min(MAX_GROUP_SIZE, Math.max(MIN_GROUP_SIZE, n))
}

// ─── The clock ─────────────────────────────────────────────────

/**
 * When slot i goes off — "9:40 am" — or null when the round has no start
 * time yet. Null is a real answer the sheet says out loud ("Group 3"),
 * never an invented clock: the start lives on the round's itinerary item
 * and the organiser sets it from the Starts section.
 */
export function slotClock(
  startTime: string | null | undefined,
  index: number,
  intervalMins: number,
): string | null {
  if (!startTime) return null
  const [h, m] = startTime.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const t = (h * 60 + m + index * intervalMins) % (24 * 60)
  return describeTime(
    `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`,
  )
}

// ─── How long the sheet is ─────────────────────────────────────

/** A backstop, not a target — a 128 field at twos is 64 groups. */
export const MAX_SLOTS = 64

/**
 * How many slots the sheet shows: enough to seat the whole field, plus one
 * spare so there is always somewhere to put the next name — and never
 * fewer than whatever is already assigned, because an assignment must
 * always be visible on the sheet that holds it.
 */
export function slotCount(
  rosterSize: number,
  groupSize: number,
  maxAssignedIndex: number,
): number {
  const needed = Math.ceil(Math.max(rosterSize, 1) / Math.max(groupSize, 1))
  return Math.min(MAX_SLOTS, Math.max(needed, maxAssignedIndex + 1) + 1)
}

// ─── Reading a slot ────────────────────────────────────────────

export type SlotPlayer = { id: string; name: string }

export type SlotGroup = {
  /** The team the block belongs to, or null for the loose singles. */
  teamId: string | null
  teamName: string | null
  players: SlotPlayer[]
}

/**
 * A slot's players arranged for the screen: teammates gathered into one
 * block (side by side at 2 or 3, a 2×2 grid at 4 — the caller draws, this
 * only groups), singles in a block of their own at the end. Order inside a
 * block follows the order given, which is assignment order.
 */
export function groupSlot(
  players: readonly SlotPlayer[],
  teamOf: ReadonlyMap<string, { teamId: string; teamName: string }>,
): SlotGroup[] {
  const teams = new Map<string, SlotGroup>()
  const solos: SlotPlayer[] = []
  const order: SlotGroup[] = []

  for (const p of players) {
    const t = teamOf.get(p.id)
    if (!t) { solos.push(p); continue }
    let g = teams.get(t.teamId)
    if (!g) {
      g = { teamId: t.teamId, teamName: t.teamName, players: [] }
      teams.set(t.teamId, g)
      order.push(g)
    }
    g.players.push(p)
  }
  if (solos.length > 0) order.push({ teamId: null, teamName: null, players: solos })
  return order
}

// ─── The add picker's units ────────────────────────────────────

export type PickerUnit =
  | { kind: 'solo'; player: SlotPlayer }
  | { kind: 'team'; teamId: string; teamName: string; players: SlotPlayer[] }

/**
 * What the add-player picker offers, when a slot has room.
 *
 * On a board whose teammates share a tee time (`together`), a teamed player
 * is never offered alone: the team is one stuck-together unit carrying
 * every member still off this round's sheet, and tapping it books them all.
 * A team with one member left is still a unit — the link is the point, and
 * showing it keeps "who am I stuck to" visible. Players with no team, and
 * every player when members may go out separately, are solos.
 *
 * Built on `groupSlot`, the one copy of gathering-by-team, so the picker
 * and the slots can never group differently.
 */
export function pickerUnits(
  unassigned: readonly SlotPlayer[],
  teamOf: ReadonlyMap<string, { teamId: string; teamName: string }>,
  together: boolean,
): PickerUnit[] {
  if (!together) {
    return unassigned.map(player => ({ kind: 'solo', player }))
  }
  const out: PickerUnit[] = []
  for (const g of groupSlot(unassigned, teamOf)) {
    if (g.teamId) {
      out.push({ kind: 'team', teamId: g.teamId, teamName: g.teamName!, players: g.players })
    } else {
      for (const player of g.players) out.push({ kind: 'solo', player })
    }
  }
  return out
}

/** Whether a picker unit matches a typed filter — any member, or the team. */
export function unitMatches(unit: PickerUnit, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (unit.kind === 'solo') return unit.player.name.toLowerCase().includes(q)
  return unit.teamName.toLowerCase().includes(q)
    || unit.players.some(p => p.name.toLowerCase().includes(q))
}

// ─── Assignments as fetched ────────────────────────────────────

export type TeeAssignment = { player_id: string; slot_index: number }

/**
 * Rows into a slot map, junk dropped: a player appears once (the database
 * unique makes a second row impossible, but a parser trusts nothing), a
 * negative or non-integer slot is not a slot. Order within a slot is the
 * order the rows arrived, which the fetch makes assignment order.
 */
export function bySlot(rows: unknown): Map<number, string[]> {
  const out = new Map<number, string[]>()
  if (!Array.isArray(rows)) return out
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const idx = Number(r.slot_index)
    const pid = typeof r.player_id === 'string' ? r.player_id : null
    if (!pid || seen.has(pid) || !Number.isInteger(idx) || idx < 0 || idx >= MAX_SLOTS) continue
    seen.add(pid)
    const list = out.get(idx) ?? []
    list.push(pid)
    out.set(idx, list)
  }
  return out
}

// ─── The sheet's start time ────────────────────────────────────

/**
 * The round's start, read off its golf item — the one copy of the clock.
 * Null when the item has no time (or no item), which the sheet says
 * plainly rather than inventing nine o'clock.
 */
export function sheetStart(
  item: Pick<ItineraryItem, 'teeTime'> | null | undefined,
): string | null {
  return item?.teeTime ?? null
}
