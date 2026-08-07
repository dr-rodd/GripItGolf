/**
 * The weather module. Run with: npm run test:weather
 *
 * Four things in `lib/weather.ts` are where the real bugs live, and each is a
 * named function precisely so this file can hold it:
 *
 *   1. The arrow. A wind FROM 315° blows TOWARDS 135°, so rotating the glyph
 *      by `wind_from_direction` points it at the weather rather than with it.
 *      Backwards, and entirely plausible on screen.
 *   2. The precipitation fallback. `next_1_hours` stops existing about three
 *      days out. A parser that reads it and stops returns null for every tee
 *      time past day three — which is most of the time a trip is planned.
 *   3. Null against zero. "No chance of rain" and "we do not know" are
 *      different sentences and must never print the same one.
 *   4. Out of range. A round ten days out must get nothing, not the nearest
 *      hour MET happens to hold.
 */

import {
  truncCoord, metUrl, metUserAgent, parseForecast, pickAt,
  compass, arrowDeg, symbolKey, describeSymbol,
  describeWind, describeRain, describeAge,
  yrUrl, hourlyTable, beyondForecast, isFresh, backoffOver,
  HOURLY_WITHIN_HOURS, FORECAST_DAYS, BACKOFF_MINUTES,
  MET_ATTRIBUTION, type WeatherHour, type SymbolKey,
} from '../lib/weather'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}
const section = (n: string) => console.log(`\n${n}`)

// ─── Fixture ───────────────────────────────────────────────────
//
// Trimmed from a real `complete` response. Three entries, chosen to cover the
// three shapes the parser actually meets: an hourly one with everything, an
// hourly one missing the gust and the probability, and a six-hourly one from
// the far end of the range where `next_1_hours` no longer exists.

const BODY = {
  properties: {
    timeseries: [
      {
        time: '2026-08-10T09:00:00Z',
        data: {
          instant: { details: {
            air_temperature: 14.2,
            wind_speed: 8.1,
            wind_from_direction: 315.0,
            wind_speed_of_gust: 14.4,
          } },
          next_1_hours: {
            summary: { symbol_code: 'partlycloudy_day' },
            details: { probability_of_precipitation: 20.0, precipitation_amount: 0.1 },
          },
        },
      },
      {
        time: '2026-08-10T10:00:00Z',
        data: {
          instant: { details: {
            air_temperature: 15.0,
            wind_speed: 6.0,
            wind_from_direction: 200.0,
          } },
          next_1_hours: { summary: { symbol_code: 'clearsky_day' }, details: {} },
        },
      },
      {
        time: '2026-08-16T06:00:00Z',
        data: {
          instant: { details: {
            air_temperature: 11.0,
            wind_speed: 12.5,
            wind_from_direction: 250.0,
          } },
          // No next_1_hours at all — the far end of the range
          next_6_hours: {
            summary: { symbol_code: 'rainshowers_day' },
            details: { probability_of_precipitation: 65.0, precipitation_amount: 2.4 },
          },
        },
      },
    ],
  },
}

const NOW = new Date('2026-08-10T08:00:00Z')

// ─── Coordinates ───────────────────────────────────────────────

section('Coordinates never carry a fifth decimal')
{
  // More than four and MET refuses the request outright.
  eq(truncCoord(51.60123456), 51.6012, 'truncated to four places')
  eq(truncCoord(-9.99999), -9.9999, 'and truncated, not rounded — rounding adds a digit back')
  eq(truncCoord(51.6), 51.6, 'a shorter one is left alone')

  // Truncating in floating point is not the one-liner it looks like.
  // `-9.8578 * 10000` is -98577.99999999999, so a plain Math.trunc moves an
  // already-valid coordinate by a ten-thousandth — the exact quantity this
  // is here to hold still. Found by the pin over the shipped migration.
  eq(truncCoord(-9.8578), -9.8578, 'a value already at four places does not drift')
  eq(truncCoord(-8.5336), -8.5336, 'in either direction of the decimal')
  eq(truncCoord(54.2237), 54.2237, 'or either sign')
  eq(truncCoord(-10.0338), -10.0338, 'or either side of ten degrees')

  const url = metUrl(51.60123456, -9.99999)
  ok(!/\d\.\d{5}/.test(url), 'so no five-decimal number can reach the URL')
  ok(url.startsWith('https://api.met.no/weatherapi/locationforecast/2.0/complete?'),
    'the host and the product are fixed in the module')
  ok(url.includes('/complete?'), 'and it is `complete`, not `compact`')
  ok(!url.includes('/compact'), '  …which is the only product carrying gusts and rain chance')
  ok(url.indexOf('lat=') < url.indexOf('lon='), 'latitude before longitude')
}

section('MET is told who is asking')
{
  // Without a User-Agent naming the app and a contact, requests are
  // throttled and then refused.
  ok(metUserAgent().length > 0, 'there is always one')
  ok(/greendot|GreenDotGolf/i.test(metUserAgent()), 'and it names this app')
  eq(metUserAgent('Custom/2.0 (x@y.z)'), 'Custom/2.0 (x@y.z)', 'the environment can override it')
  eq(metUserAgent('   '), metUserAgent(), 'but whitespace is not an override')
  ok(MET_ATTRIBUTION.includes('MET Norway'), 'and the credit the licence requires names them')
}

// ─── Parsing ───────────────────────────────────────────────────

section('A forecast is read without trusting any field')
{
  const { hours, error } = parseForecast(BODY)
  eq(error, null, 'a good body parses clean')
  eq(hours.length, 3, 'every entry survives')

  const first = hours[0]
  eq(first.tempC, 14.2, 'temperature')
  eq(first.windMs, 8.1, 'wind in the API\'s own m/s, unconverted')
  eq(first.windFromDeg, 315, 'the direction it comes from')
  eq(first.gustMs, 14.4, 'the gust')
  eq(first.rainChance, 20, 'the chance of rain')
  eq(first.spanHours, 1, 'and an hourly entry knows it covers an hour')

  // Absent is absent. This is the difference between "no gust worth
  // mentioning" and "a dead calm", which are not the same forecast.
  eq(hours[1].gustMs, null, 'a missing gust is null, never zero')
  eq(hours[1].rainChance, null, 'a missing rain chance is null, never zero')
}

section('Rain is read from the six-hour window once the one-hour window is gone')
{
  // The bug this exists for: `next_1_hours` stops existing about three days
  // out, and a parser that reads only it goes quiet for every tee time
  // beyond — which is most of the time somebody is planning a trip.
  const far = parseForecast(BODY).hours[2]
  eq(far.spanHours, 6, 'the far entry knows it covers six hours')
  eq(far.rainChance, 65, 'and still has a chance of rain')
  eq(far.symbol, 'rainshowers_day', 'and its conditions')
  eq(far.rainMm, 2.4, 'and its millimetres')
}

section('A body that changed shape cannot take a page down')
{
  for (const [label, input] of [
    ['null', null],
    ['a string', 'not json'],
    ['an empty object', {}],
    ['properties with no timeseries', { properties: {} }],
    ['a timeseries that is not a list', { properties: { timeseries: 'x' } }],
  ] as const) {
    const r = parseForecast(input)
    eq(r.hours, [], `${label} yields no hours`)
    ok(r.error !== null, `  …and a sentence to show`)
  }
  // An entry with no time is dropped rather than parsed into a row nothing
  // can place on a clock.
  eq(parseForecast({ properties: { timeseries: [{ data: {} }] } }).hours, [],
    'an entry with no time is dropped')
}

// ─── Picking ───────────────────────────────────────────────────

section('The hour picked is the hour that covers the moment')
{
  const { hours } = parseForecast(BODY)

  eq(pickAt(hours, new Date('2026-08-10T09:00:00Z'))?.at, '2026-08-10T09:00:00Z',
    'an exact hour hits')
  eq(pickAt(hours, new Date('2026-08-10T09:30:00Z'))?.at, '2026-08-10T09:00:00Z',
    'a moment inside the hour takes that hour')
  eq(pickAt(hours, new Date('2026-08-10T10:59:00Z'))?.at, '2026-08-10T10:00:00Z',
    'the last minute of an hour is still that hour')

  // Six-hour entries cover six hours, which is why the span is stored.
  eq(pickAt(hours, new Date('2026-08-16T11:00:00Z'))?.at, '2026-08-16T06:00:00Z',
    'a moment five hours into a six-hour block takes that block')

  // The one that matters: nothing rather than the nearest.
  eq(pickAt(hours, new Date('2026-08-10T07:00:00Z')), null,
    'before the forecast starts is null, not the first entry')
  eq(pickAt(hours, new Date('2026-08-20T09:00:00Z')), null,
    'past the end is null, not the last entry')
  eq(pickAt(hours, new Date('2026-08-13T09:00:00Z')), null,
    'and a gap between entries is null, not the one either side')
  eq(pickAt([], new Date()), null, 'an empty forecast picks nothing')
  eq(pickAt(hours, new Date('nonsense')), null, 'and an unreadable moment picks nothing')
}

section('Instants are compared, never strings')
{
  // MET writes UTC; `momentOf` in lib/upNext.ts builds a tee time in local
  // clock time. Both are Dates, so comparing numbers is right — comparing
  // text is silently wrong for half the year in Ireland.
  const { hours } = parseForecast(BODY)
  const utc   = new Date('2026-08-10T09:30:00Z')
  const same  = new Date(utc.getTime())
  eq(pickAt(hours, utc)?.at, pickAt(hours, same)?.at,
    'the same instant picks the same hour however it was built')
}

// ─── Direction ─────────────────────────────────────────────────

section('The arrow points where the wind is going, not where it came from')
{
  // Rotate by wind_from_direction and the arrow points backwards. It is in
  // half the weather widgets on the internet and looks entirely plausible.
  eq(arrowDeg(315), 135, 'a north-westerly blows towards the south-east')
  eq(arrowDeg(0), 180, 'a northerly blows south')
  eq(arrowDeg(180), 0, 'and a southerly blows north')
  eq(arrowDeg(270), 90, 'a westerly blows east')
  eq(arrowDeg(null), null, 'no direction, no arrow')
}

section('Sixteen points, and north wraps')
{
  eq(compass(0), 'N', 'due north')
  eq(compass(90), 'E', 'due east')
  eq(compass(180), 'S', 'due south')
  eq(compass(270), 'W', 'due west')
  eq(compass(315), 'NW', 'and the diagonals')
  eq(compass(22.5), 'NNE', 'and the halves between them')

  // The wrap is the only part worth pushing on.
  eq(compass(359), 'N', 'just short of a full circle is north')
  eq(compass(349), 'N', 'and so is 349')
  eq(compass(348), 'NNW', 'while 348 has not got there yet')
  eq(compass(360), 'N', 'a full circle is north again')
  eq(compass(370), 'N', 'and so is more than one')
  eq(compass(-45), 'NW', 'a negative bearing wraps the other way')
  eq(compass(null), '', 'and no bearing is no point')
}

// ─── Conditions ────────────────────────────────────────────────

section('Every code MET publishes lands on an icon')
{
  // The full vocabulary, written out. Not "some codes map correctly" — every
  // published one, so a code falling through to the default is a failure
  // rather than a sun drawn over a thunderstorm.
  const BASE = [
    'clearsky', 'cloudy', 'fair', 'fog', 'heavyrain', 'heavyrainandthunder',
    'heavyrainshowers', 'heavyrainshowersandthunder', 'heavysleet',
    'heavysleetandthunder', 'heavysleetshowers', 'heavysleetshowersandthunder',
    'heavysnow', 'heavysnowandthunder', 'heavysnowshowers',
    'heavysnowshowersandthunder', 'lightrain', 'lightrainandthunder',
    'lightrainshowers', 'lightrainshowersandthunder', 'lightsleet',
    'lightsleetandthunder', 'lightsleetshowers', 'lightsnow',
    'lightsnowandthunder', 'lightsnowshowers', 'lightssleetshowersandthunder',
    'lightssnowshowersandthunder', 'partlycloudy', 'rain', 'rainandthunder',
    'rainshowers', 'rainshowersandthunder', 'sleet', 'sleetandthunder',
    'sleetshowers', 'sleetshowersandthunder', 'snow', 'snowandthunder',
    'snowshowers', 'snowshowersandthunder',
  ]
  const VARIANTS = ['', '_day', '_night', '_polartwilight']

  const keys = new Set<SymbolKey>()
  let unmapped = 0
  for (const base of BASE) {
    for (const v of VARIANTS) {
      const key = symbolKey(base + v)
      keys.add(key)
      if (describeSymbol(base + v) === '') unmapped++
    }
  }
  eq(unmapped, 0, 'every code has words to go with it')

  // Thunder first, because every thundery code also names its precipitation.
  // Lightning is the one forecast condition that clears a golf course, and
  // hiding it under a rain cloud is the worst thing this block could do.
  eq(symbolKey('rainandthunder'), 'thunder', 'rain and thunder is thunder')
  eq(symbolKey('heavysnowshowersandthunder'), 'thunder', 'so is snow and thunder')
  eq(symbolKey('rain'), 'rain', 'while plain rain is rain')

  eq(symbolKey('lightsleetshowers_day'), 'rain', 'sleet is rain — you get wet either way')
  eq(symbolKey('heavysnow'), 'snow', 'snow stays its own thing')
  eq(symbolKey('fog'), 'cloud', 'fog is cloud — you cannot see through either')
  eq(symbolKey('partlycloudy_night'), 'partly', 'partly cloudy stays partly cloudy')

  // Night is separate or the "Right now" slot puts a sun in the sky at ten,
  // and the whole block reads as broken.
  eq(symbolKey('clearsky_day'), 'clear', 'a clear day')
  eq(symbolKey('clearsky_night'), 'clearnight', 'and a clear night are drawn apart')
  eq(symbolKey('fair_night'), 'clearnight', 'fair follows the same rule')

  // The default is a safety net, not a hiding place.
  eq(symbolKey('somethingmetaddedin2027'), 'cloud', 'an unknown code draws a cloud')
  eq(symbolKey(null), 'cloud', 'and so does none at all')
  eq(symbolKey(''), 'cloud', 'or an empty one')
}

// ─── Wording ───────────────────────────────────────────────────

section('Wind reads the way it is said')
{
  const h = (over: Partial<WeatherHour>): WeatherHour => ({
    at: '2026-08-10T09:00:00Z', spanHours: 1, tempC: 14, windMs: 8,
    windFromDeg: 315, gustMs: null, symbol: null, rainChance: null,
    rainMm: null, ...over,
  })

  eq(describeWind(h({})), 'NW 8', 'direction and speed')
  eq(describeWind(h({ gustMs: 14.4 })), 'NW 8, gusting 14', 'and the gust when there is one')
  eq(describeWind(h({ gustMs: 8.1 })), 'NW 8',
    'a gust no bigger than the wind is not news')
  eq(describeWind(h({ windFromDeg: null })), '8', 'no direction, just the speed')
  eq(describeWind(h({ windMs: null })), '', 'and no wind at all says nothing')
}

section('Rain says nothing rather than nought')
{
  // The distinction the whole module turns on.
  eq(describeRain(20), '20% rain', 'a chance is a percentage')
  eq(describeRain(0), '0% rain', 'and a real zero prints — worth reading on a golf trip')
  eq(describeRain(null), '', 'but an unknown says nothing at all')
  ok(describeRain(0) !== describeRain(null),
    'so "no chance" and "we do not know" never read the same')
}

section('A stale reading says how stale')
{
  const now = new Date('2026-08-10T12:00:00Z')
  eq(describeAge('2026-08-10T11:30:00Z', now), '', 'a fresh one says nothing')
  eq(describeAge('2026-08-10T09:00:00Z', now), 'Updated 3 hours ago', 'an old one says so')
  eq(describeAge('2026-08-09T09:00:00Z', now), 'Updated yesterday', 'yesterday reads as yesterday')
  eq(describeAge('2026-08-07T09:00:00Z', now), 'Updated 3 days ago', 'and further back in days')
  eq(describeAge(null, now), '', 'no timestamp, no claim')
}

// ─── Out to yr.no ──────────────────────────────────────────────

section('The way out lands on the right table')
{
  const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000)

  ok(yrUrl(51.6, -9.9, at(1), NOW).includes('hourly-table'), 'tomorrow gets the hourly table')
  ok(yrUrl(51.6, -9.9, at(HOURLY_WITHIN_HOURS - 1), NOW).includes('hourly-table'),
    'and so does the last hour inside the boundary')
  ok(yrUrl(51.6, -9.9, at(HOURLY_WITHIN_HOURS + 1), NOW).includes('daily-table'),
    'the first hour past it gets the daily table')

  // Past the hourly range the hourly page is six-hour blocks in an hourly
  // layout, which reads as broken rather than coarse.
  eq(hourlyTable(at(HOURLY_WITHIN_HOURS + 1), NOW), false, 'which is the whole point of the boundary')
  eq(hourlyTable(null, NOW), true, 'no moment at all defaults to hourly')

  const url = yrUrl(51.60123456, -9.99999, at(1), NOW)
  ok(url.startsWith('https://www.yr.no/en/forecast/'), 'scheme and host are fixed here too')
  ok(!/\d\.\d{5}/.test(url), 'and the coordinates are truncated on the way out')
}

section('Beyond the model is a different answer from bad weather')
{
  const at = (d: number) => new Date(NOW.getTime() + d * 86_400_000)
  eq(beyondForecast(at(3), NOW), false, 'three days out is forecastable')
  eq(beyondForecast(at(FORECAST_DAYS - 1), NOW), false, 'so is the last day of the model')
  eq(beyondForecast(at(FORECAST_DAYS + 1), NOW), true, 'past it is not')
  eq(beyondForecast(null, NOW), false, 'and no date is not "too far"')
}

// ─── Going back to MET ─────────────────────────────────────────

section('MET is asked again only when it should be')
{
  const now = new Date('2026-08-10T12:00:00Z')
  eq(isFresh('2026-08-10T12:00:01Z', now), true, 'a second before expiry is fresh')
  eq(isFresh('2026-08-10T11:59:59Z', now), false, 'a second after is not')
  eq(isFresh(null, now), false, 'no expiry is not fresh — refetch rather than assume')
  eq(isFresh('not a date', now), false, 'and an unreadable one is not either')

  const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  eq(backoffOver(ago(BACKOFF_MINUTES + 1), now), true, 'past the backoff, try again')
  eq(backoffOver(ago(BACKOFF_MINUTES - 1), now), false, 'inside it, leave them alone')
  eq(backoffOver(null, now), true, 'and nothing has failed yet')
}

// ─── The coordinates that shipped ──────────────────────────────

section('Every stored coordinate is one MET will accept')
{
  // The numbers live in a migration rather than in a script that writes to
  // production, because everything else about a platform course is defined
  // there too — a wrong latitude for Old Head should be fixed by editing a
  // line and pushing, exactly as a wrong stroke index would be.
  //
  // That makes them source, so they get held to the same rules as anything
  // else in `lib/`.
  const fs = require('fs') as typeof import('fs')
  const sql = fs.readFileSync(
    'supabase/migrations/20260101000026_course_weather.sql', 'utf-8')

  const pairs = [...sql.matchAll(
    /SET latitude = (-?\d+\.\d+), longitude = (-?\d+\.\d+)/g)]
  ok(pairs.length >= 20, `every course carries a pair (${pairs.length} statements)`)

  for (const [, la, lo] of pairs) {
    for (const n of [la, lo]) {
      const places = n.split('.')[1]?.length ?? 0
      ok(places <= 4, `${n} has no fifth decimal — MET refuses one`)
      // And what shipped is already what gets sent, so the value in the
      // database and the value in the URL are the same number.
      eq(truncCoord(Number(n)), Number(n), `  …and ${n} survives truncCoord unchanged`)
    }
    // Ireland and Britain. A transposed pair or a stray minus lands outside
    // this, and would otherwise send somebody the South Atlantic's weather.
    const lat = Number(la), lon = Number(lo)
    ok(lat >= 49 && lat <= 61, `${lat} is a plausible latitude`)
    ok(lon >= -11 && lon <= 2, `${lon} is a plausible longitude`)
  }

  // The database enforces both of those too, so neither depends on this
  // file being run.
  ok(/numeric\(7,4\)/.test(sql), 'the column itself cannot hold a fifth decimal')
  ok(/courses_coordinates_sane/.test(sql), 'and a CHECK holds the box')

  // Replay-safe, which matters given the standing warning about migration
  // 010's one-time backfill.
  ok(!/DROP |DELETE FROM/i.test(sql), 'the migration drops and deletes nothing')
  ok((sql.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length >= 3,
    'and every column it adds is conditional')
}

// ─── The route ─────────────────────────────────────────────────

section('The route cannot become a proxy, or a cache that never hits')
{
  // Structural rather than behavioural: the route does I/O, so what is
  // checkable without a database and a network is the shape of it — and the
  // shape is where these particular mistakes live.
  const fs = require('fs') as typeof import('fs')
  const route = fs.readFileSync('app/api/weather/route.ts', 'utf-8')
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  // A ?lat=&lon= parameter would make this an open proxy to api.met.no under
  // our User-Agent — which is how that User-Agent gets blocked for somebody
  // else's scraping. The caller names a course; the server supplies the point.
  ok(/params\.get\('course'\)/.test(code), 'it is asked for a course')
  ok(!/params\.get\('lat'\)|params\.get\('lon'\)/.test(code),
    '  …and never for coordinates')
  ok(/UUID\.test\(/.test(code), 'and an unparseable id is refused before any query')

  // A slug is the same question in a form somebody can type on a phone. It
  // must resolve to a row here like the id does — the coordinates come off
  // the row either way, which is the property that keeps this from being a
  // proxy — and it must not be able to reach into a trip: `courses.slug` is
  // unique per trip, not globally.
  ok(/params\.get\('slug'\)/.test(code), 'a slug is accepted too, for a phone')
  ok(/\^\[a-z0-9-\]\{1,80\}\$/.test(code), '  …matched against a strict shape')
  ok(/\.eq\('slug', slug\)[\s\S]{0,40}\.is\('trip_id', null\)/.test(code),
    '  …and scoped to platform courses, so it cannot shadow one inside a trip')
  ok(/const id = course\.id as string/.test(code),
    'and both forms key the cache off the row, not off how it was named')

  // The tee time in the URL would give the CDN a different key per reader per
  // minute, and the cache below would never be hit.
  ok(!/searchParams\.get\('at'|searchParams\.get\('when'/.test(code),
    'the tee time is not in the URL, so the CDN key is the course alone')
  ok(/s-maxage=\d+/.test(code), 'which is what makes s-maxage worth having')

  // MET refuses a request with no User-Agent naming the app and a contact.
  ok(/'User-Agent': metUserAgent\(process\.env\.MET_USER_AGENT\)/.test(code),
    'MET is told who is asking, from the environment')
  ok(/AbortSignal\.timeout/.test(code), 'and is never allowed to hold the function open')
  ok(/cache: 'no-store'/.test(code),
    'Next holds no second copy — one answer to "is this stale", not two')

  // The terms are about the Expires header, not about a number we picked.
  ok(/headers\.get\('expires'\)/.test(code), 'the cache expires when MET says')
  ok(/If-Modified-Since/.test(code), 'and an unchanged forecast costs a 304, not a body')

  // A failing upstream must not be answered with a status that invites the
  // browser, and every retry layer between, to ask again.
  ok(!/status: 5\d\d/.test(code), 'nothing here returns a 5xx')
  ok(/reason: 'unavailable'/.test(code), 'a failure is a 200 the client can render')
  ok(/reason: 'no-coordinates'/.test(code),
    'and a course without a location is an ordinary answer, not an error')

  // The stale forecast is the thing served while MET is down, so the failure
  // note must not overwrite it.
  ok(/hours: existing\?\.hours \?\? \[\]/.test(code),
    'recording a failure keeps the forecast it already had')
}

// ─── The two placements ────────────────────────────────────────

section('The hub line stays out of the link it sits inside')
{
  const fs = require('fs') as typeof import('fs')
  const comp = fs.readFileSync('app/components/CourseWeather.tsx', 'utf-8')
  const hub = fs.readFileSync('app/trip/[tripCode]/StatusBlock.tsx', 'utf-8')

  // `StatusBlock` wraps the whole up-next block in a <Link> to the round page
  // whenever the next item is golf — which is exactly when the weather line
  // shows. An <a> inside an <a> is invalid HTML: React complains and browsers
  // resolve it inconsistently.
  ok(/<Link[\s\S]{0,200}<UpNextLines/.test(hub),
    'the up-next block is inside a Link when the next item is golf')

  const line = comp.slice(comp.indexOf('function Line('))
  ok(!/<a\b/.test(line), '  …so the line variant renders no anchor of its own')
  ok(!/yrUrl/.test(line), '  …and does not reach for the link out')
  // The block is the one that carries the way to the full forecast, and the
  // attribution the licence requires.
  const block = comp.slice(comp.indexOf('function Block('), comp.indexOf('function Line('))
  ok(/yrUrl/.test(block), 'the round-page block carries the link out instead')
  ok(/MET_ATTRIBUTION/.test(block), '  …and the credit the licence requires')

  // The hub says nothing rather than apologising. A one-line glance under
  // "Up next" is not the place for an error message.
  ok(/if \(state\.kind !== 'ready'\) return null/.test(line),
    'and it is silent unless it has something to say')
  ok(/beyondForecast/.test(line),
    'a round past the model shows nothing rather than the nearest hour')

  // Golf only, and the moment comes from upNext rather than being rebuilt.
  ok(/next\.item\.kind === 'golf' && next\.item\.courseId/.test(hub),
    'the hub asks for weather on golf alone')
  ok(/teeAt=\{next\.startsAt \? next\.startsAt\.toISOString\(\) : null\}/.test(hub),
    '  …at the instant upNext already worked out, not a second reading of it')
}

// ─── Nothing answers with nothing ──────────────────────────────

async function emptyBodyCheck() {
  section('However it fails, the route says so')
  // Not structural — this calls the handler.
  //
  // The first check of this feature on a phone showed a blank page, twice.
  // A blank page is indistinguishable from a route that was never deployed,
  // a crash, and a browser rendering nothing — three different faults, no way
  // to tell them apart, on the device the whole app is built for.
  //
  // The cause was that `createAdminClient` throws when its environment is
  // missing, and an uncaught throw in a route handler is a 500 with an EMPTY
  // body. This suite runs with no Supabase environment, so that is exactly
  // the state reproduced here.
  const { NextRequest } = await import('next/server')
  const { GET } = await import('../app/api/weather/route')

  // The handler logs the throw it catches, which is right in production and
  // alarming in a passing test run. Silenced for the three calls below and
  // put straight back.
  const realError = console.error
  console.error = () => {}

  for (const [label, url] of [
    ['a slug', 'https://x.test/api/weather?slug=old-head'],
    ['an id', 'https://x.test/api/weather?course=00000000-0000-4000-8000-000000000000'],
    ['nothing usable', 'https://x.test/api/weather?slug=%20'],
  ] as const) {
    let body = ''
    let status = 0
    let threw = false
    try {
      const res = await GET(new NextRequest(url))
      status = res.status
      body = await res.text()
    } catch { threw = true }

    ok(!threw, `asked with ${label}, the handler does not throw`)
    ok(body.length > 0, `  …and answers with a body (${body.length} chars)`)
    ok(status > 0 && status < 600, `  …and a real status (${status})`)
  }

  console.error = realError
}

// ─── Result ────────────────────────────────────────────────────

emptyBodyCheck().then(() => {
  console.log('\n' + '─'.repeat(56))
  if (failed === 0) console.log(`✓ all ${passed} checks passed`)
  else {
    console.log(`✗ ${failed} of ${passed + failed} failed\n`)
    for (const f of failures) console.log(`  · ${f}`)
    process.exit(1)
  }
})
