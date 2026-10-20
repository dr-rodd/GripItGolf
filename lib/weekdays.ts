// The days of the week, Sunday first — the 0–6 that JavaScript's
// `getUTCDay` returns and that a league's weekly repeat and its Golf
// Ireland day rule both store. The only copy of the names.

export const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

/** The weekday (0 = Sunday) of a `YYYY-MM-DD` date, or null when it is not one. */
export function weekdayOf(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const t = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(t)) return null
  // Date.parse rolls 2026-02-30 over into March; a date that does not
  // read back as itself was never a date.
  if (new Date(t).toISOString().slice(0, 10) !== date) return null
  return new Date(t).getUTCDay()
}
