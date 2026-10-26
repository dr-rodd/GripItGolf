// The tee sheet — the only copy of its rules.
//
// An event's round can put its field out in groups: a list of tee times
// from the round's start, one group per slot. This file owns everything
// that makes that a sheet rather than a list of guesses — the interval and
// group-size bounds, the slot clock, how many slots a sheet shows, and how
// a slot's players read when some of them are a team.
//
// **A round's sheet is made in its own wizard, and only then is it live**
// (Ross, 26 Oct 2026; `/trip/[code]/teesheet/[roundId]/setup`). Until the
// organiser has set its rules a tee-sheet round is a *vacant* slot: there
// on the Tee times tab, offering the wizard, taking no names. The rules are
// a list of **batches** — a first tee time, the minutes between, and how
// many (given as a count or as the last tee time) — so a morning wave and
// an afternoon wave are one sheet, its tee times numbered straight through.
//
// What is stored where:
//   rounds.tee_sheet           the rules, `TeeRules` as jsonb (migration
//                              064): the batches and the players per tee
//                              time. Null = vacant.
//   rounds.tee_interval_mins   minutes between groups (migration 050) —
//   rounds.tee_group_size      players per slot — both written alongside
//                              the rules from the first batch, and read
//                              only for a sheet made before the wizard
//   tee_assignments            one row per player per round: who stands in
//                              which slot. The slots themselves are never
//                              rows — a slot exists because the rules say
//                              so, and an empty one is a vacancy, not data.
//
// The first tee time is also written to the round's golf item, where the
// countdown, the weather and the schedule already read the round's start.
//
// **A sheet made before the wizard keeps working** while it has names on
// it (`roundSheet`'s legacy case): its old start, interval and group size,
// with a spare slot at the foot as it always had. With nobody on it, it is
// vacant like any other until the wizard has been through.
//
// Who may do what is two event permissions, both asked as the event's tee
// times question (lib/eventPermissions.ts): `set_tee_sheets` — anyone may
// run the wizard, a casual event nobody runs; off, it asks for the PIN —
// and `edit_tee_sheet` — each player picks their own time from what is
// free; off, the organiser places everybody and the sheet is read-only to
// the rest. Both are UI gates in the platform's honest sense.
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

// ─── The sheet's rules (migration 064) ─────────────────────────

/** One run of tee times at a steady interval. */
export type TeeBatch = {
  /** The first tee time, "08:00". */
  start: string
  /** Minutes between tee times. */
  interval: number
  /** How many tee times. */
  count: number
  /**
   * How the length was given — a count, or a last tee time. Only so the
   * wizard reopens the way it was answered; `count` is what counts.
   */
  ends?: 'count' | 'last'
}

export type TeeRules = {
  /** In time order, none overlapping the one before. */
  batches: TeeBatch[]
  /** Players per tee time. */
  groupSize: number
  /**
   * Asked as whole teams per tee time, where the round has a team board:
   * how many. `groupSize` is then that many teams' players. Absent = asked
   * as players.
   */
  teamsPerTee?: number
}

/** A sheet may be split this many ways — a morning and an afternoon wave, and room to spare. */
export const MAX_BATCHES = 4

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** "08:05" → 485, or null for anything that is not a time. */
export function clockMins(time: string | null | undefined): number | null {
  const m = time ? HHMM.exec(time.slice(0, 5)) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** 485 → "08:05". */
export function minsClock(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/** A batch's last tee time, "09:50". */
export function batchLast(b: Pick<TeeBatch, 'start' | 'interval' | 'count'>): string {
  return minsClock((clockMins(b.start) ?? 0) + Math.max(0, b.count - 1) * b.interval)
}

/**
 * How many tee times run from the first to a last one — the last counted
 * when it falls on the interval, the one before it when it does not. Null
 * when the last is before the first.
 */
export function countToLast(start: string, interval: number, last: string): number | null {
  const a = clockMins(start), b = clockMins(last)
  if (a === null || b === null || b < a || interval <= 0) return null
  return Math.floor((b - a) / interval) + 1
}

/** Every tee time on the sheet in order, "08:00", "08:10"… — slot i is the i-th. */
export function teeClocks(rules: Pick<TeeRules, 'batches'>): string[] {
  const out: string[] = []
  for (const b of rules.batches) {
    const start = clockMins(b.start)
    if (start === null) continue
    for (let i = 0; i < b.count; i++) out.push(minsClock(start + i * b.interval))
  }
  return out
}

/** How many tee times the rules make. */
export function sheetLength(rules: Pick<TeeRules, 'batches'>): number {
  return rules.batches.reduce((n, b) => n + Math.max(0, b.count), 0)
}

/** How many players the sheet has room for. */
export function sheetCapacity(rules: Pick<TeeRules, 'batches' | 'groupSize'>): number {
  return sheetLength(rules) * rules.groupSize
}

/** How many of the field will have no tee time — the wizard's reminder, never a refusal. */
export function seatsShort(rules: Pick<TeeRules, 'batches' | 'groupSize'>, fieldSize: number): number {
  return Math.max(0, fieldSize - sheetCapacity(rules))
}

/**
 * Why these rules cannot be saved, in a sentence, or null. Batches must
 * each be a real run of tee times inside the day, and each must start
 * after the last tee time of the one before.
 */
export function rulesIssue(rules: TeeRules): string | null {
  if (rules.batches.length === 0) return 'Add the first tee time.'
  if (rules.batches.length > MAX_BATCHES) return `At most ${MAX_BATCHES} batches on one sheet.`
  if (!Number.isInteger(rules.groupSize) || rules.groupSize < MIN_GROUP_SIZE || rules.groupSize > MAX_GROUP_SIZE) {
    return `Between ${MIN_GROUP_SIZE} and ${MAX_GROUP_SIZE} players a tee time.`
  }
  let prevLast = -1
  for (const [i, b] of rules.batches.entries()) {
    const name = rules.batches.length > 1 ? `Batch ${i + 1}` : 'The sheet'
    const start = clockMins(b.start)
    if (start === null) return `${name} needs a first tee time.`
    if (!Number.isInteger(b.interval) || b.interval < MIN_TEE_INTERVAL_MINS || b.interval > MAX_TEE_INTERVAL_MINS) {
      return `${MIN_TEE_INTERVAL_MINS} to ${MAX_TEE_INTERVAL_MINS} minutes between tee times.`
    }
    if (!Number.isInteger(b.count) || b.count < 1) return `${name} needs at least one tee time.`
    if (start + (b.count - 1) * b.interval >= 24 * 60) return `${name} runs past midnight.`
    if (start <= prevLast) return `Batch ${i + 1} starts before batch ${i}'s last tee time.`
    prevLast = start + (b.count - 1) * b.interval
  }
  if (sheetLength(rules) > MAX_SLOTS) return `At most ${MAX_SLOTS} tee times on one sheet.`
  return null
}

/**
 * The stored rules, whole and valid, or null. Nothing half-read: a sheet
 * whose rules do not parse reads as vacant, never as a guess.
 */
export function parseTeeRules(raw: unknown): TeeRules | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.batches)) return null
  const batches: TeeBatch[] = []
  for (const x of r.batches) {
    if (!x || typeof x !== 'object') return null
    const b = x as Record<string, unknown>
    if (typeof b.start !== 'string') return null
    batches.push({
      start: b.start.slice(0, 5),
      interval: Number(b.interval),
      count: Number(b.count),
      ...(b.ends === 'last' || b.ends === 'count' ? { ends: b.ends } : {}),
    })
  }
  const rules: TeeRules = {
    batches,
    groupSize: Number(r.groupSize),
    ...(Number.isInteger(r.teamsPerTee) && (r.teamsPerTee as number) > 0
      ? { teamsPerTee: r.teamsPerTee as number } : {}),
  }
  return rulesIssue(rules) ? null : rules
}

const GROUP_WORD: Record<number, string> = { 2: 'twos', 3: 'threes', 4: 'fours' }

/**
 * The rules in a line — "12 tee times, 8:00 am to 9:50 am, in fours", a
 * second batch joined with "and".
 */
export function describeRules(rules: TeeRules): string {
  const n = sheetLength(rules)
  const runs = rules.batches.map(b => b.count === 1
    ? describeTime(b.start)
    : `${describeTime(b.start)} to ${describeTime(batchLast(b))}`)
  const per = rules.teamsPerTee
    ? `${rules.teamsPerTee} team${rules.teamsPerTee === 1 ? '' : 's'} a tee time`
    : `in ${GROUP_WORD[rules.groupSize] ?? `groups of ${rules.groupSize}`}`
  return `${n} tee time${n === 1 ? '' : 's'}, ${runs.join(' and ')}, ${per}`
}

// ─── A round's sheet, whatever state it is in ──────────────────

/**
 * What one tee-sheet round has to show.
 *
 * `vacant` — no rules yet: a slot on the Tee times tab offering the wizard.
 * `active` — the wizard's rules: these tee times and no others.
 * `legacy` — made before the wizard, with names on it: its old start,
 *            interval and group size, read the way they always were.
 */
export type RoundSheet =
  | { state: 'vacant' }
  | { state: 'active'; rules: TeeRules }
  | { state: 'legacy'; startTime: string | null; intervalMins: number; groupSize: number }

export function roundSheet(input: {
  /** `rounds.tee_sheet` as read — fail-soft, so absent before 064. */
  rules: unknown
  /** The round's start, off its golf item. */
  startTime: string | null
  intervalMins: unknown
  groupSize: unknown
  /** Whether anybody is on this round's sheet. */
  hasAssignments: boolean
}): RoundSheet {
  const rules = parseTeeRules(input.rules)
  if (rules) return { state: 'active', rules }
  if (input.hasAssignments) {
    return {
      state: 'legacy',
      startTime: input.startTime,
      intervalMins: parseInterval(input.intervalMins),
      groupSize: parseGroupSize(input.groupSize),
    }
  }
  return { state: 'vacant' }
}

/** Players per tee time on a live sheet. */
export function sheetGroupSize(sheet: Exclude<RoundSheet, { state: 'vacant' }>): number {
  return sheet.state === 'active' ? sheet.rules.groupSize : sheet.groupSize
}

/**
 * When slot i goes off on this sheet — "9:40 am" — or null: a legacy sheet
 * with no start yet, or a slot past the end of the rules (somebody left on
 * a tee time the organiser has since taken away).
 */
export function sheetClock(sheet: RoundSheet, index: number): string | null {
  if (sheet.state === 'vacant') return null
  if (sheet.state === 'legacy') return slotClock(sheet.startTime, index, sheet.intervalMins)
  const t = teeClocks(sheet.rules)[index]
  return t ? describeTime(t) : null
}

/**
 * How many slots the sheet draws. A live sheet is its rules — never fewer
 * than the highest slot somebody stands in, because an assignment must
 * always be visible on the sheet that holds it. A legacy sheet keeps its
 * old length, a spare at the foot.
 */
export function sheetSlots(sheet: RoundSheet, rosterSize: number, maxAssignedIndex: number): number {
  if (sheet.state === 'vacant') return 0
  if (sheet.state === 'legacy') return slotCount(rosterSize, sheet.groupSize, maxAssignedIndex)
  return Math.min(MAX_SLOTS, Math.max(sheetLength(sheet.rules), maxAssignedIndex + 1))
}

/**
 * Where the wizard starts: the rules as they stand, a legacy sheet's old
 * settings as one batch, or — for a vacant round — one batch from the
 * round's start (or eight o'clock) at ten-minute gaps, long enough for the
 * field in fours.
 */
export function draftRules(sheet: RoundSheet, startTime: string | null, fieldSize: number): TeeRules {
  if (sheet.state === 'active') return sheet.rules
  const start = clockMins(startTime) !== null ? startTime!.slice(0, 5) : '08:00'
  if (sheet.state === 'legacy') {
    return {
      batches: [{ start, interval: sheet.intervalMins, count: slotCount(fieldSize, sheet.groupSize, -1) - 1, ends: 'count' }],
      groupSize: sheet.groupSize,
    }
  }
  return {
    batches: [{
      start, interval: DEFAULT_TEE_INTERVAL_MINS,
      count: Math.max(1, Math.ceil(fieldSize / DEFAULT_GROUP_SIZE)), ends: 'count',
    }],
    groupSize: DEFAULT_GROUP_SIZE,
  }
}

// ─── The home screen's tee times ───────────────────────────────
//
// The sheet's own screen is where a sheet is read and edited; the home
// screen carries one round of it, from the player's side — when you go
// off and who with — while a round starts from a tee sheet
// (lib/eventHub.ts `activeHubModules`).

/**
 * The tee-sheet round the home screen speaks for: the first today or later
 * in round order, else the last one, so the morning after the final round
 * still shows the sheet everybody just played off. An undated round (a
 * series made before series carried dates) counts as still to come.
 */
export function hubTeeRound<R extends { roundNumber: number; date: string | null }>(
  rounds: readonly R[],
  today: string,
): R | null {
  const ordered = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber)
  return ordered.find(r => !r.date || r.date >= today) ?? ordered[ordered.length - 1] ?? null
}

/** One player's place on one round's sheet. */
export type MyTee = {
  slotIndex: number
  /** "9:40 am", or null while the round has no start time. */
  clock: string | null
  /** Who else is in the slot, in assignment order. */
  partners: string[]
}

/**
 * Where a player stands on a round's sheet, or null when they are not on
 * it (or this phone is nobody). `rows` are that round's assignments as
 * fetched; `bySlot` cleans them, and the clock is `sheetClock`'s, so the
 * home screen and the sheet cannot disagree about a time.
 */
export function myTee(
  rows: unknown,
  playerId: string | null,
  sheet: RoundSheet,
  nameOf: (id: string) => string | null,
): MyTee | null {
  if (!playerId) return null
  for (const [slotIndex, ids] of bySlot(rows)) {
    if (!ids.includes(playerId)) continue
    return {
      slotIndex,
      clock: sheetClock(sheet, slotIndex),
      partners: ids.filter(id => id !== playerId)
        .map(nameOf)
        .filter((n): n is string => !!n),
    }
  }
  return null
}
