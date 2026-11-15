// A golfer's season, read on the server — the one copy the club area and the
// personal page share (D143). Their own players' summary rows this year
// (migration 088), never a hole score, and the courses' names.

import type { createAdminClient } from '@/lib/supabase-admin'
import type { SeasonRow } from '@/lib/cardSummary'

type Db = ReturnType<typeof createAdminClient>

export async function readSeason(db: Db, userId: string, year: number): Promise<{ rows: SeasonRow[]; courses: Record<string, string> }> {
  const empty = { rows: [], courses: {} }
  const linked = await db.from('account_players').select('player_id').eq('user_id', userId)
  if (linked.error || !linked.data?.length) return empty
  const { data, error } = await db.from('card_summaries')
    .select('round_id, trip_id, played_on, holes, gross, par, points, origin, club_id, course_id')
    .in('player_id', (linked.data as { player_id: string }[]).map(r => r.player_id))
    .gte('played_on', `${year}-01-01`).lte('played_on', `${year}-12-31`)
    .order('played_on', { ascending: false })
  // Before migration 088 there are no summaries: no season yet.
  if (error) return empty
  const rows = (data ?? []) as SeasonRow[]
  const ids = [...new Set(rows.map(r => r.course_id).filter(Boolean))] as string[]
  const { data: courses } = ids.length ? await db.from('courses').select('id, name').in('id', ids) : { data: [] }
  return { rows, courses: Object.fromEntries(((courses ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])) }
}
