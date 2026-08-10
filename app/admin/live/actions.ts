'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { voidScorecard } from '@/lib/scorecardVoid'
import { why } from '@/lib/writeFailure'
import { requireAdmin } from '../adminGate'

/**
 * The two things an admin can do to a scorecard, and the difference matters:
 *
 *   · Close keeps every score. It is exactly what the nightly job does to a
 *     stale card — status closed, nothing else — so the round stops reading
 *     as in play and the players are free to start a fresh card. A closed
 *     card's locks are inert: every scoring screen reads only active and
 *     finalised cards.
 *   · Void erases the card's scores from both tables, releases its players
 *     and closes it, through lib/scorecardVoid — the same module the scoring
 *     screens use, with the service-role client passed in.
 *
 * Each action re-verifies the session: the page's gate protected the page,
 * and this request is a new one.
 */

export async function closeCard(
  liveRoundId: string,
): Promise<{ error: string | null }> {
  if (!(await requireAdmin())) return { error: 'Signed out — log in again.' }

  const db = createAdminClient()
  const { error } = await db
    .from('live_rounds')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', liveRoundId)
    .eq('status', 'active')  // a finalised card is a signed scorecard — never this
  if (error) {
    console.error('closeCard failed:', error)
    return { error: 'Could not close the scorecard — try again.' }
  }

  revalidatePath('/admin/live')
  return { error: null }
}

export async function voidCard(
  liveRoundId: string,
  roundId: string,
): Promise<{ error: string | null }> {
  if (!(await requireAdmin())) return { error: 'Signed out — log in again.' }

  const db = createAdminClient()
  const failure = await voidScorecard(liveRoundId, roundId, db)
  if (failure) {
    return { error: `Could not void the scorecard${why(failure)}` }
  }

  revalidatePath('/admin/live')
  return { error: null }
}
