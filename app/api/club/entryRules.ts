// A club competition's entry rules as stored (stage (m), migration 094):
// trip_private.entry_rules, server only. Read fail-soft — before 094, or
// with none set, a competition is open to everybody, exactly as before.

import type { createAdminClient } from '@/lib/supabase-admin'

export async function readEntryRulesOf(db: ReturnType<typeof createAdminClient>, tripId: string): Promise<unknown> {
  const { data, error } = await db.from('trip_private').select('entry_rules').eq('trip_id', tripId).maybeSingle()
  return error ? null : (data as { entry_rules?: unknown } | null)?.entry_rules ?? null
}
