// What happens next on this trip.
//
// The hub's one job on the third morning is to answer "where am I going and
// when", so this picks the next thing off the running order and works out
// the moment it starts.
//
// **The date and the time live on two different tables.** `rounds` holds the
// calendar date, `itinerary_items` holds the tee time, and they are joined by
// `rounds.itinerary_item_id`. Nothing else in the app has ever needed both at
// once; a countdown does, and this is the only place that puts them together.
//
// **Only golf can be counted down to.** A stay or a journey carries a day and
// a position and nothing finer — the shape constraint on `itinerary_items`
// forbids a `tee_time` on either. So a non-golf item only takes the card once
// its day has actually arrived; before that the next round leads, because
// "Thursday" is not a moment and a countdown to it would be invented.
//
// **An activity is mentioned, never promoted.** It is the one kind that
// carries a clock time without being golf, so it could take the card and
// count down — and it must not. Golf is what the trip is for and stays the
// headline; a dinner is what is on afterwards. `upNext` therefore skips
// activities when choosing, and `nextActivity` returns the next one
// separately, for the caller to draw as a quieter second line.
//
// Pure. `now` is always an argument, and null means "the clock is not known
// yet" — the server has no idea what time it is where the reader is standing.

import {
  type ItineraryItem, itemState, dateForDay, dayNumber, describeItem, describeTime,
} from './itinerary'

export type UpNext = {
  item: ItineraryItem
  /** What it is, and the one thing worth knowing — from `describeItem`. */
  title: string
  detail: string
  /** YYYY-MM-DD. The round's own date where there is a round. */
  date: string | null
  /**
   * The moment it starts, golf with a tee time only.
   *
   * Built in **local clock time** — `new Date(y, m, d, h, m)`, no zone applied
   * anywhere. A tee time is what the starter's sheet says, the trip does not
   * cross zones, and whoever is reading this is on the trip.
   */
  startsAt: Date | null
  /** How many groups go off. Golf only, and only when more than one. */
  groups: number | null
  /** "09:20" as it should be read. */
  teeTime: string
}

/** A round's date, keyed by the itinerary item that created it. */
export type RoundDates = Map<string, string | null>

/** Day first, then position within the day — the order a trip happens in. */
export function orderedItems(items: readonly ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => a.dayIndex - b.dayIndex || a.position - b.position)
}

/**
 * The calendar date an item falls on.
 *
 * A golf item takes its round's `scheduled_date` when there is one, because
 * that is the column the rest of the app schedules against. Everything else —
 * and any golf item whose round predates the itinerary — is counted off the
 * trip's start date, which is how the itinerary has always dated itself.
 */
export function dateOf(
  item: ItineraryItem,
  startDate: string | null,
  roundDates: RoundDates,
): string | null {
  if (item.kind === 'golf') {
    const scheduled = roundDates.get(item.id)
    if (scheduled) return scheduled
  }
  return dateForDay(startDate, item.dayIndex)
}

/**
 * Everything still ahead of us, in order.
 *
 * `itemState` alone is not enough here, and the gap is worth spelling out.
 * An item with no clock — a stay, a journey — reads as `now` for the whole
 * of its day and never becomes `past` until the day ends. That is right for
 * the itinerary, which dims a day as it goes. It is wrong for this: at nine
 * in the evening, with the round played and the guesthouse booked, the card
 * would still be offering this morning's drive.
 *
 * So the running order is treated as running: **anything sitting before
 * something that has finished is behind us too.** A trip moves forwards, and
 * the last thing to have visibly happened is the watermark.
 */
export function stillToCome(
  ordered: readonly ItineraryItem[],
  startDate: string | null,
  roundDates: RoundDates,
  now: Date,
): ItineraryItem[] {
  const states = ordered.map(i => itemState(i, dateOf(i, startDate, roundDates), now))
  const lastDone = states.lastIndexOf('past')
  return ordered.filter((_, i) => i > lastDone && states[i] !== 'past')
}

/** Whether the day this falls on has come round yet. Today counts. */
export function dayArrived(date: string | null, now: Date): boolean {
  const day = dayNumber(date)
  if (day === null) return false
  return day <= Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * The next thing on the trip, or null once there is nothing left.
 *
 * The rule, in order:
 *
 *   1. Anything already behind us is out.
 *   2. The first remaining item whose **day has arrived** takes the card —
 *      the drive you are about to do beats Thursday's round. **Activities
 *      are not eligible for this**: see below.
 *   3. Otherwise the next **golf** item leads, because it is the only kind
 *      that can carry a countdown.
 *   4. Failing even that — a trip of nothing but future journeys, which the
 *      creation form does not allow but a hand-edited trip could be — the
 *      first remaining item, without a countdown. Better than a blank card.
 *
 * Rule 2 skips activities on purpose. A stay or a journey on today's date is
 * genuinely the next thing you do, and there is nothing else that day to
 * outrank it. A dinner is not: it sits in the same day as a round, usually
 * after it, and letting it take the card would mean the morning of a golf
 * trip opens with a restaurant. `nextActivity` is how it gets said instead.
 *
 * Note that this is the *only* thing keeping an activity off the card. It is
 * not covered by the golf-only countdown rule — an activity can carry a
 * clock time, which is exactly why it needed excluding by name.
 *
 * With `now` null nothing has arrived yet and nothing is past, so this
 * returns the first golf item: a stable answer for the server to render,
 * corrected on hydration once the browser's clock is known.
 */
export function upNext(
  items: readonly ItineraryItem[],
  startDate: string | null,
  roundDates: RoundDates,
  courseNames: Record<string, string>,
  now: Date | null,
): UpNext | null {
  const ordered = orderedItems(items)
  const remaining = now ? stillToCome(ordered, startDate, roundDates, now) : ordered
  if (remaining.length === 0) return null

  const arrived = now
    ? remaining.find(i =>
        i.kind !== 'activity' && dayArrived(dateOf(i, startDate, roundDates), now))
    : undefined

  const item = arrived
    ?? remaining.find(i => i.kind === 'golf')
    // Last resort, and the one place an activity can lead: a trip with no
    // golf left at all. A card saying "Dinner, 7:30" beats a blank one.
    ?? remaining[0]

  return describeUpNext(item, startDate, roundDates, courseNames)
}

/**
 * The next activity still to come, for the quiet line under the card.
 *
 * Separate from `upNext` rather than folded into it, because it answers a
 * different question: `upNext` is "what is the trip doing next", this is
 * "and what else is booked". Both are read from the same remaining list, so
 * they cannot disagree about what has already happened.
 *
 * Returns null when the next activity **is** the headline — a trip with no
 * golf left falls through to it, and the same dinner named twice on one card
 * reads as a bug rather than as emphasis.
 *
 * **And never one from beyond the headline's own day.** The line answers
 * "and what else is booked around what is next", so tonight's dinner under
 * tomorrow's golf is context and Saturday's dinner under Thursday's golf is
 * the future — it gets its mention when its day is the one being described.
 * Without this the card carried whatever the trip's first booking happened
 * to be, days ahead of anything else on it.
 */
export function nextActivity(
  items: readonly ItineraryItem[],
  startDate: string | null,
  roundDates: RoundDates,
  courseNames: Record<string, string>,
  now: Date | null,
  headline: UpNext | null,
): UpNext | null {
  const ordered = orderedItems(items)
  const remaining = now ? stillToCome(ordered, startDate, roundDates, now) : ordered

  const item = remaining.find(i => i.kind === 'activity')
  if (!item || item.id === headline?.item.id) return null

  const date = dateOf(item, startDate, roundDates)
  if (headline?.date && date && date > headline.date) return null

  return describeUpNext(item, startDate, roundDates, courseNames)
}

/** One item, dressed for the card. */
export function describeUpNext(
  item: ItineraryItem,
  startDate: string | null,
  roundDates: RoundDates,
  courseNames: Record<string, string>,
): UpNext {
  const date = dateOf(item, startDate, roundDates)
  const { title, detail } = describeItem(item, courseNames[item.courseId ?? ''])
  const golf = item.kind === 'golf'
  const count = item.teeCount ?? 1

  return {
    item,
    title,
    detail,
    date,
    startsAt: golf ? momentOf(date, item.teeTime) : null,
    groups: golf ? count : null,
    teeTime: golf ? describeTime(item.teeTime) : '',
  }
}

/**
 * A date and a wall-clock time as one moment, in the reader's own timezone.
 *
 * Deliberately **not** UTC. Everywhere else in this codebase a date is parsed
 * as UTC so that the 17th is the 17th wherever you read it — but a countdown
 * is the opposite question. "Four hours until you tee off" has to be four
 * hours on the phone in your pocket, and the local constructor is the only
 * thing that gives that.
 */
export function momentOf(date: string | null, time: string | null | undefined): Date | null {
  if (!date || !time) return null
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  if (!y || !m || !d || !Number.isFinite(h)) return null
  return new Date(y, m - 1, d, h, min || 0, 0, 0)
}

/**
 * "3 days", "4 hr 20 min", "35 min" — how long until it starts.
 *
 * Blank once the moment has passed: a countdown that has run out has nothing
 * left to say, and the item is about to stop being next anyway.
 */
export function describeCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'any minute'

  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60

  if (days > 0) {
    const d = `${days} ${days === 1 ? 'day' : 'days'}`
    return hours > 0 ? `${d} ${hours} hr` : d
  }
  if (hours > 0) return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`
  return `${minutes} min`
}

/**
 * "3 groups from 9:20 am" — plainly, and about the trip rather than the
 * player.
 *
 * **Never a personal tee time.** Nothing on the platform records who is in
 * which group, so the card says how many groups go off and when the first
 * one does. Anything narrower would be invented.
 */
export function describeGroups(groups: number | null, teeTime: string): string {
  if (!groups || !teeTime) return ''
  const noun = groups === 1 ? 'group' : 'groups'
  return `${groups} ${noun} from ${teeTime}`
}
