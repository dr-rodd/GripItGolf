'use client'

import {
  type ItineraryItem, itemsForDay, dateForDay, describeDay, describeItem,
  itemState, tripProgress,
} from '@/lib/itinerary'
import Link from 'next/link'
import { IconFlag, itineraryIcon } from '@/app/components/icons'
import { useMinute } from '@/app/components/useMinute'

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
 * A stay or a journey. How and where, nothing more.
 *
 * No card. Golf is what a trip is for, so it is the only thing that gets a
 * white surface to stand on; a bed and a drive are context around it, read
 * in passing rather than tapped.
 *
 * **Centred, between the cards it sits between.** Left-aligned it was a
 * fourth column of text starting where the golf tiles' text starts, which
 * made it look like a card that had lost its border. Centred it reads as
 * what it is — the join between two rounds — and it matches how the same
 * stay and the same journey are drawn in the section below, which centres
 * them too.
 *
 * Activities used to pass through here too, and reading the running order
 * off a phone is what moved them out: a dinner booked for eight is a plan
 * with a name and a time, not the join between two rounds, and set as a
 * centred grey aside it disappeared into the page. They have a left-aligned
 * row of their own now — see `ActivityRow` — while the bed and the drive
 * keep this one.
 *
 * The icon is the mode's own now, from `itineraryIcon`. A flight was a plane
 * in that section and a plain arrow here, on the same screen.
 */
function SubtleRow({
  item, state, title, detail,
}: {
  item: ItineraryItem
  state: 'past' | 'now' | 'future'
  title: string
  detail: string
}) {
  const Icon = itineraryIcon(item.kind, item.travelMode)
  // "Past" dims the whole row rather than reaching for a lighter text tier —
  // the same technique the golf card uses. Nothing below ink/50 clears the
  // 3:1 floor the style guide checks, so opacity is the only lever left.
  return (
    <li className={`flex items-center justify-center gap-2 px-1 py-1.5 transition-opacity duration-200 ${
      state === 'past' ? 'opacity-50' : ''
    }`}>
      <span className="flex-shrink-0 text-ink/65">
        <Icon size={15} />
      </span>
      <span className={`t-cap truncate text-ink/80 ${state === 'past' ? 'line-through decoration-ink/25' : ''}`}>
        {title}
      </span>
      {detail && (
        <span className="t-cap flex-shrink-0 text-ink/65">
          {detail}
        </span>
      )}
    </li>
  )
}

/**
 * An activity — a dinner, a boat trip — as a thing you do, not a footnote.
 *
 * Left-aligned with the golf tiles and named in the same face, because on
 * the running order it is the same species of thing: a plan with a name and
 * a time that somebody booked. Still no card and no white surface — golf
 * keeps the only one, which is the visual rule holding the whole list
 * together — so the icon chip and the title weight do the promoting.
 */
function ActivityRow({
  item, state, title, detail,
}: {
  item: ItineraryItem
  state: 'past' | 'now' | 'future'
  title: string
  detail: string
}) {
  const Icon = itineraryIcon(item.kind, item.travelMode)
  return (
    <li className={`flex items-center gap-3 px-3.5 py-2 transition-opacity duration-200 ${
      state === 'past' ? 'opacity-50' : ''
    }`}>
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-bark/[0.06] text-bark flex items-center justify-center">
        <Icon size={15} />
      </span>
      <span className={`flex-1 min-w-0 t-card text-ink leading-snug ${
        state === 'past' ? 'line-through decoration-ink/25' : ''
      }`}>
        {title}
      </span>
      {detail && (
        <span className="t-cap flex-shrink-0 text-ink/65">{detail}</span>
      )}
    </li>
  )
}

export default function Itinerary({
  items, startDate, courseNames, days, tripCode, roundNumbers,
}: {
  items: ItineraryItem[]
  startDate: string | null
  /** Course id → name. Resolved on the server, where the query already was. */
  courseNames: Record<string, string>
  days: number
  tripCode: string
  /**
   * Itinerary item id → the round it became.
   *
   * Only golf items appear. Nothing else has a page to open — there is
   * nothing to say about a guesthouse or a dinner beyond its name, which is
   * already on the tile — so they stay as they are and are not tappable.
   */
  roundNumbers: Record<string, number>
}) {
  const now = useMinute()

  if (items.length === 0) return null

  const progress = now ? tripProgress(items, startDate, now) : null

  // The tap hint is only true when there is something to tap: a golf item
  // with a round behind it. A trip whose items never became rounds would be
  // promising a page that is not there.
  const anyCourseCard = items.some(i => i.kind === 'golf' && roundNumbers[i.id] != null)

  return (
    <section className="w-full">
      {/* The heading is the collapsible's own now — this carried one of its
          own before, and two headings over one list is one too many. What
          sits under it: the one thing the cards can do that nothing on them
          says (open), and the only figure here that changes during the trip
          (how much of it is done). */}
      {(anyCourseCard || (progress && progress.done > 0)) && (
        <div className="flex items-baseline justify-between gap-3 mb-3">
          {anyCourseCard ? (
            <p className="t-cap text-ink/65 leading-snug">
              Tap a course card for current weather and course details.
            </p>
          ) : <span />}
          {progress && progress.done > 0 && (
            <p className="t-cap text-ink/65 tabular-nums flex-shrink-0">
              {progress.done} of {progress.total} done
            </p>
          )}
        </div>
      )}

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
              {/* A day is the unit this list is read in — "what's Friday?" —
                  so it is set as a heading rather than as the caption it
                  was: label weight, full ink. Past days still fade with
                  everything in them, which is emphasis enough about which
                  headings still matter. */}
              <p className="t-label uppercase tracking-[0.15em] text-ink mb-2">
                {describeDay(date, day)}
              </p>

              <ul className="flex flex-col gap-1.5">
                {dayItems.map(item => {
                  const state = now ? itemState(item, date, now) : 'future'
                  const { title, detail } = describeItem(item, courseNames[item.courseId ?? ''])

                  // An activity is a plan of its own and reads at the golf
                  // tiles' weight; a stay or a journey is context and stays
                  // quiet. Golf is what the trip is for, so it is still the
                  // only thing that gets a white card or a tap.
                  if (item.kind === 'activity') {
                    return (
                      <ActivityRow key={item.id} item={item} state={state} title={title} detail={detail} />
                    )
                  }
                  if (item.kind !== 'golf') {
                    return (
                      <SubtleRow key={item.id} item={item} state={state} title={title} detail={detail} />
                    )
                  }

                  const Icon = IconFlag
                  const roundNumber = roundNumbers[item.id]

                  const tile = `flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-opacity duration-200 ${
                    state === 'now'
                      ? 'border-accent/40 bg-accent/[0.07]'
                      : 'border-bark/12 bg-surface'
                  } ${state === 'past' ? 'opacity-50' : ''}`

                  const inside = (
                    <>
                      <span
                        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          state === 'now' ? 'text-accent-deep bg-accent/[0.14]' : 'text-bark bg-bark/[0.06]'
                        }`}
                      >
                        <Icon size={16} />
                      </span>

                      <span className="flex-1 min-w-0">
                        {/* The whole name, wrapping. It was truncated, and
                            these are the longest names on the platform —
                            "Ballyliffin Golf Club -- Glashedy Links" — so
                            the card whose job is to name the course was the
                            one place it got cut off. The page scrolls; an
                            ellipsis saves nothing worth what it costs. */}
                        <span
                          className={`block t-card font-medium leading-snug ${
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
                    </>
                  )

                  // A golf item became a round, and a round has a page: the
                  // card, the tee ratings, and what happened on it. An item
                  // with no round behind it — a trip whose itinerary was
                  // edited after its rounds were made — stays a plain tile
                  // rather than a link to nowhere.
                  return (
                    <li key={item.id}>
                      {roundNumber != null ? (
                        <Link
                          href={`/trip/${tripCode}/round/${roundNumber}`}
                          className={`${tile} press`}
                        >
                          {inside}
                        </Link>
                      ) : (
                        <div className={tile}>{inside}</div>
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
