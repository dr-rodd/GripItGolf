// Writing an edited itinerary back — and, when golf changed, the rounds
// that follow from it.
//
// lib/itinerarySync.ts is the pure half: what changed, and what a row looks
// like. This is the only place that talks to Supabase about it.
//
// Golf items are the source of truth for `rounds` (see migration 021), so
// editing one after the trip has scores would edit a round with real data
// under it. The caller keeps golf locked in the editor once that is true —
// `saveItinerary` refuses anyway, so a stale screen cannot slip a change
// through underneath that guard.

import { supabase } from '@/lib/supabase'
import { golfItems, dateForDay, type ItineraryItem } from './itinerary'
import { diffItems, toItemRow, touchesGolf, isTempId } from './itinerarySync'

export type SaveResult = { ok: true } | { ok: false; error: string }

const FAIL = 'Could not save the itinerary — try again.'

/**
 * Save an edited itinerary, and reconcile rounds if golf changed.
 *
 * The write order matters: delete first (frees slots), then move every
 * surviving row to its final position in one upsert (safe even when two
 * rows are swapping, because `uq_itinerary_slot` is deferred to the end of
 * that one statement), then insert what's new — which by then can only ever
 * land in a genuinely empty slot. See lib/itinerarySync.ts for why a
 * sequence of separate UPDATEs would not have been safe here.
 */
export async function saveItinerary({
  tripId, startDate, before, after, canEditGolf, players,
}: {
  tripId: string
  startDate: string | null
  before: ItineraryItem[]
  after: ItineraryItem[]
  canEditGolf: boolean
  players: { id: string; handicap: number | null }[]
}): Promise<SaveResult> {
  if (!canEditGolf && touchesGolf(before, after)) {
    return { ok: false, error: 'Rounds cannot be changed — this trip already has scores.' }
  }

  const diff = diffItems(before, after)

  if (diff.toDelete.length > 0) {
    const { error } = await supabase.from('itinerary_items').delete().in('id', diff.toDelete)
    if (error) return { ok: false, error: FAIL }
  }

  if (diff.toUpdate.length > 0) {
    const { error } = await supabase
      .from('itinerary_items')
      .upsert(diff.toUpdate.map(item => toItemRow(tripId, item)))
    if (error) return { ok: false, error: FAIL }
  }

  let inserted: { id: string; day_index: number; position: number }[] = []
  if (diff.toInsert.length > 0) {
    const { data, error } = await supabase
      .from('itinerary_items')
      .insert(diff.toInsert.map(item => toItemRow(tripId, item)))
      .select('id, day_index, position')
    if (error || !data) return { ok: false, error: FAIL }
    inserted = data
  }

  if (!canEditGolf) return { ok: true }

  // Golf items now carry real ids — the ones that were already real, plus
  // the just-inserted ones matched back by the slot they landed in.
  const bySlot = new Map(inserted.map(r => [`${r.day_index}:${r.position}`, r.id]))
  const realId = (item: ItineraryItem) =>
    isTempId(item.id) ? bySlot.get(`${item.dayIndex}:${item.position}`) ?? item.id : item.id

  const beforeGolf = golfItems(before)
  const afterGolf = golfItems(after).map(item => ({ ...item, id: realId(item) }))

  const removedIds = beforeGolf
    .filter(b => !afterGolf.some(a => a.id === b.id))
    .map(b => b.id)
  if (removedIds.length > 0) {
    const result = await removeRounds(tripId, removedIds)
    if (!result.ok) return result
  }

  const changed = afterGolf.filter(a => {
    const was = beforeGolf.find(b => b.id === a.id)
    return was && (was.courseId !== a.courseId || was.dayIndex !== a.dayIndex)
  })
  for (const item of changed) {
    const { error } = await supabase
      .from('rounds')
      .update({
        course_id: item.courseId,
        scheduled_date: dateForDay(startDate, item.dayIndex),
      })
      .eq('itinerary_item_id', item.id)
    if (error) return { ok: false, error: 'Could not update a round — try again.' }
  }

  const added = afterGolf.filter(a => !beforeGolf.some(b => b.id === a.id))
  if (added.length > 0) {
    const result = await addRounds(tripId, startDate, added, players)
    if (!result.ok) return result
  }

  return { ok: true }
}

/**
 * Delete the rounds these golf items made — but never one with real data.
 *
 * `canEditGolf` should already guarantee the trip has no scores anywhere,
 * but that was true when the editor opened, not necessarily now: this is the
 * check that runs at the moment of the write, against whoever might have
 * started a card on another device in between.
 */
async function removeRounds(tripId: string, itemIds: string[]): Promise<SaveResult> {
  const { data: rounds, error: findError } = await supabase
    .from('rounds')
    .select('id')
    .eq('trip_id', tripId)
    .in('itinerary_item_id', itemIds)
  if (findError) return { ok: false, error: 'Could not remove a round — try again.' }

  const roundIds = (rounds ?? []).map(r => r.id)
  if (roundIds.length === 0) return { ok: true }

  const [scoresRes, liveRes] = await Promise.all([
    supabase.from('scores').select('id', { count: 'exact', head: true }).in('round_id', roundIds),
    supabase.from('live_rounds').select('id', { count: 'exact', head: true }).in('round_id', roundIds),
  ])
  if ((scoresRes.count ?? 0) > 0 || (liveRes.count ?? 0) > 0) {
    return { ok: false, error: 'A round already has scores recorded — it cannot be removed.' }
  }

  const { error } = await supabase.from('rounds').delete().in('id', roundIds)
  return error ? { ok: false, error: 'Could not remove a round — try again.' } : { ok: true }
}

/**
 * Create the rounds new golf items make, and a handicap snapshot for every
 * current player on each — the same placeholder formula trip creation uses,
 * kept in step until real tee data lets both do better.
 */
async function addRounds(
  tripId: string,
  startDate: string | null,
  items: ItineraryItem[],
  players: { id: string; handicap: number | null }[],
): Promise<SaveResult> {
  const { data: last, error: lastError } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('trip_id', tripId)
    .order('round_number', { ascending: false })
    .limit(1)
  if (lastError) return { ok: false, error: 'Could not create the new round — try again.' }

  let nextNumber = (last?.[0]?.round_number ?? 0) + 1

  const { data: newRounds, error } = await supabase
    .from('rounds')
    .insert(items.map(item => {
      const scheduled = dateForDay(startDate, item.dayIndex)
      return {
        trip_id: tripId,
        course_id: item.courseId,
        round_number: nextNumber++,
        status: 'upcoming',
        itinerary_item_id: item.id,
        ...(scheduled ? { scheduled_date: scheduled } : {}),
      }
    }))
    .select('id')

  if (error || !newRounds) return { ok: false, error: 'Could not create the new round — try again.' }

  if (players.length > 0) {
    const rows = newRounds.flatMap(round =>
      players.map(p => ({
        round_id: round.id,
        player_id: p.id,
        playing_handicap: Math.round(p.handicap ?? 0),
      }))
    )
    const { error: hcpError } = await supabase.from('round_handicaps').insert(rows)
    if (hcpError) return { ok: false, error: 'Round created, but handicaps failed to save.' }
  }

  return { ok: true }
}
