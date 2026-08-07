'use client'

import { useEffect, useState } from 'react'
import {
  pickAt, symbolKey, describeSymbol, describeWind, describeRain, describeAge,
  arrowDeg, beyondForecast, yrUrl, MET_ATTRIBUTION, MET_LICENCE_URL,
  type WeatherHour,
} from '@/lib/weather'
import { weatherIcon, IconArrowUp } from './icons'

/**
 * The weather at a course, in two shapes.
 *
 * One component, because the round page and the hub must never disagree about
 * the wind at the same course on the same day — one fetch, one parse, one set
 * of failure states, two layouts.
 *
 * Fetched in the browser rather than during the server render, for a reason
 * beyond latency: **the hub does not know which round is next until
 * hydration.** `lib/upNext.ts` returns a deliberately stable placeholder when
 * it has no clock, so a server-side fetch there could be for the wrong course.
 * It also keeps MET off the critical path of two `force-dynamic` pages that
 * are read on a tee box on bad signal.
 *
 * **What it will not do is invent.** A missing gust prints no gust clause; a
 * missing chance of rain prints millimetres or nothing. MET publishes its
 * detailed fields for a limited part of Europe and Ireland is outside it — so
 * on these courses the gust and the percentage are simply absent, and a dash
 * where a number belongs would read as a calm day rather than as silence.
 */

type Payload = {
  ok: boolean
  reason?: string
  hours?: WeatherHour[]
  fetchedAt?: string
  stale?: boolean
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; hours: WeatherHour[]; fetchedAt: string }
  | { kind: 'none' }
  | { kind: 'failed' }

export default function CourseWeather({
  courseId, teeAt, variant, lat, lon,
}: {
  courseId: string
  /** The first tee, when it is known. Null on the hub's non-golf items. */
  teeAt: string | null
  variant: 'block' | 'line'
  /** For the link out. Absent means no link rather than a guessed one. */
  lat?: number | null
  lon?: number | null
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  // Read once on mount rather than every render: a countdown re-rendering each
  // second must not re-pick against a moving clock and flicker between hours.
  const [now] = useState(() => new Date())

  useEffect(() => {
    let live = true
    fetch(`/api/weather?course=${encodeURIComponent(courseId)}`)
      .then(r => r.json())
      .then((p: Payload) => {
        if (!live) return
        if (p.ok && Array.isArray(p.hours) && p.hours.length > 0) {
          setState({ kind: 'ready', hours: p.hours, fetchedAt: p.fetchedAt ?? '' })
        } else {
          setState({ kind: p.reason === 'no-coordinates' ? 'none' : 'failed' })
        }
      })
      .catch(() => { if (live) setState({ kind: 'failed' }) })
    return () => { live = false }
  }, [courseId])

  const tee = teeAt ? new Date(teeAt) : null

  if (variant === 'line') return <Line state={state} tee={tee} now={now} />
  return <Block state={state} tee={tee} now={now} lat={lat} lon={lon} />
}

// ─── The round page ────────────────────────────────────────────

function Block({
  state, tee, now, lat, lon,
}: {
  state: State
  tee: Date | null
  now: Date
  lat?: number | null
  lon?: number | null
}) {
  if (state.kind === 'loading') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-[132px] rounded-xl" />
        <div className="skeleton h-[132px] rounded-xl" />
      </div>
    )
  }

  // An absence, not a failure — so it is said quietly and not in rust.
  if (state.kind === 'none') {
    return <Quiet>No forecast — we don&apos;t have this course&apos;s location.</Quiet>
  }
  if (state.kind === 'failed') {
    // Visible, per the house rule. This one IS a failure and says so in the
    // same tone as the page's own error banner.
    return (
      <p className="text-rust-deep text-sm leading-snug text-center">
        Could not reach the forecast.
      </p>
    )
  }

  // Beyond the model is a different answer from bad weather, and a link into
  // an empty table is worse than no link.
  if (tee && beyondForecast(tee, now)) {
    return <Quiet>Too far out for a forecast — check back nearer the day.</Quiet>
  }

  const nowHour = pickAt(state.hours, now)
  const teeHour = tee ? pickAt(state.hours, tee) : null

  // Two near-identical readings labelled differently is noise, so once the
  // round is under way the tee slot goes and "Right now" takes the width.
  const sameHour = nowHour && teeHour && nowHour.at === teeHour.at
  const slots: { label: string; hour: WeatherHour | null }[] = sameHour || !tee
    ? [{ label: 'Right now', hour: nowHour }]
    : [
        { label: 'Right now', hour: nowHour },
        { label: 'At the first tee', hour: teeHour },
      ]

  const age = describeAge(state.fetchedAt, now)
  const link = lat != null && lon != null ? yrUrl(lat, lon, tee, now) : null

  return (
    <div className="flex flex-col gap-3">
      <div className={`grid gap-3 ${slots.length === 1 ? '' : 'grid-cols-2'}`}>
        {slots.map(s => <Slot key={s.label} label={s.label} hour={s.hour} />)}
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <span className="t-cap text-ink/50">
          {/* Only once it is old enough to be worth doubting. */}
          {age || (
            <a
              href={MET_LICENCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink/65 transition-colors"
            >
              {MET_ATTRIBUTION}
            </a>
          )}
        </span>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="t-cap uppercase tracking-[0.15em] text-ink/65 hover:text-accent-deep transition-colors py-2"
          >
            Full forecast
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * One reading.
 *
 * Wind is the largest thing in the card on purpose — it is what the block is
 * for. Bark and ink only: the page's one primary action is Live Scoring, and
 * a third emerald thing would stop the accent meaning anything. Never rust
 * for a strong wind either — rust means loss, and a gale is weather.
 */
function Slot({ label, hour }: { label: string; hour: WeatherHour | null }) {
  const Icon = hour ? weatherIcon(symbolKey(hour.symbol)) : null
  const arrow = hour ? arrowDeg(hour.windFromDeg) : null
  const wind = hour ? describeWind(hour) : ''
  const rain = hour ? describeRain(hour.rainChance) : ''

  return (
    <div className="rounded-xl border border-bark/12 bg-surface px-4 py-4 text-center">
      <p className="t-cap uppercase tracking-[0.14em] text-ink/50">{label}</p>

      {!hour ? (
        <p className="t-cap text-ink/50 mt-2 leading-snug">No reading for this hour</p>
      ) : (
        <>
          <div className="flex items-center justify-center gap-2 mt-2 text-bark">
            {Icon && <Icon size={20} />}
            <span className="t-cap text-ink/80">{describeSymbol(hour.symbol)}</span>
            {hour.tempC != null && (
              <span className="t-cap text-ink/65 tabular-nums">{Math.round(hour.tempC)}°</span>
            )}
          </div>

          {wind && (
            <div className="flex items-baseline justify-center gap-1.5 mt-2.5">
              {arrow != null && (
                <span
                  className="text-bark flex-shrink-0 self-center"
                  style={{ transform: `rotate(${arrow}deg)` }}
                  aria-hidden="true"
                >
                  <IconArrowUp size={15} />
                </span>
              )}
              <span className="font-[family-name:var(--font-display)] font-semibold text-bark text-[19px] leading-none tabular-nums">
                {wind}
              </span>
              <span className="t-cap text-ink/50">m/s</span>
            </div>
          )}

          {/* Percentage where MET gives one, millimetres where it does not,
              and nothing at all rather than a nought that reads as "dry". */}
          <p className="t-cap text-ink/65 mt-1.5">
            {rain || (hour.rainMm != null && hour.rainMm > 0
              ? `${hour.rainMm} mm rain`
              : hour.rainMm === 0 ? 'No rain' : '')}
          </p>
        </>
      )}
    </div>
  )
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-cap text-ink/50 text-center py-2 leading-snug">{children}</p>
  )
}

// ─── The hub ───────────────────────────────────────────────────

/**
 * One line under "Up next".
 *
 * **Never a link.** The up-next block is already wrapped in a `<Link>` to the
 * round page when the next item is golf, and an `<a>` inside that is invalid
 * HTML. Tapping the card goes to the round page, which carries the link out
 * and the attribution — the better journey anyway.
 *
 * Silent unless it has something to say. A one-line glance is not the place
 * for an apology, and rendering nothing while loading keeps the card from
 * jumping as it arrives.
 */
function Line({ state, tee, now }: { state: State; tee: Date | null; now: Date }) {
  if (state.kind !== 'ready') return null
  if (tee && beyondForecast(tee, now)) return null

  const hour = pickAt(state.hours, tee ?? now)
  if (!hour) return null

  const wind = describeWind(hour)
  if (!wind) return null

  const rain = describeRain(hour.rainChance)
    || (hour.rainMm != null && hour.rainMm > 0 ? `${hour.rainMm} mm` : '')
  const Icon = weatherIcon(symbolKey(hour.symbol))

  return (
    <p className="flex items-center gap-1.5 t-cap text-ink/65 mt-1 tabular-nums">
      <span className="flex-shrink-0 text-bark"><Icon size={14} /></span>
      <span>{[`${wind} m/s`, rain].filter(Boolean).join(' · ')}</span>
    </p>
  )
}
