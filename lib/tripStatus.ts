// What state a trip is in, worked out from what is already stored.
//
// There is no status field that means what the admin overview wants to show.
// `trips.status` is the old Donegal Masters lifecycle, `setup_status` says
// whether scoring has been opened, and the dates say when it is happening.
// The useful answer is a combination, so it is derived here rather than
// guessed at each call site.
//
// Pure — takes plain fields, does no I/O, and takes "today" as an argument so
// it can be tested without waiting for a Tuesday.

export type TripStateKey = 'draft' | 'upcoming' | 'active' | 'completed'

export type TripState = {
  key: TripStateKey
  label: string
  /** True while the trip is something anyone is still doing. */
  open: boolean
}

export type TripDates = {
  setup_status?: string | null
  start_date?: string | null
  end_date?: string | null
}

const STATES: Record<TripStateKey, TripState> = {
  draft:     { key: 'draft',     label: 'In setup',  open: true },
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
 * A trip still in setup is in setup whatever its dates say — the organiser has
 * not opened scoring, so nobody is playing it yet. Trips created before the
 * lifecycle column existed have no setup_status and were all marked live, so
 * a missing value reads as live.
 */
export function tripState(trip: TripDates, today: string): TripState {
  if ((trip.setup_status ?? 'live') === 'draft') return STATES.draft

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
