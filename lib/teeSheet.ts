// The tee sheet — the only copy of its rules.
//
// An event's round can put its field out in groups: a list of tee times
// from the round's start, one group per slot. This file owns everything
// that makes that a sheet rather than a list of guesses — the interval and
// group-size bounds, the slot clock, how many slots a sheet shows, and how
// a slot's players read when some of them are a team.
//
// **A round's sheet is opened in its own wizard, and only then is it live**
// (Ross, 26 Oct 2026; `/trip/[code]/teesheet/[roundId]/setup` — "opening"
// a tee sheet is what making one is called on screen). Until the organiser
// has set its rules a tee-sheet round is a *vacant* slot: there on the Tee
// times tab, "not open yet", offering the wizard, taking no names. **A sheet
// may open later than it is made** (`TeeRules.opens`): some days before the
// round at a time, or on a date at a time, Irish time (lib/irishTime.ts) —
// until then the field sees when it opens and nothing more, and the
// organiser sees it and may place players early. The rules are
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

import { TEE_INTERVAL_MINS, describeShortDate, describeTime } from './itinerary'
import type { ItineraryItem } from './itinerary'
import { daysBefore, irishInstant } from './irishTime'
import type { TeeMode } from './partnerships'

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
 * block, singles in a block of their own at the end — `seatGrid` then sits
 * them, a team as one ticket. Order inside a block follows the order
 * given, which is assignment order.
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

// ─── A tee time's seats ────────────────────────────────────────
//
// Ross, 31 Oct 2026: a tee time reads like a day on a calendar, and its
// players sit in places made for them rather than a line that stretches —
// two seats across, a 2×2 grid for a fourball. A player on their own has a
// seat to themselves; partners are one ticket, joined across the seam by a
// perforation, so who plays with whom is plain at a glance.

/** Seats across a tee time. */
export const SEATS_ACROSS = 2

/** Which sides of a seat join a partner's — the ticket's seams. */
export type SeatJoins = { left: boolean; right: boolean; up: boolean; down: boolean }

export type SeatCell =
  | { kind: 'player'; player: SlotPlayer; teamId: string | null; joins: SeatJoins }
  /**
   * A seat nobody is in. `joins` where it is part of a partnership still
   * filling — the other half of a lone player's pairing, a team time's
   * places left — so it is drawn as that ticket's empty end, not a box on
   * its own (`attachOpenSeats`).
   */
  | { kind: 'open'; joins?: SeatJoins }
  /** Past the tee time's last seat — a threeball's fourth place. */
  | { kind: 'none' }

/**
 * A tee time's players in their seats, row by row, two across, read by how
 * the round's tee times bind (lib/partnerships.ts `teeMode`, Ross, 1 Nov
 * 2026):
 *
 *   · pairs — a row is a pairing: each pair takes a row of its own, and a
 *     player with no partner yet a row to themselves, their partner's seat
 *     beside them left open for whoever joins them;
 *   · team — the tee time is one team, its players one ticket in booking
 *     order: an L for three, the whole grid for four;
 *   · separate — everybody in a seat of their own, in booking order.
 *
 * As many seats as the tee time holds (`seats`, the group size), and never
 * fewer than the players in it — nobody is ever dropped. Where the rows run
 * out (a pairs time booked before rows meant pairings) the rest fill any
 * free seat, and say only what is true: two in a row who are not partners
 * are not joined.
 */
export function seatGrid(groups: readonly SlotGroup[], seats: number, mode: TeeMode): SeatCell[][] {
  const placed = groups.flatMap(g => g.players.map(player => ({ player, teamId: g.teamId })))
  const count = Math.max(seats, placed.length, 1)
  const rows = Math.ceil(count / SEATS_ACROSS)
  type Placed = { player: SlotPlayer; teamId: string | null }
  const cells: (Placed | null | 'none')[] = Array.from({ length: rows * SEATS_ACROSS }, (_, i) =>
    i < count ? null : 'none')

  const left: Placed[] = []
  if (mode === 'pairs') {
    const rowOpen = (r: number) => cells[r * 2] === null && (cells[r * 2 + 1] === null || cells[r * 2 + 1] === 'none')
    const rowWhole = (r: number) => cells[r * 2] === null && cells[r * 2 + 1] === null
    for (const g of groups) {
      if (!g.teamId || g.players.length !== 2) continue
      const r = Array.from({ length: rows }, (_, i) => i).find(rowWhole)
      if (r === undefined) continue
      g.players.forEach((player, j) => { cells[r * 2 + j] = { player, teamId: g.teamId } })
    }
    for (const p of placed) {
      if (cells.some(c => c && c !== 'none' && c.player.id === p.player.id)) continue
      const r = Array.from({ length: rows }, (_, i) => i).find(rowOpen)
      if (r === undefined) { left.push(p); continue }
      cells[r * 2] = p
    }
  } else {
    left.push(...placed)
  }
  for (const p of left) {
    const at = cells.findIndex(c => c === null)
    if (at >= 0) cells[at] = p
  }

  const linked = (a: number, b: number) => {
    const x = cells[a], y = cells[b]
    if (!x || !y || x === 'none' || y === 'none') return false
    if (mode === 'team') return true
    if (mode === 'pairs') {
      return Math.floor(a / SEATS_ACROSS) === Math.floor(b / SEATS_ACROSS) && !!x.teamId && x.teamId === y.teamId
    }
    return false
  }
  const out = cells.map((c, i): SeatCell => {
    if (c === 'none') return { kind: 'none' }
    if (!c) return { kind: 'open' }
    const col = i % SEATS_ACROSS
    return {
      kind: 'player',
      player: c.player,
      teamId: c.teamId,
      joins: {
        left: col > 0 && linked(i, i - 1),
        right: col < SEATS_ACROSS - 1 && linked(i, i + 1),
        up: i >= SEATS_ACROSS && linked(i, i - SEATS_ACROSS),
        down: i + SEATS_ACROSS < cells.length && linked(i, i + SEATS_ACROSS),
      },
    }
  })
  return attachOpenSeats(
    Array.from({ length: rows }, (_, r) => out.slice(r * SEATS_ACROSS, (r + 1) * SEATS_ACROSS)),
    mode,
  )
}

/**
 * The open seats a partnership still filling has, joined onto its ticket
 * (Ross, 1 Nov 2026: an open place somebody is going to join was a box on
 * its own) — so the ticket shows where its next player goes:
 *
 *   · pairs — a player on their own in a row, and the seat beside them;
 *   · team — once anybody is on the time, every place left on it;
 *   · separate — none: nobody partners anybody.
 *
 * A row nobody is in, and a team time nobody is on, stay boxes of their
 * own. Joins between players are left as they were.
 */
export function attachOpenSeats(rows: readonly SeatCell[][], mode: TeeMode): SeatCell[][] {
  const flat: SeatCell[] = rows.flat().map(c =>
    c.kind === 'player' ? { ...c, joins: { ...c.joins } } : c.kind === 'open' ? { kind: 'open' } : c)
  const none: SeatJoins = { left: false, right: false, up: false, down: false }
  const join = (a: number, b: number, side: keyof SeatJoins, back: keyof SeatJoins) => {
    for (const [i, s] of [[a, side], [b, back]] as const) {
      const c = flat[i]
      if (c.kind === 'player') c.joins[s] = true
      else if (c.kind === 'open') flat[i] = { kind: 'open', joins: { ...(c.joins ?? none), [s]: true } }
    }
  }
  if (mode === 'pairs') {
    for (let r = 0; r * SEATS_ACROSS < flat.length; r++) {
      const [a, b] = [r * SEATS_ACROSS, r * SEATS_ACROSS + 1]
      const kinds = [flat[a]?.kind, flat[b]?.kind].sort().join()
      if (kinds === 'open,player') join(a, b, 'right', 'left')
    }
  } else if (mode === 'team' && flat.some(c => c.kind === 'player')) {
    const inTicket = (i: number) => i >= 0 && i < flat.length && flat[i].kind !== 'none'
    for (let i = 0; i < flat.length; i++) {
      if (!inTicket(i)) continue
      const right = i % SEATS_ACROSS < SEATS_ACROSS - 1 ? i + 1 : -1
      const down = i + SEATS_ACROSS
      for (const [j, side, back] of [[right, 'right', 'left'], [down, 'down', 'up']] as const) {
        if (!inTicket(j)) continue
        if (flat[i].kind === 'player' && flat[j].kind === 'player') continue
        join(i, j, side, back)
      }
    }
  }
  const across = rows[0]?.length ?? SEATS_ACROSS
  return Array.from({ length: rows.length }, (_, r) => flat.slice(r * across, (r + 1) * across))
}

/** What tapping an open seat does: book the next seat, start a pairing, or join a player's. */
export type SeatTarget = { kind: 'add' } | { kind: 'start' } | { kind: 'join'; with: string }

/**
 * Where a tee time's + signs go (Ross, 1 Nov 2026). On a pairs round, the
 * seat beside a player with no partner yet — tap it to join their pairing —
 * and the first seat of a row nobody is in, to start one. Otherwise one +,
 * in the next free seat; a threeball's fourth place stays empty.
 */
export function seatTargets(rows: readonly SeatCell[][], mode: TeeMode): (SeatTarget | null)[] {
  const flat = rows.flat()
  const out: (SeatTarget | null)[] = flat.map(() => null)
  if (mode === 'pairs') {
    for (let r = 0; r < rows.length; r++) {
      const [a, b] = [flat[r * 2], flat[r * 2 + 1]]
      if (a.kind === 'player' && b?.kind === 'open') out[r * 2 + 1] = { kind: 'join', with: a.player.id }
      else if (b?.kind === 'player' && a.kind === 'open') out[r * 2] = { kind: 'join', with: b.player.id }
      else if (a.kind === 'open' && (!b || b.kind !== 'player')) out[r * 2] = { kind: 'start' }
    }
    return out
  }
  const first = flat.findIndex(c => c.kind === 'open')
  if (first >= 0) out[first] = { kind: 'add' }
  return out
}

/**
 * Players linked in a partnership, named as one in a list of who to put on
 * a time (Ross, 1 Nov 2026): a pair "Ross & Dave", three or four with
 * commas, "Ross, Dave, Seán".
 */
export function listName(names: readonly string[]): string {
  return names.length === 2 ? `${names[0]} & ${names[1]}` : names.join(', ')
}

/** The seams of the seats round one — each side's neighbour, where it has one. */
export type SeatNeighbours = Partial<Record<keyof SeatJoins, SeatJoins>>

type Corners = { tl: boolean; tr: boolean; bl: boolean; br: boolean }

/**
 * How one seat is cut, from its seams: a corner is rounded where nothing
 * joins it, square where a partner's seat does, and notched — the half-moon
 * a ticket has at each end of its perforation — where exactly one seam runs
 * out to the ticket's edge. Where two seams cross, inside a fourball's
 * ticket, it is square and whole.
 *
 * An L — three on a time — has an inside corner, where both its seams end
 * (Ross, 1 Nov 2026: tidy the square step there). The seat in the crook of
 * the L reaches across both gaps and so stands proud of the other two by
 * the gap's half; it is cut `concave` instead — a small round inside
 * corner — and the two seams ending there end square, not notched. Telling
 * an inside corner from a crossing takes the neighbours' seams
 * (`near`); without them a seat is read as before.
 */
export function seatCorners(j: SeatJoins, near: SeatNeighbours = {}): {
  rounded: Corners
  notched: Corners
  concave: Corners
} {
  const corner = (h: 'left' | 'right', v: 'up' | 'down'): 'rounded' | 'square' | 'notched' | 'concave' => {
    if (!j[h] && !j[v]) return 'rounded'
    // Both seams meet here: a fourball's crossing, or an L's inside corner.
    if (j[h] && j[v]) return near[h]?.[v] || near[v]?.[h] ? 'square' : 'concave'
    // One seam ends here: at the ticket's edge, or at an L's inside corner.
    if (j[h]) return near[h]?.[v] ? 'square' : 'notched'
    return near[v]?.[h] ? 'square' : 'notched'
  }
  const all = { tl: corner('left', 'up'), tr: corner('right', 'up'), bl: corner('left', 'down'), br: corner('right', 'down') }
  const is = (k: string): Corners => ({ tl: all.tl === k, tr: all.tr === k, bl: all.bl === k, br: all.br === k })
  return { rounded: is('rounded'), notched: is('notched'), concave: is('concave') }
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
 * One player is a person, whatever team they are in (Ross, 1 Nov 2026: a
 * player left on their own in a team read as a team, and could not be
 * picked as somebody's partner) — a team of one, or the one member of a
 * team still to book. Players with no team, and every player when members
 * may go out separately, are solos.
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
    if (g.teamId && g.players.length > 1) {
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

// ─── Who may change a booking ──────────────────────────────────
//
// "Medium security", the default (Ross, 26 Oct 2026): where players book
// their own times, a player books themselves and anyone they bring — and
// may then move or remove only themselves and those they booked
// (`tee_assignments.booked_by`, migration 065), so a stranger's name is
// never taken off by accident. The organiser — the PIN unlocked on this
// phone — removes anybody.

/**
 * Whether this phone may take a player off their tee time: the organiser
 * always; a player booking their own times, themselves and anyone they
 * booked; nobody else.
 */
export function mayRemoveBooking(
  who: { organiser: boolean; meId: string | null; playersBook: boolean },
  booking: { playerId: string; bookedBy?: string | null },
): boolean {
  if (who.organiser) return true
  if (!who.playersBook || !who.meId) return false
  return booking.playerId === who.meId || booking.bookedBy === who.meId
}

// ─── Assignments as fetched ────────────────────────────────────

export type TeeAssignment = { player_id: string; slot_index: number; booked_by?: string | null }

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
  /** When the field may see it and pick from it. Absent = as soon as it is saved. */
  opens?: TeeOpening
}

/**
 * When a sheet opens to the field (Ross, 26 Oct 2026): some days before
 * the round at a time — which needs the round's date — or on a date at a
 * time. Both on Irish clocks.
 */
export type TeeOpening =
  | { daysBefore: number; time: string }
  | { date: string; time: string }

/** The furthest ahead "days before" may reach. */
export const MAX_OPEN_DAYS_BEFORE = 60

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
  if (rules.opens) {
    const o = rules.opens
    if (clockMins(o.time) === null) return 'Pick the time the sheet opens.'
    if ('daysBefore' in o) {
      if (!Number.isInteger(o.daysBefore) || o.daysBefore < 0 || o.daysBefore > MAX_OPEN_DAYS_BEFORE) {
        return `Between 0 and ${MAX_OPEN_DAYS_BEFORE} days before the round.`
      }
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) {
      return 'Pick the date the sheet opens.'
    }
  }
  return null
}

/**
 * The instant the sheet opens, or null when it is open from the moment it
 * is saved — no opening given, or "days before" a round that has no date
 * (nothing to count back from, so nothing to wait for).
 */
export function opensAt(rules: Pick<TeeRules, 'opens'>, roundDate: string | null): Date | null {
  const o = rules.opens
  if (!o) return null
  if ('date' in o) return irishInstant(o.date, o.time)
  if (!roundDate) return null
  const day = daysBefore(roundDate, o.daysBefore)
  return day ? irishInstant(day, o.time) : null
}

/** Whether the field may see and pick from the sheet yet. */
export function sheetIsOpen(rules: Pick<TeeRules, 'opens'>, roundDate: string | null, now: Date): boolean {
  const at = opensAt(rules, roundDate)
  return !at || now.getTime() >= at.getTime()
}

/**
 * When the sheet opens, in words — "Thu 30 Oct at 8:00 pm" — or null when
 * it opens straight away. The date is the one it works out to, so "3 days
 * before" reads as the day it lands on.
 */
export function describeOpening(rules: Pick<TeeRules, 'opens'>, roundDate: string | null): string | null {
  const o = rules.opens
  if (!o) return null
  const day = 'date' in o ? o.date : roundDate ? daysBefore(roundDate, o.daysBefore) : null
  if (!day) return null
  return `${describeShortDate(day)} at ${describeTime(o.time)}`
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
  // The opening is read on its own: one that does not parse is dropped —
  // the sheet opens now — rather than costing the whole sheet.
  const o = r.opens as Record<string, unknown> | null | undefined
  if (o && typeof o === 'object' && typeof o.time === 'string') {
    const opens: TeeOpening | null = typeof o.date === 'string'
      ? { date: o.date, time: o.time.slice(0, 5) }
      : Number.isInteger(o.daysBefore) ? { daysBefore: o.daysBefore as number, time: o.time.slice(0, 5) } : null
    if (opens && !rulesIssue({ ...rules, opens })) rules.opens = opens
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
 * A sheet in a line for the organiser — "12 tee times, 8:00 am to 9:50 am,
 * in fours · opens Thu 30 Oct at 8:00 pm" — or null while it is not open
 * yet. The opening is said only while it is still to come.
 */
export function teeSheetSummary(sheet: RoundSheet, roundDate: string | null, now: Date): string | null {
  if (sheet.state === 'vacant') return null
  if (sheet.state === 'legacy') return `${sheet.intervalMins} minutes between groups, groups of up to ${sheet.groupSize}`
  const opening = sheetIsOpen(sheet.rules, roundDate, now) ? null : describeOpening(sheet.rules, roundDate)
  return `${describeRules(sheet.rules)}${opening ? ` · opens ${opening}` : ''}`
}

/**
 * Where the wizard starts: the rules as they stand, a legacy sheet's old
 * settings as one batch, or — for a vacant round — one batch from the
 * round's start (or eight o'clock) at ten-minute gaps: as many tee times
 * as the golf item planned (`teeCount`, asked when the event was made),
 * else long enough for the field in fours.
 */
export function draftRules(
  sheet: RoundSheet,
  startTime: string | null,
  fieldSize: number,
  teeCount?: number | null,
): TeeRules {
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
      count: teeCount && teeCount > 1
        ? Math.min(MAX_SLOTS, teeCount)
        : Math.max(1, Math.ceil(fieldSize / DEFAULT_GROUP_SIZE)),
      ends: 'count',
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
