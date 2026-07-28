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

export type StoredMatch = {
  id: string
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
}

export type BracketStatus = {
  exists: boolean
  matchCount: number
  /** Matches settled by an actual result, not by a bye. */
  playedCount: number
  byeCount: number
  roundNames: string[]
  /** Players on the roster right now — not necessarily what the bracket used. */
  playerCount: number
}

/**
 * Players eligible for a bracket, in registration order.
 *
 * Everyone on the trip roster counts, whether or not they have claimed their
 * own slot — an organiser-entered player is still expected to play. Composite
 * players are synthetic scorecards, not people, so they are excluded.
 */
export async function fetchBracketPlayers(tripId: string): Promise<BracketPlayer[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, created_at')
    .eq('trip_id', tripId)
    .eq('is_composite', false)
    .order('created_at')

  if (error) throw new MatchplayError('Could not read the player list. Please try again.')
  // Seeding rule lives in lib/matchplay.ts — swap it there, not here.
  return sortPlayersBySeed(data ?? []).map(p => ({ id: p.id, name: p.name }))
}

export async function loadBracket(tripId: string): Promise<StoredMatch[]> {
  const { data, error } = await supabase
    .from('matchplay_matches')
    .select(
      'id, round_number, round_name, slot, player_a_id, player_b_id, ' +
      'player_a_is_bye, player_b_is_bye, seed_a, seed_b, ' +
      'winner_player_id, result, next_match_id, next_slot'
    )
    .eq('trip_id', tripId)
    .order('round_number')
    .order('slot')

  if (error) throw new MatchplayError('Could not load the bracket. Please try again.')
  return (data ?? []) as unknown as StoredMatch[]
}

export async function getBracketStatus(tripId: string): Promise<BracketStatus> {
  const [matches, players] = await Promise.all([
    loadBracket(tripId),
    fetchBracketPlayers(tripId),
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
    playerCount: players.length,
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
export async function createBracket(tripId: string): Promise<BracketStatus> {
  const players = await fetchBracketPlayers(tripId)

  const blocked = bracketBlockedReason(players.length)
  if (blocked) throw new MatchplayError(blocked)

  const matches = generateBracket(players)
  const rows = rowsInInsertOrder(bracketToRows(tripId, matches))

  await deleteBracket(tripId)

  // next_match_id is a self-reference; rows are ordered so every target is
  // written before the matches pointing at it, and the constraint is
  // deferrable, so a single statement is safe either way.
  const { error } = await supabase.from('matchplay_matches').insert(rows)
  if (error) {
    throw new MatchplayError('Could not save the bracket. Please try again.')
  }

  return getBracketStatus(tripId)
}
