'use client'

import { useCallback, useSyncExternalStore } from 'react'
import {
  type ItineraryItem, itemsForDay, dateForDay, describeDay, describeItem,
  itemState, tripProgress,
} from '@/lib/itinerary'
import { IconFlag, IconHome, IconArrowRight } from '@/app/components/icons'

/**
 * The trip's running order on the hub, dimming as it happens.
 *
 * What is done fades back, so the eye lands on what is next. That is the
 * whole point of showing it here rather than a list of dates: on the third
 * morning you want to know where you are going, not what you already did.
 *
 * A client component, because it reads the clock — and it reads it through
 * an external store rather than during render. The server has no idea what
 * time it is where the reader is, so rendering against `new Date()` directly
 * produces different markup on each side, which React reports as a hydration
 * error. The server snapshot is simply "no clock", so the first paint shows
 * everything as still to come and the real time arrives on hydration.
 */

/**
 * The current minute, or null before hydration.
 *
 * Bucketed to the minute so the snapshot is stable between renders — the
 * finest thing on this list is a tee time, and a value that changed on every
 * render would loop forever.
 */
function useMinute(): Date | null {
  const minute = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      const timer = setInterval(onChange, 30_000)
      return () => clearInterval(timer)
    }, []),
    () => Math.floor(Date.now() / 60_000),
    () => null,
  )
  return minute === null ? null : new Date(minute * 60_000)
}

const KIND_ICON = { golf: IconFlag, stay: IconHome, travel: IconArrowRight } as const

/**
 * A stay or a journey — how and where, nothing more.
 *
 * No card. Golf is what a trip is for, so it is the only thing that gets a
 * white surface to stand on; a stay or a journey is context around it, read
 * in passing rather than tapped. The icon and the two lines sit directly on
 * the page, at roughly a third the visual weight of a round.
 */
function SubtleRow({
  item, state, title, detail,
}: {
  item: ItineraryItem
  state: 'past' | 'now' | 'future'
  title: string
  detail: string
}) {
  const Icon = KIND_ICON[item.kind]
  // "Past" dims the whole row rather than reaching for a lighter text tier —
  // the same technique the golf card uses. Nothing below ink/50 clears the
  // 3:1 floor the style guide checks, so opacity is the only lever left.
  return (
    <li className={`flex items-center gap-2.5 px-1 py-1 transition-opacity duration-200 ${
      state === 'past' ? 'opacity-50' : ''
    }`}>
      <span className="flex-shrink-0 text-ink/50">
        <Icon size={13} />
      </span>
      <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
        <span className={`t-cap truncate text-ink/65 ${state === 'past' ? 'line-through decoration-ink/25' : ''}`}>
          {title}
        </span>
        {detail && (
          <span className="t-cap flex-shrink-0 text-ink/50">
            {detail}
          </span>
        )}
      </span>
    </li>
  )
}

export default function Itinerary({
  items, startDate, courseNames, days,
}: {
  items: ItineraryItem[]
  startDate: string | null
  /** Course id → name. Resolved on the server, where the query already was. */
  courseNames: Record<string, string>
  days: number
}) {
  const now = useMinute()

  if (items.length === 0) return null

  const progress = now ? tripProgress(items, startDate, now) : null

  return (
    <section className="w-full">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="t-h2 text-ink">The plan</h2>
        {progress && progress.done > 0 && (
          <p className="t-cap text-ink/65 tabular-nums">
            {progress.done} of {progress.total} done
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-4">
        {Array.from({ length: days }, (_, day) => {
          const dayItems = itemsForDay(items, day)
          if (dayItems.length === 0) return null
          const date = dateForDay(startDate, day)

          // A day is behind you only once everything in it is
          const allPast = now
            ? dayItems.every(i => itemState(i, date, now) === 'past')
            : false

          return (
            <li key={day} className={allPast ? 'opacity-45' : ''}>
              <p className="t-cap uppercase tracking-[0.18em] text-ink/65 mb-2">
                {describeDay(date, day)}
              </p>

              <ul className="flex flex-col gap-1.5">
                {dayItems.map(item => {
                  const state = now ? itemState(item, date, now) : 'future'
                  const { title, detail } = describeItem(item, courseNames[item.courseId ?? ''])

                  // Golf is what the trip is for, so it is the only thing
                  // that gets a white card. A stay or a journey is context
                  // around it — how and where, not a thing to tap — and sits
                  // straight on the page instead.
                  if (item.kind !== 'golf') {
                    return (
                      <SubtleRow key={item.id} item={item} state={state} title={title} detail={detail} />
                    )
                  }

                  const Icon = KIND_ICON.golf

                  return (
                    <li
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-opacity duration-200 ${
                        state === 'now'
                          ? 'border-accent/40 bg-accent/[0.07]'
                          : 'border-bark/12 bg-surface'
                      } ${state === 'past' ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          state === 'now' ? 'text-accent-deep bg-accent/[0.14]' : 'text-bark bg-bark/[0.06]'
                        }`}
                      >
                        <Icon size={16} />
                      </span>

                      <span className="flex-1 min-w-0">
                        <span
                          className={`block t-card font-medium truncate ${
                            state === 'past' ? 'text-ink/80 line-through decoration-ink/25' : 'text-ink'
                          }`}
                        >
                          {title}
                        </span>
                        {detail && (
                          <span className="block t-cap text-ink/65 truncate mt-0.5">{detail}</span>
                        )}
                      </span>

                      {state === 'now' && (
                        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent dot-live" aria-label="Happening now" role="img" />
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
