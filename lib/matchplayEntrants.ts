// Who is in a matchplay draw.
//
// A singles draw is between players. A pairs draw is between pairings, which
// are teams of two. Everything downstream — the bracket, the tiles, the
// cascade — only ever deals with "the entrant on side A", so this module is
// where the two become one shape.
//
// Pairings are deliberately never named on the draw. A pairing is its two
// players, so the tile carries their names rather than "Team B", which tells
// nobody anything. That is a display rule, not a storage one: the team keeps
// whatever name it was given, and it is still used everywhere teams are
// listed as teams.
//
// Pure — no I/O. lib/matchplayStore.ts feeds it rows.

import { normalizeNickname, shortDisplayNames } from './displayNames'

export type EntrantKind = 'player' | 'pair'

export type Entrant = {
  id: string
  /** Everyone in it, in full. One name for a player, two for a pairing. */
  memberNames: string[]
  /** Full names, joined. Used where there is room for them. */
  name: string
  /** First names, joined — what fits on a bracket tile. */
  shortName: string
  /** Combined for a pairing. Null when nobody in it has one. */
  handicap: number | null
}

/** "Ross Grady" → "Ross". A name with no space is already short. */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full
}

/**
 * Names side by side.
 *
 * Two is the normal case and reads as a pairing should. More than two would
 * only happen if a team were somehow over-filled, and listing them all is a
 * more honest failure than silently hiding one.
 */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/**
 * Short names that tell people apart.
 *
 * A pairing is written as its players' first names — "Ross & Dave". On a
 * trip with two Rosses that is useless, so a duplicated first name takes as
 * much of the surname as it needs and no more. The rule itself — including
 * how an O'Grady or a McDonald is cut — lives in lib/displayNames.ts, the
 * one copy every leaderboard reads; this used to keep a cousin of it and
 * the two drifted, which is exactly the drift the delegation closes.
 */
export function shortNames(fullNames: readonly string[]): string[] {
  return shortDisplayNames(fullNames.map(name => ({ name })))
}

export type PlayerRow = {
  id: string
  name: string
  handicap?: number | null
  /**
   * The player's own leaderboard nickname, where the caller fetched it —
   * fail-soft and separately, per lib/displayNames.ts. It overrides the
   * short name on the tiles; the full `name` stays the real one.
   */
  nickname?: string | null
}
export type TeamRow = { id: string; name: string }

/** One player, standing for themselves. */
export function playerEntrant(p: PlayerRow): Entrant {
  return {
    id: p.id,
    memberNames: [p.name],
    name: p.name,
    shortName: normalizeNickname(p.nickname) ?? firstName(p.name),
    handicap: p.handicap ?? null,
  }
}

/**
 * One pairing, standing for its members.
 *
 * Members are ordered by handicap, lowest first, so a pairing reads the same
 * way every time it appears rather than flipping with query order.
 */
export function pairEntrant(team: TeamRow, members: readonly PlayerRow[]): Entrant {
  const ordered = [...members].sort(
    (a, b) => (a.handicap ?? 99) - (b.handicap ?? 99) || a.name.localeCompare(b.name)
  )
  const names = ordered.map(m => m.name)
  const withHandicaps = ordered.filter(m => m.handicap != null)
  // Short names are worked out against the pairing's own members — two
  // Rosses in the same pairing is the case that has to read — and a
  // member's own nickname wins, as it does on every board.
  const short = shortDisplayNames(ordered.map(m => ({ name: m.name, nickname: m.nickname })))

  return {
    id: team.id,
    memberNames: names,
    // A pairing with nobody in it has nothing to show but the team name, and
    // an unnamed gap on the draw is worse than a placeholder.
    name: names.length > 0 ? joinNames(names) : team.name,
    shortName: names.length > 0 ? joinNames(short) : team.name,
    handicap: withHandicaps.length > 0
      ? withHandicaps.reduce((sum, m) => sum + (m.handicap ?? 0), 0)
      : null,
  }
}

/** Everyone in the draw, keyed by the id the bracket stores. */
export function entrantsById(entrants: readonly Entrant[]): Map<string, Entrant> {
  return new Map(entrants.map(e => [e.id, e]))
}
