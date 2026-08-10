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
  activity_name: string | null
  activity_time: string | null
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
    // Every one of these is nulled for the kinds it does not belong to, which
    // is not tidiness — `ck_itinerary_shape` refuses a row whose columns and
    // whose kind disagree, so a leftover value from a half-filled form is a
    // failed save rather than a wrong tile.
    activity_name: item.kind === 'activity' ? item.activityName?.trim() || null : null,
    activity_time: item.kind === 'activity' ? item.activityTime || null : null,
  }
}

/**
 * A stored row as the item the builder edits — the read twin of `toItemRow`.
 *
 * Two screens load an itinerary now (Trip Setup's editor and the scoring
 * screen's add-round sheet), and a field-for-field mapping in each is the
 * same trap the write side already fell into: a kind gaining a column
 * reaches one reader and not the other. The casual flags are deliberately
 * not mapped here — they live on the round, not the item, and the caller
 * that wants them merges them from its own rounds query.
 */
export function fromItemRow(r: Omit<ItemRow, 'trip_id' | 'id'> & { id: string }): ItineraryItem {
  return {
    id: r.id, dayIndex: r.day_index, position: r.position, kind: r.kind,
    courseId: r.course_id, teeTime: r.tee_time, teeCount: r.tee_count,
    stayName: r.stay_name, travelMode: r.travel_mode,
    fromPlace: r.from_place, toPlace: r.to_place, durationMins: r.duration_mins,
    activityName: r.activity_name, activityTime: r.activity_time,
  }
}

/**
 * Whether saving `after` over `before` would remove a locked golf item or
 * move it to a different course or day.
 *
 * A golf item is locked because its round has real data under it — scores,
 * or a card open right now — and deleting or re-coursing it would orphan
 * them. That is a fact about *that round*, not about the trip: adding a new
 * round mid-trip is always fine, and so is editing one nobody has played.
 *
 * The editor already refuses to produce a draft like this for a locked
 * item; this is the check the write path itself makes before it acts, so a
 * save cannot slip through on a stale screen no matter what the UI showed.
 */
export function touchesLockedGolf(
  before: readonly ItineraryItem[],
  after: readonly ItineraryItem[],
  lockedIds: ReadonlySet<string>,
): boolean {
  const diff = diffItems(before, after)
  const beforeById = new Map(before.map(i => [i.id, i]))

  if (diff.toDelete.some(id => lockedIds.has(id) && beforeById.get(id)?.kind === 'golf')) {
    return true
  }

  return diff.toUpdate.some(item => {
    if (!lockedIds.has(item.id)) return false
    const was = beforeById.get(item.id)
    return was?.kind === 'golf'
      && (was.courseId !== item.courseId || was.dayIndex !== item.dayIndex)
  })
}
