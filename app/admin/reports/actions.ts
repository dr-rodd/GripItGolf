'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '../adminGate'

/**
 * A report on the feed outside any club (D303): take the item down — gone
 * from every stream — or leave it up. Every open report on it is closed
 * either way. Re-checks the admin session: this is a new request.
 */
export async function resolveFeedReport(itemId: string, outcome: 'removed' | 'dismissed'): Promise<{ error: string | null }> {
  if (!(await requireAdmin())) return { error: 'Signed out — log in again.' }
  const db = createAdminClient()
  const at = new Date().toISOString()
  if (outcome === 'removed') {
    const { error } = await db.from('feed_items').update({ removed_at: at }).eq('id', itemId)
    if (error) { console.error('feed take-down failed:', error); return { error: 'Could not save — try again.' } }
  }
  const { error } = await db.from('feed_reports').update({ resolved_at: at, outcome }).eq('item_id', itemId).is('resolved_at', null).is('club_id', null)
  if (error) { console.error('feed report resolve failed:', error); return { error: 'Could not save — try again.' } }
  revalidatePath('/admin/reports')
  return { error: null }
}
