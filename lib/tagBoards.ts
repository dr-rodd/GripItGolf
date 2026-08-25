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
import { bestOnHole, type ScoringBasis } from './teamScoring'
// Type-only, and it has to stay that way: lib/teamSets.ts imports values
// from lib/leaderboards.ts, so a value import here would close the ring.
// The tag mode registry lives over there for the same reason.
import type { TagMode } from './leaderboards'

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

// ─── How a tag's round is built ────────────────────────────────
//
// The mode registry itself lives in lib/leaderboards.ts, beside the other
// board options — and it has to, because lib/teamSets.ts imports that
// file and this one imports teamSets. Putting it here would close the
// ring. What lives here is the tag's own rules: the sheet, who carries
// one, and which cards count.

/**
 * A tag's score for one round, from its players' cards for that round.
 *
 * `cards` is one figure per player who played, already in whatever the
 * board is scored on — Stableford points, nett strokes, quota. Selecting
 * the best few is `bestOnHole` from lib/teamScoring.ts: the unit here is a
 * whole card rather than a hole, but the rule is the identical one — the
 * best N by the direction the scoring sorts in — and a second sort here is
 * exactly how the two would come to disagree about which way strokes go.
 *
 * Every card counting is the same selection with N at everybody, so the
 * two modes are one path and cannot drift apart.
 */
export function tagRoundScore(
  cards: readonly number[],
  basis: ScoringBasis,
  mode: TagMode,
  count: number,
): number {
  if (cards.length === 0) return 0
  const take = mode === 'best_cards' ? Math.max(1, count) : cards.length
  return bestOnHole(cards, basis, take).reduce((sum, v) => sum + v, 0)
}

/**
 * Which of a tag's players actually counted, in the order they counted.
 *
 * The same selection `tagRoundScore` makes, said in players rather than in
 * figures — so a countback reads the closing stretches of the cards that
 * counted, and the row can say who carried the round. Ties are broken by
 * player id, the way `lib/teamScoring.ts` breaks them when it cuts the
 * worst card: the same round scored twice must select the same people.
 */
export function countingPlayers(
  cards: readonly { playerId: string; score: number }[],
  basis: ScoringBasis,
  mode: TagMode,
  count: number,
): string[] {
  const take = mode === 'best_cards' ? Math.max(1, count) : cards.length
  return [...cards]
    .sort((a, b) =>
      (basis === 'strokes' ? a.score - b.score : b.score - a.score)
      || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0))
    .slice(0, Math.max(0, take))
    .map(c => c.playerId)
}

// ─── The gate on the tee sheet ─────────────────────────────────
//
// When an event is playing for tags, a player with no tag has nothing to
// play for: their card would be scored and then counted towards nobody.
// So the sheet refuses them rather than seating somebody whose round
// quietly does not count — and a team card can only credit one tag, so a
// team has to be of one.
//
// These are tag rules that happen to bite at the tee sheet, so they live
// here and not in lib/teeSheet.ts, which stays tag-ignorant, or in
// lib/teamLimits.ts, which stays about size. Honest UI gates in the
// platform's usual sense: the trip code is still the only access control.

/**
 * Why these players cannot go on the sheet, or null when they can.
 *
 * Only ever refuses an ADD. Somebody already seated who then loses their
 * tag is left where they stand — evicting a name from a sheet the field
 * has already read is a worse failure than a card that counts for nobody,
 * and the organiser can see the untagged list either way.
 */
export function tagGateReason(
  playerIds: readonly string[],
  memberships: readonly Membership[],
  nameOf: (id: string) => string | undefined,
): string | null {
  const missing = untaggedIds(playerIds, memberships)
  if (missing.length === 0) return null
  const names = missing.map(id => nameOf(id) ?? 'That player')
  const who = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return names.length === 1
    ? `${who} needs a tag before going on the sheet — tags are set in the organiser area.`
    : `${who} need tags before going on the sheet — tags are set in the organiser area.`
}

/**
 * Why these players cannot be one team, or null when they can.
 *
 * A team's card counts towards a tag, and a card cannot count towards two
 * — so a team is of one tag or it is not a team. Untagged is caught by the
 * gate above before this is ever asked, but it is answered here too rather
 * than assumed: this is called from the team-forming path, and a rule that
 * relies on another rule having run is a rule with a hole in it.
 */
export function dayTeamTagIssue(
  memberIds: readonly string[],
  memberships: readonly Membership[],
): string | null {
  if (memberIds.length === 0) return null
  const tags = new Set(memberIds.map(id => tagOf(memberships, id)))
  if (tags.has(null)) return 'Everyone in a team needs a tag first.'
  return tags.size > 1
    ? 'A team has to be all one tag — its card counts towards that tag.'
    : null
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
