// What state a trip is in, worked out from what is already stored.
//
// There is no status field that means what the admin overview wants to show.
// `trips.status` is the old Donegal Masters lifecycle and `setup_status` was
// the newer one, which said whether scoring had been opened. Neither is
// written any more: a trip is open from the moment it exists. The dates are
// what is left, and they are what this answers from.
//
// Pure — takes plain fields, does no I/O, and takes "today" as an argument so
// it can be tested without waiting for a Tuesday.

export type TripStateKey = 'upcoming' | 'active' | 'completed'

export type TripState = {
  key: TripStateKey
  label: string
  /** True while the trip is something anyone is still doing. */
  open: boolean
}

export type TripDates = {
  start_date?: string | null
  end_date?: string | null
}

const STATES: Record<TripStateKey, TripState> = {
  upcoming:  { key: 'upcoming',  label: 'Upcoming',  open: true },
  active:    { key: 'active',    label: 'Playing',   open: true },
  completed: { key: 'completed', label: 'Completed', open: false },
}

/** A date-only string as a day number, so comparisons ignore the clock. */
function day(d: string | null | undefined): number | null {
  if (!d) return null
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number)
  if (!y || !m || !dd) return null
  return Date.UTC(y, m - 1, dd)
}

/**
 * Where a trip stands.
 *
 * `today` is a plain date string ("2026-07-30"), so a trip that ends today is
 * still being played rather than finishing at midnight in some other timezone.
 *
 * Read from the dates alone. A trip used to be able to sit in a "draft" state
 * that outranked them — the organiser had not pressed Finalise, so nobody was
 * playing it whatever the calendar said. There is no such state now: a trip is
 * open from the moment it exists, and `setup_status` is a column nothing
 * writes. A trip left holding "draft" from before reads by its dates like
 * every other one.
 */
export function tripState(trip: TripDates, today: string): TripState {
  const now   = day(today)
  const start = day(trip.start_date)
  const end   = day(trip.end_date)

  // No dates at all: it is live and open, and there is nothing to say it isn't
  if (now === null) return STATES.active

  if (end !== null && end < now) return STATES.completed
  if (start !== null && start > now) return STATES.upcoming
  return STATES.active
}

/** Today as a plain date string, in the timezone the code is running in. */
export function todayString(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
