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
