'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { deleteTrip } from '@/lib/tripDelete'
import { why } from '@/lib/writeFailure'
import { requireAdmin } from '../adminGate'

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
