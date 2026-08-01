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
 * much of the surname as it needs and no more: "Ross G" against "Dave", but
 * "Ross Gr" against "Ross Ga" when the initial does not settle it either.
 *
 * Everyone sharing a first name grows together, so the names stay the same
 * length as each other and the list reads evenly.
 */
export function shortNames(fullNames: readonly string[]): string[] {
  const firsts = fullNames.map(firstName)

  return fullNames.map((full, i) => {
    const clash = firsts.filter((f, j) => j !== i && f === firsts[i])
    if (clash.length === 0) return firsts[i]

    const rest = surname(full)
    if (!rest) return firsts[i]

    // Take one more letter at a time until this name is unlike every other
    // name it collides with. Everyone in the clash uses the same length, so
    // "Ross Gr" and "Ross Ga" rather than "Ross G" and "Ross Ga".
    const rivals = fullNames.filter((other, j) => j !== i && firsts[j] === firsts[i])
    let take = 1
    while (take < rest.length && rivals.some(r => surname(r).slice(0, take) === rest.slice(0, take))) {
      take++
    }
    // Match the longest any of the clashing names needed, so they agree
    const needed = Math.max(take, ...rivals.map(r => lengthNeeded(r, fullNames, firsts)))
    return `${firsts[i]} ${rest.slice(0, Math.min(needed, rest.length))}`
  })
}

/** How many surname letters one name needs to stand apart from its clashes. */
function lengthNeeded(full: string, all: readonly string[], firsts: readonly string[]): number {
  const i = all.indexOf(full)
  const rest = surname(full)
  if (!rest) return 1
  const rivals = all.filter((other, j) => j !== i && firsts[j] === firsts[i])
  let take = 1
  while (take < rest.length && rivals.some(r => surname(r).slice(0, take) === rest.slice(0, take))) {
    take++
  }
  return take
}

/** Everything after the first name, or '' when there is nothing after it. */
function surname(full: string): string {
  const parts = full.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : ''
}

export type PlayerRow = { id: string; name: string; handicap?: number | null }
export type TeamRow = { id: string; name: string }

/** One player, standing for themselves. */
export function playerEntrant(p: PlayerRow): Entrant {
  return {
    id: p.id,
    memberNames: [p.name],
    name: p.name,
    shortName: firstName(p.name),
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
  // Short names are worked out against the pairing's own members. Two Rosses
  // in the same pairing is the case that has to read.
  const short = shortNames(names)

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
