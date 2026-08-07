// The weather at a course: what MET Norway said, and how to read it.
//
// Wind is the whole point. A links course is chosen for its exposure, and the
// three things somebody wants the night before are how hard it is blowing,
// from where, and whether it will rain. Temperature is the fourth.
//
// Source is MET Norway's Locationforecast 2.0, the `complete` product — not
// `compact`, which carries neither `wind_speed_of_gust` nor
// `probability_of_precipitation` and so is missing two of the four.
//
// **Pure. No I/O.** Everything here is a decision; the fetching, the caching
// and the writing are `app/api/weather/route.ts`'s job. Same division as
// `lib/staleLive.ts` against `app/api/cleanup/route.ts` — the module decides,
// the route does.

// ─── Terms MET sets, which are not ours to soften ──────────────

/**
 * Required beside every reading.
 *
 * The data is CC BY 4.0 / NLOD 2.0 — free to use commercially, and free is
 * conditional on the credit. Own icons and own styling are fine; an
 * uncredited feed is a licence breach, not a style choice.
 */
export const MET_ATTRIBUTION = 'Data from MET Norway'

/** Where that credit points. */
export const MET_LICENCE_URL = 'https://api.met.no/doc/License'

/**
 * How far ahead MET's model runs. Roughly ten days.
 *
 * Past it there is no forecast at all, which is a different thing from a
 * forecast of nothing — see `pickAt`.
 */
export const FORECAST_DAYS = 10

/**
 * How long the hourly resolution lasts, in hours.
 *
 * MET is hourly for the first two to three days and six-hourly after that.
 * This is the honest boundary for sending somebody to yr.no's *hourly* table:
 * past it that page is six-hour blocks in an hourly-shaped layout, which
 * reads as a broken page rather than a coarse forecast.
 *
 * Deliberately 48 rather than the week that was first asked for. The request
 * was "hourly, maybe daily if more than a week out"; the data does not
 * support the week, and a page of blanks is worse than the daily table.
 */
export const HOURLY_WITHIN_HOURS = 48

// ─── What a reading is ─────────────────────────────────────────

/**
 * The seven conditions this app draws.
 *
 * MET publishes about fifty `symbol_code` values. Fifty icons would be fifty
 * things to draw and forty-three distinctions a golfer does not act on — the
 * difference between `lightrainshowers_day` and `rainshowers_day` changes
 * nothing about whether to bring a coat.
 *
 * The seven that survive are the ones that change a decision. Two of them are
 * load-bearing and must never be folded into `rain`:
 *
 *   `thunder`  lightning is the one forecast condition that CLEARS a course.
 *              Hidden under a rain cloud it is the worst thing this could do.
 *   `snow`     a February trip that is not going to happen.
 *
 * And `clearnight` is separate so the "Right now" slot does not put a sun in
 * the sky at ten at night, which reads as the whole block being broken.
 */
export type SymbolKey =
  | 'clear' | 'clearnight' | 'partly' | 'cloud' | 'rain' | 'snow' | 'thunder'

/** One moment in the forecast. */
export type WeatherHour = {
  /** The instant this covers, ISO 8601 in UTC as MET writes it. */
  at: string
  /**
   * How long this entry actually covers — one hour or six.
   *
   * MET is hourly for the first two or three days and six-hourly after. The
   * span is kept because it changes what the reading means: "20% chance of
   * rain" over six hours is not the same claim as over one, and a tee time
   * eight days out is being answered by a six-hour block whatever the label
   * above it says.
   */
  spanHours: 1 | 6
  tempC: number | null
  /** Metres per second. The API's own unit — nothing here converts. */
  windMs: number | null
  /**
   * The direction the wind comes **from**, in degrees.
   *
   * Which is how golfers speak — "into a south-westerly" — and the opposite
   * of where an arrow should point. See `arrowDeg`.
   */
  windFromDeg: number | null
  gustMs: number | null
  /** MET's raw code, kept so `symbolKey` is the only thing interpreting it. */
  symbol: string | null
  /**
   * Percentage, 0–100 — or null when MET did not say.
   *
   * **Null is not zero.** "No chance of rain" and "we do not know" are
   * different sentences and must never print the same one. Same discipline as
   * the nullable `claimed` in `lib/roster.ts`.
   */
  rainChance: number | null
  rainMm: number | null
}

export type ParseResult = {
  hours: WeatherHour[]
  /** Set when the body could not be read. Never thrown — callers render it. */
  error: string | null
}

// ─── Coordinates ───────────────────────────────────────────────

/**
 * A coordinate as MET will accept it: four decimal places, truncated.
 *
 * More than four and the request is refused outright, so this is a hard
 * requirement rather than tidiness. Truncated rather than rounded because
 * rounding 51.99999 gives 52.0000 — a fifth digit's worth of movement, which
 * is the thing being avoided.
 */
export function truncCoord(n: number): number {
  const scaled = n * 10_000
  // Binary floating point cannot hold most decimals exactly. `-9.8578 *
  // 10000` is -98577.99999999999, and truncating that gives -9.8577 — a
  // ten-thousandth of movement in the value this function exists to hold
  // still. So a scaled value that is an integer bar the representation
  // noise is snapped to it, and only a genuine fraction is truncated.
  const noise = Math.abs(scaled - Math.round(scaled)) < 1e-6
  return (noise ? Math.round(scaled) : Math.trunc(scaled)) / 10_000
}

/**
 * The forecast URL for a point.
 *
 * Scheme, host and product fixed; only two numbers interpolated. The rule
 * `lib/places.ts` sets for `mapsUrl` — an href is one of the few places a
 * string becomes executable — applies just as hard to a URL the server is
 * about to fetch.
 */
export function metUrl(lat: number, lon: number): string {
  const la = truncCoord(lat)
  const lo = truncCoord(lon)
  return 'https://api.met.no/weatherapi/locationforecast/2.0/complete'
    + `?lat=${la}&lon=${lo}`
}

/**
 * Who is asking.
 *
 * MET requires a User-Agent naming the application and a way to reach whoever
 * runs it; without one, requests are throttled and then refused. Overridable
 * by `MET_USER_AGENT` so the contact can change without a deploy of this
 * file — the caller passes it in, because reading the environment is I/O.
 */
export function metUserAgent(override?: string | null): string {
  const set = String(override ?? '').trim()
  return set || 'GreenDotGolf/1.0 (+https://greendot.live)'
}

// ─── Reading the body ──────────────────────────────────────────

const asNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null

type Bag = Record<string, unknown>
const bag = (v: unknown): Bag => (v && typeof v === 'object' ? v as Bag : {})

/**
 * MET's response, as rows this app can read.
 *
 * Never throws and never assumes a field is there. A forecast is the least
 * important thing on either screen it appears on, and a body that changed
 * shape must not be able to take a trip hub down with it — so a bad parse is
 * an empty list and a sentence, which the caller renders.
 *
 * **The precipitation fallback is the part that matters.** `next_1_hours`
 * stops existing about two to three days out; past that only `next_6_hours`
 * is there. A parser that reads the first and stops returns null for every
 * tee time beyond day three — which is most of the time a trip is being
 * planned, and exactly when somebody is looking. `wind_speed_of_gust` thins
 * out the same way, and absent means absent, never zero.
 */
export function parseForecast(json: unknown): ParseResult {
  const series = bag(bag(json).properties).timeseries
  if (!Array.isArray(series)) {
    return { hours: [], error: 'The forecast could not be read.' }
  }

  const hours: WeatherHour[] = []
  for (const raw of series) {
    const entry = bag(raw)
    const at = asString(entry.time)
    if (!at) continue

    const data = bag(entry.data)
    const instant = bag(bag(data.instant).details)

    // One hour if it is there, otherwise six. The span is recorded rather
    // than inferred later, because by then the evidence is gone.
    const oneHour = bag(data.next_1_hours)
    const sixHour = bag(data.next_6_hours)
    const window = Object.keys(oneHour).length > 0 ? oneHour : sixHour
    const spanHours: 1 | 6 = window === oneHour ? 1 : 6
    const details = bag(window.details)

    hours.push({
      at,
      spanHours,
      tempC:       asNumber(instant.air_temperature),
      windMs:      asNumber(instant.wind_speed),
      windFromDeg: asNumber(instant.wind_from_direction),
      gustMs:      asNumber(instant.wind_speed_of_gust),
      symbol:      asString(bag(window.summary).symbol_code),
      rainChance:  asNumber(details.probability_of_precipitation),
      rainMm:      asNumber(details.precipitation_amount),
    })
  }

  if (hours.length === 0) {
    return { hours: [], error: 'The forecast arrived empty.' }
  }
  return { hours, error: null }
}

/**
 * The entry covering a moment, or null if the forecast does not reach it.
 *
 * **Null rather than the nearest.** A round ten days out must not quietly
 * show today's wind — a reading with the wrong day behind it is worse than no
 * reading, because nothing on the screen says which one it is.
 *
 * Compared as instants, never as strings. MET writes UTC (`…T08:00:00Z`) and
 * `momentOf` in `lib/upNext.ts` deliberately builds a tee time in local clock
 * time; both are `Date`s, so comparing numbers is right and comparing text is
 * silently wrong for half the year in Ireland.
 */
export function pickAt(hours: WeatherHour[], when: Date): WeatherHour | null {
  const target = when.getTime()
  if (!Number.isFinite(target)) return null

  let best: WeatherHour | null = null
  for (const h of hours) {
    const start = Date.parse(h.at)
    if (!Number.isFinite(start)) continue
    if (start > target) break
    // Covered only if the moment falls inside this entry's own window.
    if (target < start + h.spanHours * 3_600_000) best = h
  }
  return best
}

// ─── Direction ─────────────────────────────────────────────────

const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const

/**
 * Degrees to a compass point, sixteen of them.
 *
 * North spans the wrap — 348.75° through 11.25° is all N — which is the only
 * part of this worth testing hard.
 */
export function compass(deg: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return ''
  const wrapped = ((deg % 360) + 360) % 360
  return POINTS[Math.round(wrapped / 22.5) % 16]
}

/**
 * Which way to point the arrow, given the direction the wind is **from**.
 *
 * A wind from 315° — a north-westerly — blows *towards* 135°. Rotate the
 * glyph by `wind_from_direction` and it points exactly backwards, at the
 * weather rather than with it.
 *
 * This is written into half the weather widgets on the internet and it looks
 * entirely plausible on screen, which is why it is a named function with a
 * test rather than an inline `+ 180` somebody later tidies away.
 */
export function arrowDeg(fromDeg: number | null): number | null {
  if (fromDeg == null || !Number.isFinite(fromDeg)) return null
  return (((fromDeg + 180) % 360) + 360) % 360
}

// ─── Conditions ────────────────────────────────────────────────

/**
 * One of MET's fifty codes, as one of the seven this app draws.
 *
 * Order matters: thunder is tested first because every thundery code also
 * contains the word for its precipitation — `rainandthunder` is thunder, not
 * rain, and a course is cleared for the first and not the second.
 *
 * An unrecognised code falls to `cloud`, which is the one honest default: it
 * claims neither sun nor rain. A code MET adds later shows a cloud rather
 * than nothing, and the test holds every published code against this so the
 * default stays a safety net rather than a hiding place.
 */
export function symbolKey(code: string | null | undefined): SymbolKey {
  const c = String(code ?? '').toLowerCase()
  if (!c) return 'cloud'

  if (c.includes('thunder')) return 'thunder'
  if (c.includes('snow')) return 'snow'
  if (c.includes('sleet') || c.includes('rain') || c.includes('drizzle')) return 'rain'
  if (c.startsWith('partlycloudy')) return 'partly'
  if (c.startsWith('clearsky') || c.startsWith('fair')) {
    return c.endsWith('_night') ? 'clearnight' : 'clear'
  }
  return 'cloud'
}

const SYMBOL_WORDS: Record<SymbolKey, string> = {
  clear:      'Clear',
  clearnight: 'Clear',
  partly:     'Partly cloudy',
  cloud:      'Cloudy',
  rain:       'Rain',
  snow:       'Snow',
  thunder:    'Thunder',
}

/** The conditions in words, for the line beside the icon. */
export function describeSymbol(code: string | null | undefined): string {
  return SYMBOL_WORDS[symbolKey(code)]
}

// ─── Wording ───────────────────────────────────────────────────

/** Wind as it would be said out loud: "NW 8, gusting 14". Units are added by the caller. */
export function describeWind(hour: WeatherHour): string {
  if (hour.windMs == null) return ''
  const point = compass(hour.windFromDeg)
  const speed = Math.round(hour.windMs)
  const head = point ? `${point} ${speed}` : String(speed)
  // Absent means absent. "Gusting —" is worse than no clause at all, and a
  // gust below the mean is noise rather than news.
  if (hour.gustMs == null || Math.round(hour.gustMs) <= speed) return head
  return `${head}, gusting ${Math.round(hour.gustMs)}`
}

/**
 * Rain as a percentage, or nothing at all.
 *
 * Nothing, not "0%", when MET did not say — the empty string is what the
 * caller drops. A real zero does print, because "no chance of rain" is worth
 * reading on a golf trip.
 */
export function describeRain(chance: number | null): string {
  if (chance == null) return ''
  return `${Math.round(chance)}% rain`
}

// ─── The way out to yr.no ──────────────────────────────────────

/**
 * yr.no's own page for a point, hourly or daily.
 *
 * Hourly while the data is hourly, daily after — see `HOURLY_WITHIN_HOURS`.
 * Sending somebody to the hourly table for a round eight days out gives them
 * a page of six-hour blocks in an hourly layout.
 *
 * Same rule as `lib/places.ts`: scheme and host fixed, only numbers
 * interpolated, nothing a user typed anywhere near it.
 */
export function yrUrl(
  lat: number, lon: number, when: Date | null, now: Date,
): string {
  const table = hourlyTable(when, now) ? 'hourly-table' : 'daily-table'
  return `https://www.yr.no/en/forecast/${table}/${truncCoord(lat)},${truncCoord(lon)}`
}

/** Whether a moment is close enough for the hourly table to hold real hours. */
export function hourlyTable(when: Date | null, now: Date): boolean {
  if (!when || !Number.isFinite(when.getTime())) return true
  const hoursAway = (when.getTime() - now.getTime()) / 3_600_000
  return hoursAway <= HOURLY_WITHIN_HOURS
}

/** Whether a moment is beyond the model entirely — nothing to show, at any resolution. */
export function beyondForecast(when: Date | null, now: Date): boolean {
  if (!when || !Number.isFinite(when.getTime())) return false
  return when.getTime() - now.getTime() > FORECAST_DAYS * 86_400_000
}

// ─── When to go back to MET ────────────────────────────────────

/** Fallback time-to-live when MET sent no `Expires` we could read. */
export const DEFAULT_TTL_MINUTES = 60

/** How long to leave MET alone after a failed attempt. */
export const BACKOFF_MINUTES = 15

/**
 * Whether a cached forecast still stands.
 *
 * MET's terms ask that the `Expires` header be respected and that nothing
 * re-requests faster than the data changes. This is that rule, in one place,
 * so the route cannot quietly disagree with it.
 */
export function isFresh(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false
  const until = Date.parse(expiresAt)
  if (!Number.isFinite(until)) return false
  return until > now.getTime()
}

/** Whether enough time has passed since a failure to try MET again. */
export function backoffOver(failedAt: string | null, now: Date): boolean {
  if (!failedAt) return true
  const since = Date.parse(failedAt)
  if (!Number.isFinite(since)) return true
  return now.getTime() - since >= BACKOFF_MINUTES * 60_000
}

/**
 * How old a reading is, in words — or nothing while it is still current.
 *
 * Only said once a forecast is old enough to be worth doubting. A reading
 * served from a stale cache because MET is down is far better than none, and
 * saying so is what keeps it honest rather than making it a lie.
 */
export function describeAge(fetchedAt: string | null, now: Date): string {
  if (!fetchedAt) return ''
  const then = Date.parse(fetchedAt)
  if (!Number.isFinite(then)) return ''
  const hours = Math.floor((now.getTime() - then) / 3_600_000)
  if (hours < 2) return ''
  if (hours < 24) return `Updated ${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`
}
