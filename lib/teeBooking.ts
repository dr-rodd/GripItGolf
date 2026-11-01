// Booking a tee time on the sheet (Ross, 1 Nov 2026).
//
// Tap a + and the tee time opens: its seats at the top, filling as players
// are picked from the list beneath. On a round played in partnerships the
// seats are the linking — the players playing together form the
// partnership — so a booking is also where pairings and teams are made:
//
//   · pairs — a row of two is a pairing. A player booking starts in the
//     seat they tapped, and the other half of their ticket is where the
//     next pick goes; then the next row, for another pairing;
//   · team — everyone on the time is one team, each pick added to it;
//   · separate — everyone their own.
//
// This file is the draft and what saving it means. Pure. The sheet does
// the writing: its bookings through its own `addPlayers`, the partnerships
// through `setTeam` — durable team rows on the round's sheet, as the team
// picker makes them.

import { type SeatCell, SEATS_ACROSS, attachOpenSeats } from './teeSheet'
import type { TeeMode } from './partnerships'

/** A player in the draft — `isNew` for those this booking is putting on. */
export type DraftPlayer = { id: string; name: string; teamId: string | null; isNew: boolean }

/** A seat in the draft: a player, open (null), or past the time's last seat. */
export type DraftSeat = DraftPlayer | null | 'none'

const rowOf = (i: number) => Math.floor(i / SEATS_ACROSS)
const besideOf = (i: number) => (i % SEATS_ACROSS === 0 ? i + 1 : i - 1)

/** The draft, from the tee time as it stands. */
export function draftFrom(rows: readonly SeatCell[][]): DraftSeat[] {
  return rows.flat().map(c =>
    c.kind === 'none' ? 'none'
      : c.kind === 'open' ? null
        : { id: c.player.id, name: c.player.name, teamId: c.teamId, isNew: false })
}

/**
 * The seat the next pick goes in. A seat the booker tapped comes first;
 * then, on a pairs time, the other half of a pairing this booking has
 * started — the cue that the next pick is a partner — and then the first
 * row nobody is in. Elsewhere, the next free seat. Null when nothing is
 * left to fill.
 */
export function nextSeat(draft: readonly DraftSeat[], mode: TeeMode, tapped: number | null): number | null {
  const open = (i: number) => i >= 0 && i < draft.length && draft[i] === null
  if (tapped !== null && open(tapped)) return tapped
  if (mode === 'pairs') {
    for (let i = 0; i < draft.length; i++) {
      const c = draft[i]
      if (c && c !== 'none' && c.isNew && open(besideOf(i))) return besideOf(i)
    }
    for (let r = 0; r * SEATS_ACROSS < draft.length; r++) {
      const [a, b] = [r * SEATS_ACROSS, r * SEATS_ACROSS + 1]
      if (open(a) && (draft[b] === null || draft[b] === 'none' || draft[b] === undefined)) return a
    }
    return null
  }
  const first = draft.findIndex(c => c === null)
  return first >= 0 ? first : null
}

/**
 * The draft with a unit — one player, or a partnership — put in from seat
 * `at`. A pair on a pairs time takes a row of its own; anything else fills
 * `at` and then the next free seats. Null where it does not fit.
 */
export function placeUnit(
  draft: readonly DraftSeat[],
  unit: readonly Omit<DraftPlayer, 'isNew'>[],
  mode: TeeMode,
  at: number | null,
): DraftSeat[] | null {
  if (at === null || unit.length === 0) return null
  const next = draft.slice()
  if (mode === 'pairs' && unit.length > 1) {
    if (unit.length > SEATS_ACROSS) return null
    const whole = (r: number) => next[r * SEATS_ACROSS] === null && next[r * SEATS_ACROSS + 1] === null
    const rows = Math.ceil(next.length / SEATS_ACROSS)
    const r = whole(rowOf(at)) ? rowOf(at) : Array.from({ length: rows }, (_, i) => i).find(whole)
    if (r === undefined) return null
    unit.forEach((u, j) => { next[r * SEATS_ACROSS + j] = { ...u, isNew: true } })
    return next
  }
  if (next[at] !== null) return null
  const seats = [at, ...next.map((c, i) => (c === null && i !== at ? i : -1)).filter(i => i >= 0)]
  if (seats.length < unit.length) return null
  unit.forEach((u, j) => { next[seats[j]] = { ...u, isNew: true } })
  return next
}

/** The draft with a pick taken back out. Only this booking's own picks come out here. */
export function takeOut(draft: readonly DraftSeat[], at: number): DraftSeat[] {
  const c = draft[at]
  if (!c || c === 'none' || !c.isNew) return draft.slice()
  const next = draft.slice()
  next[at] = null
  return next
}

/**
 * The draft with somebody already on the time taken off it — leaving their
 * partnership with it, which is how a partnership is changed on the sheet
 * (Ross, 1 Nov 2026: leaving one sends a player to their tee time to do it
 * there, and put a replacement in). Who may is the sheet's medium security,
 * decided by the screen. Returns the draft and who came off.
 */
export function vacate(draft: readonly DraftSeat[], at: number): { draft: DraftSeat[]; off: string | null } {
  const c = draft[at]
  if (!c || c === 'none') return { draft: draft.slice(), off: null }
  const next = draft.slice()
  next[at] = null
  return { draft: next, off: c.isNew ? null : c.id }
}

/**
 * The players who would be playing together with a pick at `at`, for the
 * tag rule — the row on a pairs time, the whole time on a team one, nobody
 * on a separate one.
 */
export function playingWith(draft: readonly DraftSeat[], mode: TeeMode, at: number): string[] {
  const ids = (cells: DraftSeat[]) => cells.filter((c): c is DraftPlayer => !!c && c !== 'none').map(c => c.id)
  if (mode === 'team') return ids(draft.slice())
  if (mode === 'pairs') return ids([draft[rowOf(at) * SEATS_ACROSS], draft[rowOf(at) * SEATS_ACROSS + 1]])
  return []
}

/**
 * The draft as seats to draw: who is joined to whom once it is saved — a
 * row this booking fills is a pairing, the whole time a team — and the
 * open seats a partnership still filling has, on its ticket: the other half
 * of the booker's own, where the next pick goes (`attachOpenSeats`).
 */
export function draftRows(draft: readonly DraftSeat[], mode: TeeMode): SeatCell[][] {
  const linked = (a: number, b: number) => {
    const x = draft[a], y = draft[b]
    if (!x || !y || x === 'none' || y === 'none') return false
    if (mode === 'team') return true
    if (mode === 'pairs') {
      return rowOf(a) === rowOf(b) && ((!!x.teamId && x.teamId === y.teamId) || x.isNew || y.isNew)
    }
    return false
  }
  const cells = draft.map((c, i): SeatCell => {
    if (c === 'none') return { kind: 'none' }
    if (!c) return { kind: 'open' }
    const col = i % SEATS_ACROSS
    return {
      kind: 'player',
      player: { id: c.id, name: c.name },
      teamId: c.teamId,
      joins: {
        left: col > 0 && linked(i, i - 1),
        right: col < SEATS_ACROSS - 1 && linked(i, i + 1),
        up: i >= SEATS_ACROSS && linked(i, i - SEATS_ACROSS),
        down: i + SEATS_ACROSS < draft.length && linked(i, i + SEATS_ACROSS),
      },
    }
  })
  const rows = Math.ceil(cells.length / SEATS_ACROSS)
  return attachOpenSeats(Array.from({ length: rows }, (_, r) => cells.slice(r * SEATS_ACROSS, (r + 1) * SEATS_ACROSS)), mode)
}

/** A partnership saving the draft makes or changes: its players, and the team it is kept as (null for a new one). */
export type BookingLink = { members: string[]; teamId: string | null }

/**
 * What saving the draft means: who goes on the time, and the partnerships
 * the seats make. On a pairs time each row this booking touched is a
 * pairing — kept in a waiting partner's team where one is waiting on their
 * own, else a new one. On a team time everybody on it is one team — the
 * team most of them are already in, else a new one. Players already
 * partnered stay as they are. Nothing is linked on a separate time, or
 * where the partnerships are fixed (a knockout's, booked as drawn).
 *
 * `sizeOf` is how many a team holds now, so a pair waiting for its second
 * player is told from a whole one somewhere else on the sheet.
 */
export function bookingPlan(
  draft: readonly DraftSeat[],
  mode: TeeMode,
  fixed: boolean,
  sizeOf: (teamId: string) => number,
): { book: string[]; links: BookingLink[] } {
  const players = draft.filter((c): c is DraftPlayer => !!c && c !== 'none')
  const book = players.filter(p => p.isNew).map(p => p.id)
  const links: BookingLink[] = []
  if (fixed || mode === 'separate') return { book, links }

  if (mode === 'pairs') {
    for (let r = 0; r * SEATS_ACROSS < draft.length; r++) {
      const pair = [draft[r * SEATS_ACROSS], draft[r * SEATS_ACROSS + 1]]
        .filter((c): c is DraftPlayer => !!c && c !== 'none')
      if (pair.length !== 2 || !pair.some(p => p.isNew)) continue
      if (pair[0].teamId && pair[0].teamId === pair[1].teamId) continue
      const waiting = pair.find(p => p.teamId && sizeOf(p.teamId) < 2)?.teamId ?? null
      links.push({ members: pair.map(p => p.id), teamId: waiting })
    }
    return { book, links }
  }

  // A team time: everybody on it, once there are two.
  if (players.length < 2 || !players.some(p => p.isNew)) return { book, links }
  const tally = new Map<string, number>()
  for (const p of players) if (p.teamId) tally.set(p.teamId, (tally.get(p.teamId) ?? 0) + 1)
  if (tally.size === 1 && [...tally.values()][0] === players.length) return { book, links }
  const most = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  links.push({ members: players.map(p => p.id), teamId: most })
  return { book, links }
}
