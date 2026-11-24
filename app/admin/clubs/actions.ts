'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '../adminGate'
import { retagSummaries } from '@/app/api/stats/retag'
import { clubStore } from '@/app/api/club/store'
import { provisionClub } from '@/app/api/club/club'
import { findAccount } from '../accounts'

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

/**
 * Setting up a club (Ross, 17 Nov 2026: Green Dot's own act, from here —
 * members can no longer set clubs up). A name, and the Green Dot account
 * that owns it, named by username or email; it goes on the list as its
 * first owner, and the club is verified at once. A test club is made the
 * same way: name the account that will test it.
 */
export async function makeClub(input: { name: string; owner: string; ownerName: string }): Promise<{ error: string | null; made?: { name: string; slug: string; owner: string } }> {
  if (!(await requireAdmin())) return { error: 'Signed out — log in again.' }
  try {
    const db = createAdminClient()
    const owner = await findAccount(db, String(input.owner ?? ''))
    if (!owner) return { error: 'No Green Dot account has that username or email. They need to join first.' }
    const out = await provisionClub(clubStore(db), {
      name: String(input.name ?? ''), verified: true,
      owner: { userId: owner.id, email: owner.email, name: String(input.ownerName ?? '').trim() || owner.username || owner.email.split('@')[0] },
    })
    if (!out.ok) return { error: out.error }
    revalidatePath('/admin/clubs')
    return { error: null, made: { name: out.club.name, slug: out.club.slug, owner: owner.username ?? owner.email } }
  } catch (e) {
    console.error('makeClub failed:', e)
    return { error: 'Could not set the club up — try again.' }
  }
}
