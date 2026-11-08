import { createAdminClient } from '@/lib/supabase-admin'
import type { ContactVisibility, PlayerContact } from '@/lib/matchArrangements'

/**
 * Players' contact details, read on the server — `player_contacts` is
 * closed to the browser (migration 057), because an opponent-only number
 * cannot sit in `players`, which anybody with the event's code can read.
 * Whoever renders them decides who may see each (`contactShown`); this only
 * fetches. Empty on any failure — a page without contacts still stands.
 */
export async function readContacts(
  tripId: string, playerIds: readonly string[],
): Promise<Map<string, PlayerContact>> {
  const out = new Map<string, PlayerContact>()
  if (playerIds.length === 0) return out
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('player_contacts')
      .select('player_id, phone, email, visibility')
      .eq('trip_id', tripId)
      .in('player_id', [...playerIds])
    if (error) throw error
    for (const r of (data ?? []) as { player_id: string; phone: string | null; email: string | null; visibility: string }[]) {
      out.set(r.player_id, {
        phone: r.phone, email: r.email,
        visibility: (r.visibility === 'public' ? 'public' : 'opponent') as ContactVisibility,
      })
    }
  } catch (e) {
    console.error('readContacts failed:', e)
  }
  return out
}
