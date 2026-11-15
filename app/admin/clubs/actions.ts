'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '../adminGate'
import { retagSummaries } from '@/app/api/stats/retag'

/**
 * Approving or refusing a club (stage (c), question H). Only a verified
 * club's admins run its events (`account_trips()`, migration 086) and only
 * its events show in its people's lists, so this is the one gate between a
 * club typed in by anybody and a club with powers. Each action re-checks the
 * admin session: the page's gate protected the page, this is a new request.
 */
export async function setClubVerified(clubId: string, verified: boolean): Promise<{ error: string | null }> {
  if (!(await requireAdmin())) return { error: 'Signed out — log in again.' }
  const now = new Date().toISOString()
  const { error } = await createAdminClient().from('clubs')
    .update(verified ? { verified_at: now, refused_at: null, updated_at: now } : { verified_at: null, refused_at: now, updated_at: now })
    .eq('id', clubId)
  if (error) {
    console.error('setClubVerified failed:', error)
    return { error: 'Could not save — try again.' }
  }
  // Its events' signed cards are club rounds only while it is verified (D122).
  const { data: events } = await createAdminClient().from('trip_private').select('trip_id').eq('club_id', clubId)
  await retagSummaries(createAdminClient(), ((events ?? []) as { trip_id: string }[]).map(e => e.trip_id))
    .catch(e => console.error('summary retag failed:', e))
  revalidatePath('/admin/clubs')
  return { error: null }
}
