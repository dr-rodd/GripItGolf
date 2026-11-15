'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { deleteTrip } from '@/lib/tripDelete'
import { why } from '@/lib/writeFailure'
import { requireAdmin } from '../adminGate'
import { fillSummaries } from '@/app/api/stats/store'

/**
 * Deleting a trip — everything it owns, in lib/tripDelete's order.
 *
 * The confirmation is retyping the trip code (or the name, for a trip with
 * no code): the point is not friction for its own sake but making sure the
 * thing being deleted is the thing on the phone screen, on a page that
 * lists every trip on the platform.
 */

export type DeleteTripResult = { error: string | null; deleted: boolean }

export async function deleteTripAction(
  tripId: string,
  _prev: DeleteTripResult,
  formData: FormData,
): Promise<DeleteTripResult> {
  if (!(await requireAdmin())) {
    return { error: 'Signed out — log in again.', deleted: false }
  }

  const db = createAdminClient()

  const { data: trip, error: readError } = await db
    .from('trips')
    .select('id, name, trip_code')
    .eq('id', tripId)
    .maybeSingle()
  if (readError) {
    console.error('deleteTripAction read failed:', readError)
    return { error: 'Could not read the trip — try again.', deleted: false }
  }
  if (!trip) return { error: 'That trip is already gone.', deleted: false }

  const expected = ((trip.trip_code as string | null) ?? (trip.name as string)).trim()
  const typed = String(formData.get('confirm') ?? '').trim()
  if (typed.toLowerCase() !== expected.toLowerCase()) {
    return {
      error: trip.trip_code
        ? 'Type the trip code exactly to confirm.'
        : 'Type the trip name exactly to confirm.',
      deleted: false,
    }
  }

  const failure = await deleteTrip(db, tripId)
  if (failure) {
    return { error: `Could not delete the trip${why(failure)}`, deleted: false }
  }

  revalidatePath('/admin/trips')
  return { error: null, deleted: true }
}

/**
 * The card summaries backfill (stage (f), migration 088): every signed round
 * without summary rows — or written under older rules — filled, as many as
 * fit in about fifty seconds. Tapped again until nothing is left; North West
 * 26's rounds included, read only from their scores.
 */
export async function backfillSummaries(): Promise<{ error: string | null; filled?: number; remaining?: number }> {
  if (!(await requireAdmin())) return { error: 'Signed out — log in again.' }
  try {
    const r = await fillSummaries({ limit: 200, rewriteOlder: true, deadline: Date.now() + 50_000 }, createAdminClient())
    if ('notReady' in r) return { error: 'Paste migration 088 first.' }
    return { error: null, ...r }
  } catch (e) {
    console.error('backfillSummaries failed:', e)
    return { error: 'Could not fill the summaries — try again.' }
  }
}
