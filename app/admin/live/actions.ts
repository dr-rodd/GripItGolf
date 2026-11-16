'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { voidScorecard } from '@/lib/scorecardVoid'
import { certifiedRounds } from '@/app/api/card/signatures'
import { why } from '@/lib/writeFailure'
import { requireAdmin } from '../adminGate'
import { writeRoundSummaries } from '@/app/api/stats/summaries'
import { summaryDeps } from '@/app/api/stats/store'

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
  // A certified competition round is closed (stage (d4)) — reopen it first.
  if ((await certifiedRounds(db, [roundId])).has(roundId)) return { error: 'This round’s results are certified — its club reopens it first.' }
  const failure = await voidScorecard(liveRoundId, roundId, db)
  if (failure) {
    return { error: `Could not void the scorecard${why(failure)}` }
  }
  // The void's card summaries let go (stage (f)), never in the way of it.
  const { data: round } = await db.from('rounds').select('trips(trip_code)').eq('id', roundId).maybeSingle()
  const code = (round as { trips?: { trip_code?: string } | null } | null)?.trips?.trip_code
  if (code) await writeRoundSummaries(code, roundId, summaryDeps(db), new Date()).catch(e => console.error('card summary after void failed:', e))

  revalidatePath('/admin/live')
  return { error: null }
}
