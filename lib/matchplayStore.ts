// Reading and writing matchplay brackets.
//
// lib/matchplay.ts is deliberately pure — no imports, no I/O — so it can be
// unit-tested without a database or environment. This module is the only
// place that talks to Supabase, and it leans on those pure functions rather
// than reimplementing any bracket logic.

import { supabase } from '@/lib/supabase'
import {
  generateBracket, bracketToRows, rowsInInsertOrder, sortPlayersBySeed,
  bracketBlockedReason, MatchplayError,
  type BracketPlayer,
} from './matchplay'
import { recordWinner, clearWinner } from './matchplayProgress'
import {
  playerEntrant, pairEntrant, type Entrant, type EntrantKind,
} from './matchplayEntrants'
import { MAIN_SET, membersOf } from './teamSets'
import { fetchMemberships } from './teamMembers'

/**
 * A match as the rest of the app sees it: two sides, whoever they are.
 *
 * The `player_*` names are kept even for a pairs draw, where the sides are
 * pairings. That is deliberate. lib/matchplay.ts and lib/matchplayProgress.ts
 * are pure, heavily tested, and care only that a side has an id — renaming
 * their fields to suit a second entrant kind would churn 485 passing checks
 * to say the same thing. The mapping to and from the team columns happens at
 * the edge of this module, in toStored/toRow, and nowhere else.
 */
export type StoredMatch = {
  id: string
  trip_id: string
  round_number: number
  round_name: string
  slot: number
  player_a_id: string | null
  player_b_id: string | null
  player_a_is_bye: boolean
  player_b_is_bye: boolean
  seed_a: number | null
  seed_b: number | null
  winner_player_id: string | null
  result: string | null
  next_match_id: string | null
  next_slot: 'A' | 'B' | null
  /** Which columns this row actually lives in. */
  entrant_type: EntrantKind
}

/** The columns read back from the database, both sets. */
export type MatchRow = Omit<StoredMatch, 'entrant_type'> & {
  entrant_type: EntrantKind | null
  team_a_id: string | null
  team_b_id: string | null
  winner_team_id: string | null
}

const MATCH_COLUMNS =
  'id, trip_id, round_number, round_name, slot, player_a_id, player_b_id, ' +
  'player_a_is_bye, player_b_is_bye, seed_a, seed_b, ' +
  'winner_player_id, result, next_match_id, next_slot, ' +
  'entrant_type, team_a_id, team_b_id, winner_team_id'

/**
 * Database row → the shape everything else works in.
 *
 * Rows written before pairs existed have no `entrant_type`, so a missing one
 * reads as a singles draw rather than as an error.
 *
 * Exported only so scripts/test-entrants.ts can exercise the real mapping
 * rather than a restatement of it. Getting the direction wrong would record a
 * result against the wrong entrant, so it is worth testing the code that runs.
 */
export function toStored(row: MatchRow): StoredMatch {
  const kind: EntrantKind = row.entrant_type === 'pair' ? 'pair' : 'player'
  if (kind === 'player') {
    const { team_a_id, team_b_id, winner_team_id, ...rest } = row
    void team_a_id; void team_b_id; void winner_team_id
    return { ...rest, entrant_type: 'player' }
  }
  const { team_a_id, team_b_id, winner_team_id, ...rest } = row
  return {
    ...rest,
    entrant_type: 'pair',
    player_a_id: team_a_id,
    player_b_id: team_b_id,
    winner_player_id: winner_team_id,
  }
}

/** The reverse, for every write. Exported for the same reason as toStored. */
export function toRow(m: StoredMatch): Record<string, unknown> {
  const base = {
    id: m.id,
    trip_id: m.trip_id,
    round_number: m.round_number,
    round_name: m.round_name,
    slot: m.slot,
    player_a_is_bye: m.player_a_is_bye,
    player_b_is_bye: m.player_b_is_bye,
    seed_a: m.seed_a,
    seed_b: m.seed_b,
    result: m.result,
    next_match_id: m.next_match_id,
    next_slot: m.next_slot,
    entrant_type: m.entrant_type,
  }
  // The database refuses a row that fills both sets, so the unused set is
  // written as NULL rather than left off — an update has to clear it.
  return m.entrant_type === 'pair'
    ? {
        ...base,
        player_a_id: null, player_b_id: null, winner_player_id: null,
        team_a_id: m.player_a_id, team_b_id: m.player_b_id,
        winner_team_id: m.winner_player_id,
      }
    : {
        ...base,
        player_a_id: m.player_a_id, player_b_id: m.player_b_id,
        winner_player_id: m.winner_player_id,
        team_a_id: null, team_b_id: null, winner_team_id: null,
      }
}

export type BracketStatus = {
  exists: boolean
  matchCount: number
  /** Matches settled by an actual result, not by a bye. */
  playedCount: number
  byeCount: number
  roundNames: string[]
  /**
   * Entrants available right now — players in a singles draw, pairings in a
   * pairs one. Not necessarily what the bracket was drawn from.
   */
  entrantCount: number
  /** What this draw is between. */
  kind: EntrantKind
}

/**
 * Everyone in the draw, whichever kind of draw it is.
 *
 * Everyone on the trip roster counts, whether or not they have claimed their
 * own slot — an organiser-entered player is still expected to play. Composite
 * players are synthetic scorecards, not people, so they are excluded.
 *
 * A pairs draw seats teams, so an empty team would take a place in the
 * bracket and then have nobody to play it. They are dropped here rather than
 * seeded and dealt with later.
 */
export async function fetchEntrants(
  tripId: string,
  kind: EntrantKind,
  /**
   * Which team sheet the pairings come from. A trip can run a league between
   * fours and this draw between pairings; seating it from the league's teams
   * would put four players on one side of a match.
   */
  teamSet: string = MAIN_SET,
): Promise<Entrant[]> {
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, name, handicap, created_at')
    .eq('trip_id', tripId)
    .eq('is_composite', false)
    .order('created_at')

  if (playersError) throw new MatchplayError('Could not read the player list. Please try again.')
  const roster = players ?? []

  if (kind === 'player') {
    return sortPlayersBySeed(roster).map(playerEntrant)
  }

  const [teamsRes, memberships] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, created_at, team_set')
      .eq('trip_id', tripId)
      .eq('team_set', teamSet)
      .order('created_at'),
    fetchMemberships(tripId),
  ])

  if (teamsRes.error) throw new MatchplayError('Could not read the pairings. Please try again.')

  return sortPlayersBySeed(teamsRes.data ?? [])
    .map(t => {
      const ids = membersOf(memberships, t.id)
      return pairEntrant(t, roster.filter(p => ids.includes(p.id)))
    })
    .filter(e => e.memberNames.length > 0)
}

export async function loadBracket(tripId: string): Promise<StoredMatch[]> {
  const { data, error } = await supabase
    .from('matchplay_matches')
    .select(MATCH_COLUMNS)
    .eq('trip_id', tripId)
    .order('round_number')
    .order('slot')

  if (error) throw new MatchplayError('Could not load the bracket. Please try again.')
  return ((data ?? []) as unknown as MatchRow[]).map(toStored)
}

export async function getBracketStatus(
  tripId: string,
  kind: EntrantKind = 'player',
  teamSet: string = MAIN_SET,
): Promise<BracketStatus> {
  const [matches, entrants] = await Promise.all([
    loadBracket(tripId),
    fetchEntrants(tripId, kind, teamSet),
  ])

  const byes = matches.filter(m => m.player_a_is_bye || m.player_b_is_bye)
  // A bye already carries a winner, so it must not be counted as a result
  const played = matches.filter(
    m => m.winner_player_id && !m.player_a_is_bye && !m.player_b_is_bye
  )

  return {
    exists: matches.length > 0,
    matchCount: matches.length,
    playedCount: played.length,
    byeCount: byes.length,
    roundNames: [...new Set(matches.map(m => m.round_name))],
    entrantCount: entrants.length,
    kind,
  }
}

// Re-exported so the settings panel has one import for everything it needs.
// Both are pure and defined in lib/matchplay.ts, where they are unit-tested.
export { bracketBlockedReason, previewBracket } from './matchplay'

export async function deleteBracket(tripId: string): Promise<void> {
  const { error } = await supabase
    .from('matchplay_matches')
    .delete()
    .eq('trip_id', tripId)
  if (error) throw new MatchplayError('Could not clear the existing bracket. Please try again.')
}

/**
 * Build and store a bracket, replacing any that already exists.
 *
 * The roster is re-read here rather than trusted from the caller, so a bracket
 * always reflects who is registered at the moment the organiser clicks — not
 * whenever the page happened to load.
 */
export async function createBracket(
  tripId: string,
  kind: EntrantKind = 'player',
  teamSet: string = MAIN_SET,
): Promise<BracketStatus> {
  const entrants = await fetchEntrants(tripId, kind, teamSet)

  const blocked = bracketBlockedReason(entrants.length)
  if (blocked) throw new MatchplayError(blocked)

  const matches = generateBracket(entrants.map(e => ({ id: e.id, name: e.name })))
  const rows = rowsInInsertOrder(bracketToRows(tripId, matches))
    .map(r => toRow({ ...r, entrant_type: kind } as StoredMatch))

  await deleteBracket(tripId)

  // next_match_id is a self-reference; rows are ordered so every target is
  // written before the matches pointing at it, and the constraint is
  // deferrable, so a single statement is safe either way.
  const { error } = await supabase.from('matchplay_matches').insert(rows)
  if (error) {
    throw new MatchplayError('Could not save the bracket. Please try again.')
  }

  return getBracketStatus(tripId, kind, teamSet)
}

/**
 * Record or correct a winner, writing the whole cascade in one statement.
 *
 * The cascade may touch several rows — a correction early in a large bracket
 * clears every decided match above it. Those rows have to move together: a
 * half-applied cascade leaves a bracket claiming someone won a match against
 * an opponent who is no longer in it. A single upsert is one INSERT ... ON
 * CONFLICT, so the database applies all of it or none, which matters on the
 * patchy connections this app is used on.
 *
 * The decision of what to change is made by the pure function in
 * matchplayProgress.ts — the code that is unit-tested is the code that runs.
 */
export async function persistWinner(
  allMatches: StoredMatch[],
  matchId: string,
  /** Null puts the match back to unplayed. */
  winnerPlayerId: string | null,
  result: string | null,
): Promise<StoredMatch[]> {
  const { matches, changed } = winnerPlayerId === null
    ? clearWinner(allMatches, matchId)
    : recordWinner(allMatches, matchId, winnerPlayerId, { result })

  if (changed.length === 0) return matches

  const { error } = await supabase
    .from('matchplay_matches')
    .upsert(changed.map(toRow), { onConflict: 'id' })

  if (error) {
    throw new MatchplayError('Could not save that result. Please try again.')
  }
  return matches
}
