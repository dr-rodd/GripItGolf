// Turning an edited itinerary back into writes.
//
// `ItineraryBuilder` already has a convention for an item that has not been
// saved yet: a `tmp-N` id, issued by the component itself and replaced by a
// real one once the database has seen it (see the comment on `newId` there).
// This reuses exactly that convention rather than inventing a second one, so
// the same builder works unchanged whether it is filling in a brand new trip
// or editing one that already has rounds.
//
// Pure. No I/O — lib/itineraryStore.ts is what actually writes.

import type { ItemKind, ItineraryItem, TravelMode } from './itinerary'

/** An id `ItineraryBuilder` issued locally. Not yet a real database row. */
export function isTempId(id: string): boolean {
  return id.startsWith('tmp-')
}

export type ItemDiff = {
  /** New rows — never seen by the database. */
  toInsert: ItineraryItem[]
  /**
   * Every row that already exists and still does. Written unconditionally
   * rather than compared field-by-field: a save after any reorder touches
   * most of a day's positions anyway, and a same-value UPDATE costs nothing
   * a real diff would have saved.
   */
  toUpdate: ItineraryItem[]
  /** Ids that existed before and are gone now. */
  toDelete: string[]
}

/**
 * What changed between what was loaded and what is about to be saved.
 *
 * `before` is always the set the editor was opened with — real ids only,
 * since nothing that came from the database has a temp one. Anything in
 * `after` that is not in `before` by id is new, whichever kind it is.
 */
export function diffItems(
  before: readonly ItineraryItem[],
  after: readonly ItineraryItem[],
): ItemDiff {
  const beforeIds = new Set(before.map(i => i.id))
  const afterIds = new Set(after.map(i => i.id))

  return {
    toInsert: after.filter(i => isTempId(i.id)),
    toUpdate: after.filter(i => !isTempId(i.id) && beforeIds.has(i.id)),
    toDelete: before.filter(i => !afterIds.has(i.id)).map(i => i.id),
  }
}

/** The columns `itinerary_items` actually has. What one row writes. */
export type ItemRow = {
  trip_id: string
  id?: string
  day_index: number
  position: number
  kind: ItemKind
  course_id: string | null
  tee_time: string | null
  tee_count: number | null
  stay_name: string | null
  travel_mode: TravelMode | null
  from_place: string | null
  to_place: string | null
  duration_mins: number | null
}

/**
 * An item as the row it writes.
 *
 * The `id` is left off a not-yet-saved item rather than sent as its `tmp-`
 * placeholder — the column is a `uuid`, and the database's own default is
 * what should fill it in.
 */
export function toItemRow(tripId: string, item: ItineraryItem): ItemRow {
  return {
    trip_id: tripId,
    ...(isTempId(item.id) ? {} : { id: item.id }),
    day_index: item.dayIndex,
    position: item.position,
    kind: item.kind,
    course_id: item.kind === 'golf' ? item.courseId ?? null : null,
    tee_time: item.kind === 'golf' ? item.teeTime || null : null,
    tee_count: item.kind === 'golf' ? item.teeCount ?? 1 : null,
    stay_name: item.kind === 'stay' ? item.stayName ?? null : null,
    travel_mode: item.kind === 'travel' ? item.travelMode ?? null : null,
    from_place: item.kind === 'travel' ? item.fromPlace || null : null,
    to_place: item.kind === 'travel' ? item.toPlace || null : null,
    duration_mins: item.kind === 'travel' ? item.durationMins ?? null : null,
  }
}

/**
 * Whether saving `after` over `before` would touch golf at all — a new golf
 * item, a removed one, or an existing one moved to a different course or day.
 *
 * The editor already refuses to produce a draft like this once golf is
 * locked; this is the check the write path itself makes before it acts, so
 * a save cannot slip through on a stale screen no matter what the UI showed.
 */
export function touchesGolf(
  before: readonly ItineraryItem[],
  after: readonly ItineraryItem[],
): boolean {
  const diff = diffItems(before, after)
  const beforeById = new Map(before.map(i => [i.id, i]))

  if (diff.toInsert.some(i => i.kind === 'golf')) return true
  if (diff.toDelete.some(id => beforeById.get(id)?.kind === 'golf')) return true

  return diff.toUpdate.some(item => {
    const was = beforeById.get(item.id)
    return was?.kind === 'golf'
      && (was.courseId !== item.courseId || was.dayIndex !== item.dayIndex)
  })
}
