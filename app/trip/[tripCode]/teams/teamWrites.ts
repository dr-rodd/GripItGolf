import { supabase } from '@/lib/supabase'
import { setTeam, clearMirror } from '@/lib/teamMembers'
import { MAIN_SET } from '@/lib/teamSets'
import { isMadeName } from '@/lib/partnerships'
import { madeTeamName } from '@/lib/teamPicker'
import type { WriteFailure } from '@/lib/writeFailure'

/**
 * The team picker's writes — the list's Join and Leave and the wizard's
 * save share them, so a team is made, filled, named and emptied one way.
 * Every membership goes through `setTeam`, the one writer; who added whom
 * is written only where migration 066 is known to be in (`addedBy` left
 * undefined otherwise, so the column is never named before it exists).
 */

export type TeamRow = { id: string; name: string; color: string; team_set: string | null }

/** A new team on a sheet, named for whoever is first in it. */
export async function createTeam(
  tripId: string, sheet: string, name: string, color: string,
): Promise<TeamRow | null> {
  const { data, error } = await supabase
    .from('teams')
    .insert({ trip_id: tripId, team_set: sheet, name, color })
    .select('id, name, color, team_set')
    .single()
  if (error || !data) {
    console.error('Team picker: could not make the team', error)
    return null
  }
  return data as TeamRow
}

/** Players into a team and out of it, on one sheet. The first failure stops it. */
export async function moveMembers(input: {
  tripId: string
  sheet: string
  teamId: string
  add: readonly string[]
  remove: readonly string[]
  /** This phone's player, or null for the organiser; undefined before migration 066. */
  addedBy: string | null | undefined
}): Promise<WriteFailure | null> {
  const { tripId, sheet, teamId, add, remove, addedBy } = input
  for (const id of add) {
    const failure = await setTeam(tripId, id, sheet, teamId, addedBy)
    if (failure) return failure
  }
  for (const id of remove) {
    const failure = await setTeam(tripId, id, sheet, null)
    if (failure) return failure
  }
  return null
}

/**
 * A team's stored name kept in step with its players — only while nobody
 * chose it (lib/partnerships.ts `isMadeName`: a lettered default or the
 * players' own names). Best-effort: the screens name a made team from its
 * players anyway, so a rename that fails costs nothing the next change
 * will not fix.
 */
export async function refreshTeamName(input: {
  tripId: string
  team: { id: string; name: string }
  /** Who was in it when the name was last made. */
  before: readonly string[]
  /** Who is in it now. */
  after: readonly string[]
}): Promise<string> {
  const { tripId, team, before, after } = input
  if (after.length === 0 || !isMadeName(team.name, before)) return team.name
  const name = madeTeamName(after)
  if (name === team.name) return name
  await supabase.from('teams').update({ name }).eq('id', team.id).eq('trip_id', tripId)
  return name
}

/** A team gone — its memberships go with it, and the main sheet's mirror is cleared. */
export async function deleteTeam(input: {
  tripId: string
  sheet: string
  teamId: string
  memberIds: readonly string[]
}): Promise<boolean> {
  const { tripId, sheet, teamId, memberIds } = input
  const { error } = await supabase.from('teams').delete().eq('id', teamId).eq('trip_id', tripId)
  if (error) {
    console.error('Team picker: could not delete the team', error)
    return false
  }
  if (sheet === MAIN_SET) await clearMirror(memberIds)
  return true
}
