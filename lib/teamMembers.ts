// Reading and writing who is in which team.
//
// lib/teamSets.ts is pure — the rules about sheets, membership and sizes, all
// unit-testable without a database. This module is the only place that talks
// to Supabase about `team_members`, so there is one implementation of the two
// things that are easy to get subtly wrong:
//
//   · a player holds at most one place on a sheet, so joining a team means
//     leaving whichever team on that sheet they were in
//   · `players.team_id` is kept in step for the main sheet, because the
//     Donegal Masters archive routes read it directly and are frozen
//
// The second is a mirror, not a source. Nothing here reads it back.

import { supabase } from '@/lib/supabase'
import { MAIN_SET, type Membership } from './teamSets'

/** Every membership on a trip, both sheets. */
export async function fetchMemberships(tripId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, team_set, player_id')
    .eq('trip_id', tripId)

  if (error) {
    console.error('fetchMemberships failed:', error)
    return []
  }
  return (data ?? []) as Membership[]
}

/**
 * Put a player in a team on one sheet, or take them off it with `teamId: null`.
 *
 * The delete runs first and is scoped to the sheet, so moving someone between
 * league teams cannot disturb their pairing. Doing it in one statement is not
 * available to us here, and the unique constraint would refuse the insert
 * anyway — better to make the order explicit than to rely on an upsert
 * resolving a conflict on a key it does not own.
 */
export async function setTeam(
  tripId: string,
  playerId: string,
  teamSet: string,
  teamId: string | null,
): Promise<boolean> {
  const { error: delError } = await supabase
    .from('team_members')
    .delete()
    .eq('player_id', playerId)
    .eq('team_set', teamSet)

  if (delError) {
    console.error('setTeam delete failed:', delError)
    return false
  }

  if (teamId) {
    const { error: insError } = await supabase
      .from('team_members')
      .insert({ trip_id: tripId, team_id: teamId, team_set: teamSet, player_id: playerId })
    if (insError) {
      console.error('setTeam insert failed:', insError)
      return false
    }
  }

  // The frozen archive routes read players.team_id, so the main sheet keeps
  // it true. A second sheet has nowhere to mirror to and does not try.
  if (teamSet === MAIN_SET) {
    const { error: mirrorError } = await supabase
      .from('players')
      .update({ team_id: teamId })
      .eq('id', playerId)
    if (mirrorError) console.error('setTeam mirror to players.team_id failed:', mirrorError)
  }

  return true
}

/**
 * Empty a sheet's teams of their members.
 *
 * Used when the number of teams on a sheet is reduced: the teams themselves
 * are deleted, and the database cascades their memberships — but the mirror
 * on `players.team_id` is ours to clear.
 */
export async function clearMirror(playerIds: readonly string[]): Promise<void> {
  if (playerIds.length === 0) return
  const { error } = await supabase
    .from('players')
    .update({ team_id: null })
    .in('id', playerIds as string[])
  if (error) console.error('clearMirror failed:', error)
}
