// Sunrise and sunset for a tee sheet — the only copy (Ross, 17 Nov 2026).
//
// Worked out here, never asked of an outside service: the NOAA solar
// calculator's formulas (the sun's centre 0.833° below the horizon, which
// allows for refraction and the sun's own size), good to a minute or so
// anywhere a golf course is. The answer is an Irish wall-clock time
// (lib/irishTime.ts's zone), since every tee time on the platform is one.
//
// Where: the course's latitude and longitude (courses.latitude/longitude,
// migration 026). A course without them is never refused — the sun is then
// worked out for Greenwich (Ross: "default to GMT if no other time zone or
// location is available"), and the answer says so.
//
// The grid (M9): a batch that starts at sunrise starts on the first tee time
// at or after it, counted back from the next full hour by whole intervals —
// sunrise 06:42 at ten minutes is 06:50; at eight, 06:44. A batch that ends
// at sunset ends on its last tee time at or before sunset less an offset —
// four and a half hours for a competition, an hour for casual golf.
//
// Pure. No I/O.

import { IRISH_TIME_ZONE } from './irishTime'

/** Where the sun is worked out for when a course has no location (Ross: GMT). */
export const FALLBACK_PLACE = { lat: 51.4779, lng: -0.0015, name: 'Greenwich' } as const

/** A competition's last tee time comes this long before sunset unless set otherwise. */
export const COMP_LAST_TEE_BEFORE_SUNSET_MINS = 270
/** Casual golf's last tee time, an hour before sunset — for casual tee sheets (a pending concept). */
export const CASUAL_LAST_TEE_BEFORE_SUNSET_MINS = 60

export interface Place { lat: number; lng: number }

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/**
 * Sunrise and sunset on a day, as instants — null for each where the sun
 * does not rise or set (never at a golf course, but never a NaN either).
 */
export function sunInstants(date: string, place: Place): { sunrise: Date | null; sunset: Date | null } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return { sunrise: null, sunset: null }
  const midnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Two passes: the second reads the sun's place at the event's own time.
  const at = (guessMins: number, rising: boolean): number | null => {
    let mins = guessMins
    for (let pass = 0; pass < 2; pass++) {
      const jd = (midnight + mins * 60_000) / 86_400_000 + 2440587.5
      const t = (jd - 2451545) / 36525
      const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
      const mAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t)
      const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
      const c = Math.sin(rad(mAnom)) * (1.914602 - t * (0.004817 + 0.000014 * t))
        + Math.sin(rad(2 * mAnom)) * (0.019993 - 0.000101 * t) + Math.sin(rad(3 * mAnom)) * 0.000289
      const omega = 125.04 - 1934.136 * t
      const appLong = l0 + c - 0.00569 - 0.00478 * Math.sin(rad(omega))
      const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
      const obliq = meanObliq + 0.00256 * Math.cos(rad(omega))
      const decl = Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong)))
      const y = Math.tan(rad(obliq / 2)) ** 2
      const eqTime = 4 * deg(y * Math.sin(2 * rad(l0)) - 2 * e * Math.sin(rad(mAnom))
        + 4 * e * y * Math.sin(rad(mAnom)) * Math.cos(2 * rad(l0))
        - 0.5 * y * y * Math.sin(4 * rad(l0)) - 1.25 * e * e * Math.sin(2 * rad(mAnom)))
      const cosHa = Math.cos(rad(90.833)) / (Math.cos(rad(place.lat)) * Math.cos(decl)) - Math.tan(rad(place.lat)) * Math.tan(decl)
      if (cosHa > 1 || cosHa < -1) return null
      const ha = deg(Math.acos(cosHa))
      const noon = 720 - 4 * place.lng - eqTime
      mins = rising ? noon - 4 * ha : noon + 4 * ha
    }
    return midnight + mins * 60_000
  }
  const noonGuess = 720 - 4 * place.lng
  const rise = at(noonGuess - 360, true)
  const set = at(noonGuess + 360, false)
  return { sunrise: rise === null ? null : new Date(rise), sunset: set === null ? null : new Date(set) }
}

/** An instant as an Irish wall clock, "06:42", to the nearest minute. */
export function irishClock(at: Date, timeZone = IRISH_TIME_ZONE): string {
  const rounded = new Date(Math.round(at.getTime() / 60_000) * 60_000)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(rounded)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return `${get('hour')}:${get('minute')}`
}

export interface SunDay {
  /** Irish wall-clock times, "06:42" — null where the sun does not rise or set. */
  sunrise: string | null
  sunset: string | null
  /** False when the course had no location and Greenwich stood in. */
  located: boolean
}

/** A course's sunrise and sunset on a day, Irish time — Greenwich's when it has no location. */
export function sunDay(date: string, place: Partial<Place> | null | undefined): SunDay {
  const located = !!place && Number.isFinite(place.lat) && Number.isFinite(place.lng) && place.lat !== null && place.lng !== null
  const at = located ? { lat: Number(place!.lat), lng: Number(place!.lng) } : FALLBACK_PLACE
  const s = sunInstants(date, at)
  return { sunrise: s.sunrise ? irishClock(s.sunrise) : null, sunset: s.sunset ? irishClock(s.sunset) : null, located }
}

const mins = (clock: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

/**
 * A sunrise start (M9): the first tee time at or after sunrise on the grid
 * counted back from the next full hour by whole intervals. Null for a bad
 * clock or interval.
 */
export function sunriseTee(sunrise: string, interval: number): string | null {
  const s = mins(sunrise)
  if (s === null || !Number.isInteger(interval) || interval < 1) return null
  const anchor = Math.ceil(s / 60) * 60
  return clock(anchor - Math.floor((anchor - s) / interval) * interval)
}

/**
 * How many tee times a batch from `start` every `interval` minutes holds
 * when its last must be at or before `limit` ("sunset less the offset") —
 * 0 when not even the first fits.
 */
export function countUntil(start: string, interval: number, limit: string): number {
  const a = mins(start), b = mins(limit)
  if (a === null || b === null || !Number.isInteger(interval) || interval < 1 || b < a) return 0
  return Math.floor((b - a) / interval) + 1
}

/** A clock less some minutes, "20:15" − 270 → "15:45"; null before midnight. */
export function clockLess(at: string, minutes: number): string | null {
  const a = mins(at)
  if (a === null || !Number.isFinite(minutes) || a - minutes < 0) return null
  return clock(a - Math.round(minutes))
}
