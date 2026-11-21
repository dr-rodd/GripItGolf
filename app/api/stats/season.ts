// A golfer's season, read on the server — the one copy the club area and the
// personal page share (D143). Their own players' summary rows this year
// (migration 088), never a hole score, and the courses' names.

import type { createAdminClient } from '@/lib/supabase-admin'
import type { IndexPoint, SeasonRow } from '@/lib/cardSummary'

type Db = ReturnType<typeof createAdminClient>

export async function readSeason(db: Db, userId: string, year: number): Promise<{ rows: SeasonRow[]; courses: Record<string, string>; index: IndexPoint[] }> {
  const empty = { rows: [], courses: {}, index: [] }
  const from = `${year}-01-01`, to = `${year}-12-31`
  // MO4 (D283): this year's index changes, read beside the rows (089 — fail-soft).
  const indexP = readIndexPoints(db, userId, from, to).catch(() => [] as IndexPoint[])
  const linked = await db.from('account_players').select('player_id').eq('user_id', userId)
  if (linked.error || !linked.data?.length) return { ...empty, index: await indexP }
  const ids0 = (linked.data as { player_id: string }[]).map(r => r.player_id)
  const ask = (deep: boolean) => db.from('card_summaries')
    .select(`round_id, trip_id, played_on, holes, gross, par, points, origin, club_id, course_id${deep ? ', putts, putts_holes, fairways_hit, fairways_tried, gir, gir_holes, eagles, birdies, pars, bogeys, doubles' : ''}`)
    .in('player_id', ids0)
    .gte('played_on', from).lte('played_on', to)
    .order('played_on', { ascending: false })
  let res = await ask(true)
  if (res.error) res = await ask(false)
  // Before migration 088 there are no summaries: no season yet.
  if (res.error) return { ...empty, index: await indexP }
  const rows0 = (res.data ?? []) as unknown as SeasonRow[]
  const courseIds = [...new Set(rows0.map(r => r.course_id).filter(Boolean))] as string[]
  const tripIds = [...new Set(rows0.map(r => r.trip_id))]
  const [courses, trips, index] = await Promise.all([
    courseIds.length ? db.from('courses').select('id, name').in('id', courseIds) : Promise.resolve({ data: [] }),
    tripIds.length ? db.from('trips').select('id, name, trip_code').in('id', tripIds) : Promise.resolve({ data: [] }),
    indexP,
  ])
  const tripOf = new Map(((trips.data ?? []) as { id: string; name: string; trip_code: string }[]).map(t => [t.id, t]))
  const rows = rows0.map(r => ({ ...r, event_name: tripOf.get(r.trip_id)?.name ?? null, event_code: tripOf.get(r.trip_id)?.trip_code ?? null }))
  return { rows, courses: Object.fromEntries(((courses.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])), index }
}

/** The account's index after each change this year, with the one it came into the year on. */
async function readIndexPoints(db: Db, userId: string, from: string, to: string): Promise<IndexPoint[]> {
  const { data, error } = await db.from('handicap_changes').select('old_index, new_index, changed_at')
    .eq('user_id', userId).gte('changed_at', `${from}T00:00:00Z`).lte('changed_at', `${to}T23:59:59Z`).order('changed_at')
  if (error || !data?.length) return []
  const rows = data as { old_index: number | null; new_index: number | null; changed_at: string }[]
  const out: IndexPoint[] = []
  if (rows[0].old_index != null) out.push({ at: from, index: Number(rows[0].old_index) })
  for (const r of rows) if (r.new_index != null) out.push({ at: r.changed_at.slice(0, 10), index: Number(r.new_index) })
  return out
}
