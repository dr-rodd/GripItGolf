// Travel and accommodation, read as a trip rather than as a running order.
//
// The itinerary is day-by-day on purpose — a day with nowhere to sleep on it
// is a day missing something, so a four-night stay is entered once and stored
// as four rows, one per night (`addStay` in lib/itinerary.ts). That is right
// for the running order and wrong for a section whose whole job is "where are
// we staying and how do we get there": four identical lines saying the same
// guesthouse is four times the type and none of the information.
//
// So this collapses consecutive nights in the same place back into the one
// booking the organiser actually made. The itinerary is untouched and still
// prints every night.
//
// Pure. No I/O.

import { type ItineraryItem, type TravelMode, describeDuration, dateForDay, describeDay } from './itinerary'

/** One booking: a place, and the run of nights spent there. */
export type StayRun = {
  /** As entered — the organiser's own words, for display. */
  name: string
  /** Day index of the first night. */
  fromDay: number
  /** How many consecutive nights. */
  nights: number
}

/** One journey, in the order it happens. */
export type TravelLeg = {
  id: string
  dayIndex: number
  mode: TravelMode | null
  from: string
  to: string
  /** "4 hr 30", or blank. */
  duration: string
}

/** Trimmed and case-folded, so "The Shandon" and "the shandon " are one place. */
function placeKey(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase()
}

/**
 * Consecutive nights in one place, folded into single bookings.
 *
 * Consecutive means *both* the same name and the very next day. Two separate
 * nights in the same guesthouse either side of a night somewhere else are two
 * bookings, and reading them as one four-night stay would be a lie about the
 * middle night.
 */
export function stayRuns(items: readonly ItineraryItem[]): StayRun[] {
  const stays = items
    .filter(i => i.kind === 'stay' && placeKey(i.stayName))
    .sort((a, b) => a.dayIndex - b.dayIndex || a.position - b.position)

  const runs: StayRun[] = []
  for (const stay of stays) {
    const last = runs[runs.length - 1]
    const key = placeKey(stay.stayName)
    if (last && placeKey(last.name) === key && stay.dayIndex === last.fromDay + last.nights) {
      last.nights++
      continue
    }
    runs.push({ name: (stay.stayName ?? '').trim(), fromDay: stay.dayIndex, nights: 1 })
  }
  return runs
}

/** Every journey on the trip, in order. */
export function travelLegs(items: readonly ItineraryItem[]): TravelLeg[] {
  return items
    .filter(i => i.kind === 'travel')
    .sort((a, b) => a.dayIndex - b.dayIndex || a.position - b.position)
    .map(i => ({
      id: i.id,
      dayIndex: i.dayIndex,
      mode: i.travelMode ?? null,
      from: (i.fromPlace ?? '').trim(),
      to: (i.toPlace ?? '').trim(),
      duration: describeDuration(i.durationMins),
    }))
}

/**
 * "Friday 17 April · 4 nights" — when a booking runs, in words.
 *
 * The night count is dropped when there is one of them: "1 night" beside a
 * single date is a sentence saying nothing.
 */
export function describeStayRun(run: StayRun, startDate: string | null): string {
  const day = describeDay(dateForDay(startDate, run.fromDay), run.fromDay)
  if (run.nights <= 1) return day
  return `${day} · ${run.nights} nights`
}

/** "Dublin to Carne", or whichever end of it is known. */
export function describeLeg(leg: TravelLeg): string {
  if (leg.from && leg.to) return `${leg.from} to ${leg.to}`
  return leg.to || leg.from || 'Journey'
}
