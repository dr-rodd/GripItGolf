import type { SupabaseClient } from '@supabase/supabase-js'
import { tagWrites, type FieldTags } from '@/lib/fieldTags'
import { TAG_SET } from '@/lib/tagBoards'

/**
 * The field step's tags, made with the event (lib/fieldTags.ts): a team on
 * the main sheet per tag, each tagged player its member, and
 * `players.team_id` kept true for the main sheet as `setTeam` keeps it.
 * After the players, whose ids it names. A failure costs the tags, never the
 * event — they can be made in the organiser area — so it answers with a
 * line to say, or null.
 */
export async function writeFieldTags(
  client: SupabaseClient,
  tripId: string,
  tags: FieldTags,
  players: readonly { name: string; tag?: string }[],
  playerId: (name: string) => string | undefined,
): Promise<string | null> {
  const ids = new Map<string, string>()
  const tagId = (key: string) => {
    if (!ids.has(key)) ids.set(key, crypto.randomUUID())
    return ids.get(key)!
  }
  const { teams, members } = tagWrites(tags, players, playerId, tagId)
  if (teams.length === 0) return null

  const missed = 'The event is made, but its tags could not be saved — add them in the organiser area.'
  const { error: teamsErr } = await client.from('teams')
    .insert(teams.map(t => ({ ...t, trip_id: tripId, team_set: TAG_SET })))
  if (teamsErr) { console.error('Creation tags failed:', teamsErr); return missed }
  if (members.length === 0) return null

  const { error: membersErr } = await client.from('team_members')
    .insert(members.map(m => ({ ...m, trip_id: tripId, team_set: TAG_SET })))
  if (membersErr) {
    console.error('Creation tag members failed:', membersErr)
    return 'The event is made with its tags, but the players could not be put in them — do it in the organiser area.'
  }
  // The main sheet's mirror, one write a tag.
  for (const t of teams) {
    const playerIds = members.filter(m => m.team_id === t.id).map(m => m.player_id)
    if (playerIds.length === 0) continue
    const { error } = await client.from('players').update({ team_id: t.id }).in('id', playerIds).eq('trip_id', tripId)
    if (error) console.error('Creation tag mirror failed:', error)
  }
  return null
}
