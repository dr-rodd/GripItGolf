import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  metUrl, metUserAgent, parseForecast, isFresh, backoffOver, truncCoord,
  describeWind, describeRain, describeSymbol,
  DEFAULT_TTL_MINUTES, MET_ATTRIBUTION, type WeatherHour,
} from '@/lib/weather'

// The forecast for a course, and the only thing in this app that talks to
// anybody else's server.
//
// `lib/weather.ts` decides everything — what a body means, whether a cached
// row still stands, when MET may be asked again. This file fetches, reads and
// writes, and nothing more. Same division as `lib/staleLive.ts` against
// `app/api/cleanup/route.ts`.
//
// ── Two things about the URL, both deliberate ──
//
// **It takes a course id and never coordinates.** A `?lat=&lon=` parameter
// would make this an open proxy to api.met.no under our User-Agent, which is
// how that User-Agent gets blocked for somebody else's scraping. The caller
// names a course; the server supplies the point. Same rule `lib/places.ts`
// states for `mapsUrl` — only vetted values reach an outbound URL.
//
// **The tee time is not in it either.** `?at=2026-08-13T09:20` would give the
// CDN a different URL per reader per minute, and the cache below would never
// be hit. The whole forecast comes back and `pickAt` chooses the hour on the
// client, so one response serves both slots on the round page and the line on
// the hub.
//
// ── Why a table and not Next's fetch cache ──
//
// MET's terms require caching, respecting `Expires`, and not re-asking faster
// than the data changes. Next's Data Cache is invalidated on every deployment
// — and this project deploys on every push — so it would be cold several times
// a day for no reason, and it offers no way to hold a `Last-Modified` for a
// conditional request. `weather_cache` is a row anybody can look at, which is
// the right shape for a promise made to somebody else.

export const dynamic = 'force-dynamic'

/** Long enough for a slow forecast, short enough that nothing waits on MET. */
const MET_TIMEOUT_MS = 4_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What every answer carries, in either form. */
type Payload = {
  ok: boolean
  reason?: string
  message?: string
  hours?: WeatherHour[]
  fetchedAt?: string
  stale?: boolean
}

type CacheRow = {
  latitude: number
  longitude: number
  hours: WeatherHour[]
  fetched_at: string
  expires_at: string | null
  last_modified: string | null
  failed_at: string | null
}

/**
 * GET /api/weather?course=<uuid>
 * GET /api/weather?slug=<platform course slug>
 *
 * The app always sends `course` — it is holding a row and knows its id. `slug`
 * is for a person with a phone: a 36-character uuid is unusable to type, and
 * checking this by hand on the device it is built for should not require a
 * desktop to copy from.
 *
 * It changes nothing about what the route will do. Both forms resolve to one
 * row here, and the coordinates still come off that row rather than out of the
 * request — which is the property that keeps this from being a proxy. `slug`
 * is scoped to platform courses, so it cannot reach into a trip.
 */
export async function GET(req: NextRequest) {
  // **Nothing gets out of here without a body.**
  //
  // Everything below returns one, but `createAdminClient` throws when its
  // environment is missing and a Supabase call can throw on a network fault —
  // and an uncaught throw in a route handler is a 500 with an EMPTY body.
  //
  // That is the worst possible answer, because a blank page is
  // indistinguishable from a route that was never deployed, a crash, and a
  // browser that renders nothing. It cost a round trip to a phone and back to
  // find out which. Whatever breaks, this says so in words.
  const human = !req.nextUrl.searchParams.get('course')
    && (req.nextUrl.searchParams.get('slug') ?? '').trim() !== ''
    && req.nextUrl.searchParams.get('format') !== 'json'
  try {
    return await handle(req)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    console.error('weather route threw:', e)
    return fault(`The forecast could not be loaded: ${why}`, 500, human)
  }
}

async function handle(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const courseId = params.get('course') ?? ''
  const slug = (params.get('slug') ?? '').trim().toLowerCase()

  // A slug is how a person asks, so a person is what is answered — unless
  // they say otherwise. The app never sends one.
  const human = bySlugParam(slug, courseId) && params.get('format') !== 'json'

  const bySlug = !courseId && slug !== '' && /^[a-z0-9-]{1,80}$/.test(slug)
  if (!bySlug && !UUID.test(courseId)) {
    // Refused before any I/O — an unusable identifier is not worth a query.
    return fault('A course id or slug is required.', 400, human)
  }

  const supabaseAdmin = createAdminClient()
  const now = new Date()

  const lookup = supabaseAdmin.from('courses').select('id, name, latitude, longitude')
  const { data: course, error: courseError } = await (bySlug
    // Platform courses only. A slug is unique per trip, not globally, so
    // without this a trip could have a course whose slug shadows a real one.
    ? lookup.eq('slug', slug).is('trip_id', null).maybeSingle()
    : lookup.eq('id', courseId).maybeSingle())

  if (courseError) {
    console.error('weather course query failed:', courseError)
    return fault('Could not read the course.', 200, human)
  }
  if (!course) {
    return fault(`No such course${bySlug ? `: ${slug}` : ''}.`, 404, human)
  }

  // Whichever way it was found, everything below keys off the row's own id —
  // the cache is per course, not per way of naming one.
  const id = course.id as string

  // Every answer below goes through this, so the human view and the app view
  // can never drift into saying different things.
  const reply = (payload: Payload) => json(payload, human, course.name as string)

  const lat = course.latitude == null ? null : Number(course.latitude)
  const lon = course.longitude == null ? null : Number(course.longitude)

  // An ordinary answer rather than an error: a course with no coordinates is
  // a normal course that shows no weather, and the screen says so quietly.
  // Cacheable too — it will not change until somebody edits a migration.
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return reply({ ok: false, reason: 'no-coordinates' })
  }

  // ── What we already hold ──
  const { data: cachedRow, error: cacheError } = await supabaseAdmin
    .from('weather_cache')
    .select('latitude, longitude, hours, fetched_at, expires_at, last_modified, failed_at')
    .eq('course_id', id)
    .maybeSingle()

  if (cacheError) console.error('weather cache read failed:', cacheError)

  const cached = (cachedRow ?? null) as CacheRow | null

  // A corrected latitude invalidates the cache by mismatch — no purge step,
  // and no forecast left over for a place the course turned out not to be.
  const sameSpot = cached != null
    && truncCoord(Number(cached.latitude)) === truncCoord(lat)
    && truncCoord(Number(cached.longitude)) === truncCoord(lon)

  const usable = sameSpot ? cached : null

  if (usable && isFresh(usable.expires_at, now)) {
    return reply({
      ok: true, hours: usable.hours, fetchedAt: usable.fetched_at, stale: false,
    })
  }

  // MET refused or failed recently. Leave them alone and serve what we have —
  // an hour-old wind is far better than none, and the caller says how old.
  if (usable && !backoffOver(usable.failed_at, now)) {
    return reply({
      ok: true, hours: usable.hours, fetchedAt: usable.fetched_at, stale: true,
    })
  }

  // ── Ask MET ──
  let res: Response
  try {
    res = await fetch(metUrl(lat, lon), {
      headers: {
        // Required. Without one identifying the app and a contact, requests
        // are throttled and then refused outright.
        'User-Agent': metUserAgent(process.env.MET_USER_AGENT),
        'Accept': 'application/json',
        ...(usable?.last_modified ? { 'If-Modified-Since': usable.last_modified } : {}),
      },
      // We are the cache. Letting Next hold a second copy would put two
      // different answers to "is this stale" in the same request.
      cache: 'no-store',
      signal: AbortSignal.timeout(MET_TIMEOUT_MS),
    })
  } catch (e) {
    console.error('weather fetch failed:', e)
    await recordFailure(supabaseAdmin, id, lat, lon, usable, now, String(e))
    return serveOrGiveUp(usable, reply)
  }

  // Unchanged since we last asked. Cheapest possible answer, and the reason
  // `last_modified` is kept at all.
  if (res.status === 304 && usable) {
    await supabaseAdmin.from('weather_cache').update({
      fetched_at: now.toISOString(),
      expires_at: expiryFrom(res, now),
      failed_at: null, failure: null,
    }).eq('course_id', id)
    return reply({ ok: true, hours: usable.hours, fetchedAt: now.toISOString(), stale: false })
  }

  if (!res.ok) {
    // 403 means the User-Agent was rejected and 429 that we asked too often.
    // Both are ours to fix, so both are said loudly in the log rather than
    // absorbed into a generic failure.
    console.error(`weather upstream returned ${res.status} for course ${id}`)
    await recordFailure(supabaseAdmin, id, lat, lon, usable, now, `HTTP ${res.status}`)
    return serveOrGiveUp(usable, reply)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch (e) {
    console.error('weather body was not JSON:', e)
    await recordFailure(supabaseAdmin, id, lat, lon, usable, now, 'unreadable body')
    return serveOrGiveUp(usable, reply)
  }

  const { hours, error: parseError } = parseForecast(body)
  if (parseError || hours.length === 0) {
    console.error('weather parse failed:', parseError)
    await recordFailure(supabaseAdmin, id, lat, lon, usable, now, parseError ?? 'empty')
    return serveOrGiveUp(usable, reply)
  }

  const fetchedAt = now.toISOString()
  const { error: writeError } = await supabaseAdmin.from('weather_cache').upsert({
    course_id: id,
    latitude: truncCoord(lat),
    longitude: truncCoord(lon),
    hours,
    fetched_at: fetchedAt,
    expires_at: expiryFrom(res, now),
    last_modified: res.headers.get('last-modified'),
    failed_at: null,
    failure: null,
  })
  // A forecast that could not be stored is still a forecast. Serve it and say
  // so in the log — the only cost is that the next reader asks MET again.
  if (writeError) console.error('weather cache write failed:', writeError)

  return reply({ ok: true, hours, fetchedAt, stale: false })
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Every answer, with the header that does the real work.
 *
 * `s-maxage` is what turns twelve players opening the hub before a round into
 * one request at the origin — and it only works because the URL is keyed on
 * the course and nothing else.
 *
 * `human` swaps the body for something readable and changes nothing else: the
 * same payload, the same headers, the same status. It exists because the first
 * check of this was done on a phone, where a JSON viewer showed a blank page
 * and there was no way to tell a broken route from a broken browser.
 */
function json(payload: Payload, human: boolean, courseName: string) {
  const headers = {
    'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
  }
  if (!human) return NextResponse.json(payload, { status: 200, headers })
  return new NextResponse(describe(payload, courseName), {
    status: 200,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/**
 * The same answer, for somebody holding a phone.
 *
 * Deliberately not pretty-printed JSON — that is the thing that was already
 * unreadable. A few lines saying what the wind is doing, and then the two
 * facts a person checking this actually needs: whether the cache is being
 * hit, and whether MET is supplying a chance of rain at all for these
 * coordinates.
 */
function describe(payload: Payload, courseName: string): string {
  const out: string[] = [courseName]

  if (payload.ok !== true) {
    out.push('', `NO FORECAST — ${payload.reason}`)
    if (payload.message) out.push(String(payload.message))
    return out.join('\n') + '\n'
  }

  const hours = Array.isArray(payload.hours) ? payload.hours as WeatherHour[] : []
  out.push(`${hours.length} entries`, '')

  for (const h of hours.slice(0, 3)) {
    out.push(`${h.at}  (${h.spanHours}h)`)
    out.push(`  ${describeSymbol(h.symbol)}${h.tempC == null ? '' : `, ${Math.round(h.tempC)}C`}`)
    out.push(`  wind  ${describeWind(h) || '—'} m/s`)
    out.push(`  rain  ${describeRain(h.rainChance) || 'no %'}`
      + `, ${h.rainMm == null ? 'no mm' : `${h.rainMm} mm`}`)
    out.push('')
  }

  // What this view exists to answer. MET does not publish every field
  // everywhere — the detailed ones come from their Nordic model, and a point
  // outside it is served by the global one. A block designed around a field
  // nobody sends would print a blank on every reading, so the counts are
  // taken before anything is drawn rather than after somebody notices.
  out.push('present on how many of the ' + hours.length + ' entries:')
  for (const [label, has] of [
    ['wind speed',     (h: WeatherHour) => h.windMs != null],
    ['wind direction', (h: WeatherHour) => h.windFromDeg != null],
    ['gust',           (h: WeatherHour) => h.gustMs != null],
    ['temperature',    (h: WeatherHour) => h.tempC != null],
    ['conditions',     (h: WeatherHour) => h.symbol != null],
    ['rain chance %',  (h: WeatherHour) => h.rainChance != null],
    ['rain mm',        (h: WeatherHour) => h.rainMm != null],
  ] as const) {
    out.push(`  ${label.padEnd(16)} ${hours.filter(has).length}`)
  }
  out.push('')
  out.push(`fetched ${payload.fetchedAt}${payload.stale ? ' (STALE)' : ''}`)
  out.push('', MET_ATTRIBUTION)
  return out.join('\n') + '\n'
}

/**
 * When MET said when to come back, take it. Otherwise an hour.
 *
 * Their `Expires` header is the whole of the caching term — respecting it is
 * not politeness, it is the condition the data is given under.
 */
function expiryFrom(res: Response, now: Date): string {
  const header = res.headers.get('expires')
  const parsed = header ? Date.parse(header) : NaN
  if (Number.isFinite(parsed) && parsed > now.getTime()) {
    return new Date(parsed).toISOString()
  }
  return new Date(now.getTime() + DEFAULT_TTL_MINUTES * 60_000).toISOString()
}

/**
 * Note that MET could not be reached, without losing what we already had.
 *
 * The `hours` already in the row are kept on purpose: a stale forecast is the
 * thing served while MET is down, so overwriting it with nothing would turn a
 * brief outage into a blank block.
 */
async function recordFailure(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  courseId: string, lat: number, lon: number,
  existing: CacheRow | null, now: Date, why: string,
) {
  const { error } = await supabaseAdmin.from('weather_cache').upsert({
    course_id: courseId,
    latitude: truncCoord(lat),
    longitude: truncCoord(lon),
    hours: existing?.hours ?? [],
    fetched_at: existing?.fetched_at ?? now.toISOString(),
    expires_at: existing?.expires_at ?? null,
    last_modified: existing?.last_modified ?? null,
    failed_at: now.toISOString(),
    failure: why.slice(0, 300),
  })
  if (error) console.error('weather failure note could not be written:', error)
}

/**
 * Whatever is left after MET could not be reached.
 *
 * **A 200 either way, never a 5xx.** The client renders the message, and a
 * 5xx on a page's own fetch invites the browser and every retry layer between
 * to ask again — which is the last thing a failing upstream needs.
 */
function serveOrGiveUp(
  cached: CacheRow | null,
  reply: (p: Payload) => NextResponse,
) {
  if (cached && Array.isArray(cached.hours) && cached.hours.length > 0) {
    return reply({
      ok: true, hours: cached.hours, fetchedAt: cached.fetched_at, stale: true,
    })
  }
  return reply({
    ok: false, reason: 'unavailable', message: 'Could not reach the forecast.',
  })
}

/**
 * The answers that come before a course is in hand.
 *
 * Plain text for a person, JSON for the app, and never an empty body either
 * way — a blank page is indistinguishable from a route that is not there,
 * which is the whole reason the readable view exists.
 */
function fault(message: string, status: number, human: boolean) {
  if (!human) return NextResponse.json({ error: message }, { status })
  return new NextResponse(message + '\n', {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/** Whether this looks like a person asking rather than the app. */
function bySlugParam(slug: string, courseId: string): boolean {
  return !courseId && slug.trim() !== ''
}
