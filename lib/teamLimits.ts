// What a team is allowed to be, given what the trip is running.
//
// A team league puts no ceiling on team size — lib/teamScoring.ts takes any
// number of players. A pairs matchplay draw does: a pairing IS a team of two,
// so the draw only makes sense if every team holds exactly two.
//
// Pure, so the setup screen, the teams screen and the tests share one rule.

import { isPairsMatchplay, type TripFormats } from './formats'

export const PAIR_SIZE = 2

/** What a team is called on screen. Pairings, in a pairs draw. */
export type TeamNoun = { one: string; many: string; One: string; Many: string }

export function teamNoun(f: TripFormats): TeamNoun {
  return isPairsMatchplay(f)
    ? { one: 'pairing', many: 'pairings', One: 'Pairing', Many: 'Pairings' }
    : { one: 'team', many: 'teams', One: 'Team', Many: 'Teams' }
}

/**
 * The hard ceiling on team size, or null when there isn't one.
 * Only a pairs draw sets one.
 */
export function teamSizeLimit(f: TripFormats): number | null {
  return isPairsMatchplay(f) ? PAIR_SIZE : null
}

/** The banner shown above team selection when a limit applies. */
export function teamSizeBanner(f: TripFormats): string | null {
  return isPairsMatchplay(f)
    ? `Max ${PAIR_SIZE} per pairing — a pairs draw is played between teams of two.`
    : null
}

/**
 * How many teams this many players make.
 *
 * Under a pairs draw the count is not a choice: every player pairs up, and an
 * odd field leaves one pairing a player short rather than silently dropping
 * somebody. Elsewhere the organiser picks from the usual options.
 */
export function teamCountOptions(f: TripFormats, playerCount: number): number[] {
  if (isPairsMatchplay(f)) {
    const needed = Math.ceil(playerCount / PAIR_SIZE)
    return needed >= 1 ? [needed] : []
  }
  return [2, 3, 4, 5, 6, 8]
}

export type TeamLike = { id: string; name: string }
export type MemberLike = { id: string; team_id: string | null }

export type TeamSizeProblem = {
  teamId: string
  teamName: string
  size: number
  limit: number
}

/** Teams holding more than the limit allows. Empty when there is no limit. */
export function oversizedTeams(
  f: TripFormats,
  teams: readonly TeamLike[],
  players: readonly MemberLike[],
): TeamSizeProblem[] {
  const limit = teamSizeLimit(f)
  if (limit === null) return []
  return teams
    .map(t => ({
      teamId: t.id,
      teamName: t.name,
      size: players.filter(p => p.team_id === t.id).length,
      limit,
    }))
    .filter(t => t.size > limit)
}

/**
 * Whether one more player can join this team.
 * Used to refuse a drag rather than let it fail at the database.
 */
export function canJoinTeam(
  f: TripFormats,
  teamId: string,
  players: readonly MemberLike[],
): boolean {
  const limit = teamSizeLimit(f)
  if (limit === null) return true
  return players.filter(p => p.team_id === teamId).length < limit
}

/**
 * Why a pairs draw cannot be drawn yet, or null if it can.
 *
 * A pairing short of a player is allowed to exist while teams are still being
 * filled, but it cannot take the tee: the draw is between pairings, and a
 * pairing of one is a different competition.
 */
export function pairsBlockedReason(
  f: TripFormats,
  teams: readonly TeamLike[],
  players: readonly MemberLike[],
): string | null {
  if (!isPairsMatchplay(f)) return null
  if (teams.length === 0) return 'Pick the pairings before drawing the bracket.'

  const sizes = teams.map(t => ({
    name: t.name,
    size: players.filter(p => p.team_id === t.id).length,
  }))

  const over = sizes.filter(s => s.size > PAIR_SIZE)
  if (over.length > 0) {
    return `${over.map(s => s.name).join(', ')} ${over.length === 1 ? 'has' : 'have'} more than ${PAIR_SIZE} players. A pairing is two.`
  }
  const short = sizes.filter(s => s.size < PAIR_SIZE)
  if (short.length > 0) {
    return `${short.map(s => s.name).join(', ')} ${short.length === 1 ? 'is' : 'are'} short of a player.`
  }
  const unassigned = players.filter(p => !p.team_id).length
  if (unassigned > 0) {
    return `${unassigned} player${unassigned === 1 ? '' : 's'} still ${unassigned === 1 ? 'has' : 'have'} no pairing.`
  }
  return null
}
