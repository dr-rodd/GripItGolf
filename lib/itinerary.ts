// The running order of a trip.
//
// A trip is a drive to the coast, a tee time, another drive, a guesthouse —
// in that order, on a given day. This module is that model: what an item is,
// how a day is ordered, how an item reads on screen, and whether it has
// already happened.
//
// Pure. No I/O, and "now" is always an argument, so the whole thing can be
// tested without waiting for Tuesday.

export type ItemKind = 'golf' | 'stay' | 'travel'
export type TravelMode = 'car' | 'flight' | 'train'

export const TRAVEL_MODES: TravelMode[] = ['car', 'flight', 'train']

export type ItineraryItem = {
  id: string
  dayIndex: number
  position: number
  kind: ItemKind

  /** golf */
  courseId?: string | null
  /** "13:00" — local clock time; a trip does not cross zones. */
  teeTime?: string | null
  teeCount?: number | null

  /** stay */
  stayName?: string | null

  /** travel */
  travelMode?: TravelMode | null
  fromPlace?: string | null
  toPlace?: string | null
  durationMins?: number | null
}

/** The most tee times one round can sensibly have. */
export const MAX_TEE_TIMES = 12

/** The most consecutive nights one stay can be entered as at once. */
export const MAX_NIGHTS = 14

/** The longest single journey the form will take, in minutes. Two days. */
export const MAX_DURATION = 2880

// ─── Ordering ──────────────────────────────────────────────────

/** One day's items, in the order they happen. */
export function itemsForDay(items: readonly ItineraryItem[], dayIndex: number): ItineraryItem[] {
  return items
    .filter(i => i.dayIndex === dayIndex)
    .sort((a, b) => a.position - b.position)
}

/**
 * Renumber a day's positions to 0, 1, 2 … in their current order.
 *
 * Called after every add, delete and move. Positions are kept gapless rather
 * than sparse: these lists are a handful of items long, and a sequence you
 * can read is worth more than avoiding a rewrite of four rows.
 */
export function renumber(items: readonly ItineraryItem[]): ItineraryItem[] {
  const out: ItineraryItem[] = []
  const days = [...new Set(items.map(i => i.dayIndex))].sort((a, b) => a - b)
  for (const day of days) {
    itemsForDay(items, day).forEach((item, position) => {
      out.push(position === item.position ? item : { ...item, position })
    })
  }
  return out
}

/** Add an item to the end of a day. */
export function addItem(
  items: readonly ItineraryItem[],
  item: Omit<ItineraryItem, 'position'>,
): ItineraryItem[] {
  const day = itemsForDay(items, item.dayIndex)
  return renumber([...items, { ...item, position: day.length }])
}

export function removeItem(items: readonly ItineraryItem[], id: string): ItineraryItem[] {
  return renumber(items.filter(i => i.id !== id))
}

/** How many nights are still left in the trip from this day on. */
export function nightsAvailable(dayIndex: number, days: number): number {
  return Math.max(1, Math.min(MAX_NIGHTS, days - dayIndex))
}

/**
 * A stay, entered once and spread over the nights it covers.
 *
 * Four nights in the same guesthouse is one thing an organiser knows and
 * four tiles on the running order, because the running order is what each
 * day looks like — a day with nowhere to sleep on it is a day missing
 * something. Each night is its own item, so one can be deleted or moved
 * without disturbing the rest.
 *
 * Nights past the end of the trip are dropped rather than refused: the
 * count is capped in the form, and a stay running one night long is not
 * worth stopping somebody over.
 */
export function addStay(
  items: readonly ItineraryItem[],
  draft: { id: string; dayIndex: number; stayName: string },
  nights: number,
  days: number,
): ItineraryItem[] {
  const wanted = Math.max(1, Math.min(Math.floor(nights) || 1, MAX_NIGHTS))
  const lastDay = Math.max(0, days - 1)

  let out: ItineraryItem[] = [...items]
  for (let n = 0; n < wanted; n++) {
    const dayIndex = draft.dayIndex + n
    if (dayIndex > lastDay) break
    out = addItem(out, {
      // Each night needs an id of its own, or React renders one tile
      id: `${draft.id}-n${n}`,
      dayIndex,
      kind: 'stay',
      stayName: draft.stayName,
    })
  }
  return out
}

/**
 * Move an item to a new slot, possibly on another day.
 *
 * `toPosition` is where it should end up in the destination day *after* the
 * move. Dropping past the end lands it last rather than being refused —
 * a drag that goes a bit too far is not a mistake worth reporting.
 */
export function moveItem(
  items: readonly ItineraryItem[],
  id: string,
  toDay: number,
  toPosition: number,
): ItineraryItem[] {
  const moving = items.find(i => i.id === id)
  if (!moving) return [...items]

  const rest = items.filter(i => i.id !== id)
  const target = itemsForDay(rest, toDay)
  const at = Math.max(0, Math.min(toPosition, target.length))

  // Reinsert by rebuilding the destination day around the gap
  const rebuilt: ItineraryItem[] = []
  target.forEach((item, i) => {
    if (i === at) rebuilt.push({ ...moving, dayIndex: toDay, position: -1 })
    rebuilt.push(item)
  })
  if (at >= target.length) rebuilt.push({ ...moving, dayIndex: toDay, position: -1 })

  // Every item in `rebuilt` already belongs to the destination day — the
  // ones that were there, and the moved one, which was stamped on the way in.
  return renumber([
    ...rest.filter(i => i.dayIndex !== toDay),
    ...rebuilt.map((item, position) => ({ ...item, position })),
  ])
}

// ─── Days ──────────────────────────────────────────────────────

/** How many days a trip covers. Always at least one. */
export function dayCount(startDate: string | null, endDate: string | null): number {
  const a = dayNumber(startDate)
  const b = dayNumber(endDate)
  if (a === null || b === null) return 1
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

/** The calendar date of a given day of the trip, or null with no start date. */
export function dateForDay(startDate: string | null, dayIndex: number): string | null {
  const a = dayNumber(startDate)
  if (a === null) return null
  const d = new Date(a + dayIndex * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** A date-only string as a UTC day number, or null if it is not one. */
function dayNumber(d: string | null | undefined): number | null {
  if (!d) return null
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  if (!y || !m || !day) return null
  return Date.UTC(y, m - 1, day)
}

/** "Friday 17 April" — the weekday matters as much as the date on a trip. */
export function describeDay(date: string | null, dayIndex: number): string {
  const n = dayNumber(date)
  if (n === null) return `Day ${dayIndex + 1}`
  return new Date(n).toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
}

// ─── Reading an item ───────────────────────────────────────────

/** "4 hr 30" / "45 min" — a duration as anyone would say it. */
export function describeDuration(mins: number | null | undefined): string {
  if (mins == null || mins <= 0) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m}`
}

/** "1:00 pm" from "13:00". Blank if there is no time. */
export function describeTime(time: string | null | undefined): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return ''
  const period = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

export type ItemLines = { title: string; detail: string }

/**
 * How an item reads on a tile: what it is, and the one thing worth knowing.
 *
 * Course names are passed in rather than looked up, so this stays pure and
 * the caller does the one query it already had to do anyway.
 */
export function describeItem(
  item: ItineraryItem,
  courseName?: string | null,
): ItemLines {
  if (item.kind === 'golf') {
    const count = item.teeCount ?? 1
    const time = describeTime(item.teeTime)
    const groups = count > 1 ? `${count} tee times` : 'tee time'
    return {
      title: courseName ?? 'Golf',
      detail: time ? `${groups} from ${time}` : groups,
    }
  }

  if (item.kind === 'stay') {
    return { title: item.stayName?.trim() || 'Accommodation', detail: 'Overnight' }
  }

  const from = item.fromPlace?.trim()
  const to = item.toPlace?.trim()
  const journey = from && to ? `${from} to ${to}` : to || from || 'Journey'
  const length = describeDuration(item.durationMins)
  return {
    title: journey,
    detail: [length, travelNoun(item.travelMode)].filter(Boolean).join(' '),
  }
}

function travelNoun(mode: TravelMode | null | undefined): string {
  if (mode === 'flight') return 'flight'
  if (mode === 'train') return 'train'
  if (mode === 'car') return 'drive'
  return ''
}

// ─── Has it happened yet? ──────────────────────────────────────

/**
 * Whether an item is in the past, happening, or still to come.
 *
 * The trip hub dims what is done, so the eye lands on what is next. Anything
 * without a time is judged by its day alone — a guesthouse has no clock, but
 * yesterday's guesthouse is still in the past.
 *
 * `now` is always passed in. A component reading the clock directly renders
 * differently on the server and the client, which React reports as a
 * hydration error and a user sees as a flicker.
 */
export type ItemState = 'past' | 'now' | 'future'

export function itemState(
  item: ItineraryItem,
  itemDate: string | null,
  now: Date,
): ItemState {
  const day = dayNumber(itemDate)
  if (day === null) return 'future'

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  if (day > today) return 'future'
  if (day < today) return 'past'

  // Today. Without a time of its own the whole day counts as under way.
  if (item.kind !== 'golf' || !item.teeTime) return 'now'

  const [h, m] = item.teeTime.split(':').map(Number)
  if (!Number.isFinite(h)) return 'now'

  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const start = h * 60 + (m || 0)
  // A round is roughly four and a half hours, plus a group every ten minutes.
  const span = 270 + Math.max(0, (item.teeCount ?? 1) - 1) * 10

  if (minutesNow < start) return 'future'
  return minutesNow > start + span ? 'past' : 'now'
}

/** The whole trip's progress, for the summary heading. */
export function tripProgress(
  items: readonly ItineraryItem[],
  startDate: string | null,
  now: Date,
): { done: number; total: number } {
  let done = 0
  for (const item of items) {
    if (itemState(item, dateForDay(startDate, item.dayIndex), now) === 'past') done++
  }
  return { done, total: items.length }
}

// ─── Validation ────────────────────────────────────────────────

/**
 * Why an item cannot be saved, or null if it can.
 *
 * Deliberately forgiving. A stay needs a name because a blank tile says
 * nothing; a journey needs somewhere to be going. Everything else is
 * optional, because an organiser filling this in on a phone in a pub does
 * not yet know the tee time.
 */
export function itemError(item: Partial<ItineraryItem> & { kind: ItemKind }): string | null {
  if (item.kind === 'golf') {
    if (!item.courseId) return 'Pick a course'
    const count = item.teeCount ?? 1
    if (count < 1 || count > MAX_TEE_TIMES) return `Between 1 and ${MAX_TEE_TIMES} tee times`
    return null
  }
  if (item.kind === 'stay') {
    return item.stayName?.trim() ? null : 'Give it a name'
  }
  if (!item.fromPlace?.trim() && !item.toPlace?.trim()) return 'Say where the journey goes'
  if (item.durationMins != null && (item.durationMins < 0 || item.durationMins > MAX_DURATION)) {
    return 'That journey is too long'
  }
  return null
}

/**
 * Golf items in trip order — which is the order rounds are numbered in.
 *
 * A round exists because a golf item does, so this is what the rounds table
 * is built from. Day first, then position within the day.
 */
export function golfItems(items: readonly ItineraryItem[]): ItineraryItem[] {
  return items
    .filter(i => i.kind === 'golf')
    .sort((a, b) => a.dayIndex - b.dayIndex || a.position - b.position)
}
