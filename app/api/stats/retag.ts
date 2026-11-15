// Telling an event's card summaries whether they are club rounds (D122) —
// its own small file, so the entry and club routes that call it after a
// club change carry nothing of the summary writer.

import type { createAdminClient } from '@/lib/supabase-admin'

type Db = ReturnType<typeof createAdminClient>
const notThere = (e: { code?: string } | null) => !!e && ['42P01', '42703', 'PGRST205', 'PGRST204'].includes(e.code ?? '')

/**
 * An event's rows told again whether they are club rounds (D122) — after it
 * is put under a club or taken out, or its club is verified or not. Never a
 * re-read of a score.
 */
export async function retagSummaries(db: Db, tripIds: string[]): Promise<void> {
  if (tripIds.length === 0) return
  const { data: priv, error } = await db.from('trip_private').select('trip_id, club_id').in('trip_id', tripIds)
  if (error) return
  const clubOf = new Map(((priv ?? []) as { trip_id: string; club_id: string | null }[]).map(p => [p.trip_id, p.club_id]))
  const clubIds = [...new Set([...clubOf.values()].filter(Boolean))] as string[]
  const verified = new Set<string>()
  if (clubIds.length) {
    const { data: clubs } = await db.from('clubs').select('id, verified_at').in('id', clubIds)
    for (const c of (clubs ?? []) as { id: string; verified_at: string | null }[]) if (c.verified_at) verified.add(c.id)
  }
  for (const tripId of tripIds) {
    const clubId = clubOf.get(tripId) ?? null
    const club = clubId && verified.has(clubId) ? clubId : null
    const { error: e } = await db.from('card_summaries')
      .update({ origin: club ? 'club' : 'self_claimed', club_id: club }).eq('trip_id', tripId)
    if (e && !notThere(e)) throw e
  }
}

