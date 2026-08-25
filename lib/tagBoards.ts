// Tags — an event's overarching grouping, the only copy of its rules.
//
// A tag is the team-like label that never changes day to day: Europe and
// USA, the four club sides, the stag do against the groom's men. Players
// carry it for the life of the event — it is how an overall leaderboard
// can rank sides while the actual playing teams (fourballs, pairs) change
// with every tee sheet.
//
// Under the hood a tag IS a team: a `teams` row on the trip's main sheet,
// membership a `team_members` row written through the one writer
// (lib/teamMembers.ts `setTeam`). That is a decision, not an accident —
// the main sheet is the one `players.team_id` mirrors, so every coloured
// dot the platform already draws (the live scoring roster, the join
// screens) shows the tag with no query changed, and the database's
// UNIQUE(player_id, team_set) is already the one-tag-per-player rule.
// The legacy organiser-assigned team feature and tags are one feature
// wearing two names; this file is where the tag name gets its rules.
//
// Events only, like everything organiser-shaped. On a plain trip the main
// sheet is simply the trip's team sheet, exactly as it always was — no
// trip screen imports this file.
//
// Pure. No I/O — the tags portal (app/trip/[tripCode]/organiser/tags) and
// the teams screen do the fetching and writing.

import {
  MAIN_SET, teamsOnSheet, teamFor,
  type Membership, type TeamRow,
} from './teamSets'

/**
 * The sheet tags live on. An alias of the main sheet, named so a call site
 * reads as what it means — `teamFor(ms, id, TAG_SET)` is "which tag" — and
 * so the mirror-and-dots reasoning above has one symbol to hang off.
 */
export const TAG_SET = MAIN_SET

/** The event's tags, in creation order (the caller's fetch orders them). */
export function eventTags<T extends TeamRow>(teams: readonly T[]): T[] {
  return teamsOnSheet(teams, TAG_SET)
}

/** Which tag this player carries, or null. */
export function tagOf(
  memberships: readonly Membership[],
  playerId: string,
): string | null {
  return teamFor(memberships, playerId, TAG_SET)
}

/** The players still carrying no tag, in the order they were given. */
export function untaggedIds(
  playerIds: readonly string[],
  memberships: readonly Membership[],
): string[] {
  return playerIds.filter(id => tagOf(memberships, id) === null)
}

/**
 * The organiser card's one-line summary — where tagging stands, or an
 * invitation when it has not started.
 */
export function describeTags(
  tagCount: number,
  taggedCount: number,
  playerCount: number,
): string {
  if (tagCount === 0) return 'No tags yet — the event-wide sides players carry all week.'
  const tags = `${tagCount} tag${tagCount === 1 ? '' : 's'}`
  if (playerCount === 0) return `${tags} · nobody on the roster yet.`
  return `${tags} · ${taggedCount} of ${playerCount} player${playerCount === 1 ? '' : 's'} tagged.`
}
