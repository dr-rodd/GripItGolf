// A player's own colour — the only copy of the rules (Ross, 26 Oct 2026).
//
// **On an event without sides, a player may pick a colour for themselves**
// on the Settings tab, from the team palette (lib/teamColors.ts). It is the
// dot beside their name on the leaderboard and the scorecard, and their
// side of a match play card, the bracket and the live board.
//
// **Once the event has a side, the side's colour is every player's** — a
// tag is a team on the main sheet (lib/tagBoards.ts), and making the first
// one is what switches the picks off. They are set aside, not deleted, so
// taking the sides away again brings them back. A player with no tag on an
// event that has them wears no colour, never their own pick, or it could
// pass for a side.
//
// Events only: a trip never offers the picker, so on a trip there is
// nothing to read and a player's colour is their team's, as it always was.
//
// Stored on `players.colour` (migration 063, applied by hand), read in a
// query of its own and fail-soft — never named inside a wider players
// select. Pure. No I/O.

import { PRESET_COLORS } from './teamColors'
import { eventTags, tagOf } from './tagBoards'
import type { Membership, TeamRow } from './teamSets'

/** The colours a player may pick from — the team palette, the one copy. */
export const PLAYER_COLOURS: readonly string[] = PRESET_COLORS

const HEX6 = /^#[0-9a-f]{6}$/i

/** A stored pick, or null. Anything but a six-digit hex reads as no pick. */
export function normalisePlayerColour(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const c = v.trim()
  return HEX6.test(c) ? c.toUpperCase() : null
}

/** Does this event have sides? The first tag made switches the picks off. */
export function hasTags(teams: readonly TeamRow[]): boolean {
  return eventTags(teams).length > 0
}

/** May the players pick their own colour? Events only, and only while there are no sides. */
export function ownColoursOffered(event: boolean, teams: readonly TeamRow[]): boolean {
  return event && !hasTags(teams)
}

/**
 * One player's colour: their side's where the event has sides, their own
 * pick where it has none, else null.
 *
 * `tagColour` is the colour of the team the player holds on the main
 * sheet, however the caller came by it — the scorecard reads it off the
 * player's `teams` embed, the knockout off the memberships.
 */
export function resolvePlayerColour(
  tagsOn: boolean,
  tagColour: string | null | undefined,
  pick: unknown,
): string | null {
  return tagColour || (tagsOn ? null : normalisePlayerColour(pick))
}

/** The picks as read, `{ id, colour }` rows, into a lookup. A failed read is an empty one. */
export function picksFrom(rows: readonly { id: string; colour?: string | null }[] | null | undefined): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows ?? []) {
    const c = normalisePlayerColour(r.colour)
    if (c) out.set(r.id, c)
  }
  return out
}

/**
 * Every player's colour on one trip, as a lookup — the knockout and the
 * leaderboard ask it of the teams, the memberships and the picks they
 * already hold.
 */
export function playerColourOf(
  teams: readonly (TeamRow & { color?: string | null })[],
  memberships: readonly Membership[],
  picks: ReadonlyMap<string, string>,
): (playerId: string) => string | null {
  const tagsOn = hasTags(teams)
  const colourOfTeam = new Map(teams.map(t => [t.id, t.color ?? null]))
  return id => resolvePlayerColour(
    tagsOn,
    colourOfTeam.get(tagOf(memberships, id) ?? '') ?? null,
    picks.get(id),
  )
}
