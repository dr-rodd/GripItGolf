// Irish wall-clock time — the only copy.
//
// A time a person types ("8:00 pm on Thursday") means Irish time, whatever
// clock the server or the phone keeps: Vercel runs on UTC, and Ireland is
// UTC+0 in winter and UTC+1 in summer. Anything that must agree between the
// server and every phone about *when* — a tee sheet opening, first — turns
// the wall clock into an instant here, through the time zone database the
// platform already carries (`Intl`), never a hard-coded offset.
//
// Pure. No I/O.

export const IRISH_TIME_ZONE = 'Europe/Dublin'

/** Minutes the zone is ahead of UTC at this instant. */
function offsetMins(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((asUtc - Math.floor(instant / 60_000) * 60_000) / 60_000)
}

/**
 * The instant a date and a time on Irish clocks names — "2026-10-30",
 * "20:00" → 20:00 UTC in winter, 19:00 UTC in summer. Null for anything
 * that is not a date and a time.
 */
export function irishInstant(date: string, time: string, timeZone = IRISH_TIME_ZONE): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.slice(0, 5))
  if (!d || !t) return null
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
  // Guess with the offset at the wall time read as UTC, then once more with
  // the offset at that guess — which settles the hour either side of a
  // clock change.
  const first = wall - offsetMins(wall, timeZone) * 60_000
  return new Date(wall - offsetMins(first, timeZone) * 60_000)
}

/** A date some days before another, "2026-10-30" less 3 → "2026-10-27". */
export function daysBefore(date: string, days: number): string | null {
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  return new Date(ms - days * 86_400_000).toISOString().slice(0, 10)
}
