'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { forgetPlayer } from '@/lib/playerCookie'
import { type ItineraryItem, describeDay } from '@/lib/itinerary'
import {
  upNext, nextActivity, describeCountdown, describeGroups, type RoundDates,
} from '@/lib/upNext'
import { useMinute } from '@/app/components/useMinute'
import type { TripWrap } from '@/lib/tripStatus'
import CourseWeather from '@/app/components/CourseWeather'
import { IconArrowRight, IconFlag, IconHome, IconCar, IconPlane, IconTrain, IconFork, IconUsers } from '@/app/components/icons'

/**
 * The top of the trip hub: what this device is, and what happens next.
 *
 * Two states, and they are genuinely different pages rather than one page
 * with a field missing.
 *
 * **Nobody yet.** One thing to do, taking the whole block: claim a spot.
 * Someone who has just been handed a six-character code should not have to
 * hunt for what to do with it. No up-next, no standing — there is no player
 * to personalise either of them to, and a trip-wide countdown shown to a
 * stranger is a countdown to something they may not be on.
 *
 * **Somebody.** Greeting, what is next, where they stand. Compact, three
 * lines of substance, in that order.
 *
 * The Points / Level / Rounds / Matches tiles that used to sit here are
 * gone — not moved. Stats are their own phase and an empty heading promising
 * them is worse than not mentioning them.
 */

/**
 * The item, drawn.
 *
 * Returns the element rather than the component: picking a component during
 * render and then instantiating it is how a component ends up recreated on
 * every pass, losing its state — and eslint stops it, rightly.
 */
function itemIcon(item: ItineraryItem, size: number) {
  if (item.kind === 'golf') return <IconFlag size={size} />
  if (item.kind === 'stay') return <IconHome size={size} />
  if (item.kind === 'activity') return <IconFork size={size} />
  if (item.travelMode === 'flight') return <IconPlane size={size} />
  if (item.travelMode === 'train') return <IconTrain size={size} />
  return <IconCar size={size} />
}

export type StatusPlayer = {
  /** Their first name. This is a greeting, not a roll call. */
  firstName: string
  /** "1st of 12", or blank when they have no position to report. */
  placing: string
  /** "Plays Ross · Semi-final", or blank. */
  nextMatch: string
}

export default function StatusBlock({
  tripCode,
  player,
  items,
  startDate,
  roundDates,
  roundNumbers,
  courseNames,
  wrap,
}: {
  tripCode: string
  /** Null when this device is not linked to anybody on this trip. */
  player: StatusPlayer | null
  items: ItineraryItem[]
  startDate: string | null
  /** Round date by the itinerary item that made it — the date half of the join. */
  roundDates: [string, string | null][]
  /** Itinerary item id → round number, for the golf items that have a page. */
  roundNumbers: Record<string, number>
  courseNames: Record<string, string>
  /**
   * What to say once nothing is left on the running order — decided on the
   * server (lib/tripStatus.ts `tripWrap`), because only the server knows
   * whether every round's scores are actually in. "The leaderboard is final"
   * is a claim about the scores, not the calendar.
   */
  wrap: TripWrap
}) {
  const router = useRouter()
  const now = useMinute()
  const [dismissed, setDismissed] = useState(false)

  if (!player || dismissed) {
    return <ClaimSpot tripCode={tripCode} />
  }

  const dates: RoundDates = new Map(roundDates)
  const next = upNext(items, startDate, dates, courseNames, now)
  const countdown = next?.startsAt && now
    ? describeCountdown(next.startsAt.getTime() - now.getTime())
    : ''
  // Only a golf item has a round behind it, and only a round has a page.
  const nextRoundNumber = next?.item.kind === 'golf'
    ? roundNumbers[next.item.id] ?? null
    : null

  // What else is booked. Deliberately not part of `next`: golf is what the
  // trip is for and keeps the card, and this is the line underneath it.
  const activity = nextActivity(items, startDate, dates, courseNames, now, next)
  // The day is only worth saying when it is not the one already named above
  // — "Friday · Friday, 7:30 pm" is the card telling you twice. On the same
  // day the time alone is the whole answer, and an activity with no time
  // says nothing rather than "no time".
  const activityWhen = activity
    ? (activity.date === next?.date
        ? activity.detail
        : [describeDay(activity.date, activity.item.dayIndex), activity.detail]
            .filter(Boolean).join(' · '))
    : ''

  return (
    <div className="w-full rounded-2xl border border-bark/12 bg-surface px-4 py-4">

      {/* ── Greeting. One line, and the way out of it. ── */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-card text-ink min-w-0 truncate">{player.firstName}</p>
        <button
          onClick={() => {
            forgetPlayer(tripCode)
            setDismissed(true)
            // This hub, as the server rendered it, still has the old name in
            // it — and the router will hand that same payload back the next
            // time anything navigates here. `dismissed` only hides it for as
            // long as this component stays mounted, which is until the next
            // navigation. Clearing the cache is what makes "Not you?" outlast
            // the tap; see the note in players/PlayersClient.tsx.
            router.refresh()
            router.push(`/trip/${tripCode}/players`)
          }}
          className="flex-shrink-0 t-cap uppercase tracking-[0.12em] text-ink/50 hover:text-ink/80 transition-colors duration-150"
        >
          Not you?
        </button>
      </div>

      {/* ── Up next ──
          Golf links through to its round summary; a stay or a journey has
          no page to open and stays plain. */}
      <div className="mt-3.5 pt-3.5 border-t border-bark/[0.08]">
        {next ? (
          nextRoundNumber != null ? (
            <Link
              href={`/trip/${tripCode}/round/${nextRoundNumber}`}
              className="block press"
            >
              <UpNextLines next={next} countdown={countdown} />
            </Link>
          ) : (
            <UpNextLines next={next} countdown={countdown} />
          )
        ) : <WrapCard wrap={wrap} />}

        {/* What else is booked.
            Outside the <Link> above rather than inside it, which is the
            whole point: the card belongs to the round and tapping it opens
            the round, so a line about dinner sitting inside it would be a
            tap target that goes somewhere else entirely.
            Indented to the card's text column — `pl-11` is the icon's 8
            plus the gap's 3 — so it reads as hanging off what is above it
            rather than as a second thing of equal weight. */}
        {next && activity && (
          <p className="mt-2.5 pl-11 flex items-center gap-2 t-cap text-ink/65">
            <span className="flex-shrink-0 text-bark" aria-hidden="true">
              <IconFork size={14} />
            </span>
            <span className="truncate">{activity.title}</span>
            {activityWhen && (
              <span className="flex-shrink-0 text-ink/50">{activityWhen}</span>
            )}
          </p>
        )}
      </div>

      {/* ── Standing ──
          Omitted rather than zeroed. "0 points, last of 12" before a ball is
          struck is a worse thing to read than nothing at all. */}
      {(player.placing || player.nextMatch) && (
        <div className="mt-3.5 pt-3.5 border-t border-bark/[0.08] flex flex-col gap-1">
          {player.placing && (
            <p className="t-cap text-ink/80">
              <span className="text-ink/50 uppercase tracking-[0.12em]">Standing </span>
              <span className="t-num text-accent-deep">{player.placing}</span>
            </p>
          )}
          {player.nextMatch && (
            <p className="t-cap text-ink/80">{player.nextMatch}</p>
          )}
        </div>
      )}
    </div>
  )
}

/** What is next, and — for golf — how long until it. */
function UpNextLines({
  next,
  countdown,
}: {
  next: NonNullable<ReturnType<typeof upNext>>
  countdown: string
}) {
  // The same wording the itinerary uses for a day, from the same place.
  const day = describeDay(next.date, next.item.dayIndex)
  const groups = describeGroups(next.groups, next.teeTime)

  return (
    <div className="flex items-start gap-3">
      <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/[0.12] text-accent-deep flex items-center justify-center">
        {itemIcon(next.item, 18)}
      </span>

      <div className="flex-1 min-w-0">
        <p className="t-cap uppercase tracking-[0.12em] text-ink/50">Up next</p>
        {/* The headline of the whole hub, set like one. It was `t-card` with
            a truncate — the same weight as a tile in a list, and a course
            name cut off with an ellipsis on the card whose job is to say
            where you are going. It wraps now, at section-heading size, and
            the page scrolls to make the room rather than the card shrinking
            its own answer. */}
        <p className="t-h2 text-ink text-balance mt-0.5">{next.title}</p>

        {/* The date, then how many groups go off and when the first one does.
            Never a personal tee time — nothing on the platform records who
            is in which group, so anything narrower would be invented. */}
        <p className="t-cap text-ink/80 mt-1">
          {[day, groups || next.detail].filter(Boolean).join(' · ')}
        </p>

        {/* Golf only. A stay or a journey carries a day and nothing finer,
            so there is no moment to count down to. */}
        {countdown && (
          <p className="t-card text-accent-deep mt-1.5 tabular-nums">in {countdown}</p>
        )}

        {/* What it will be doing when they get there.
            Golf only, for the same reason as the countdown — a stay has no
            tee to stand on. `next.startsAt` rather than a second reading of
            the date and the tee time: `momentOf` in lib/upNext.ts already
            turned those into an instant, and two ways of doing that is how
            one tee time comes to mean two different moments.
            Last, under the countdown. The countdown is the emphasised line
            and belongs beside the day it counts from; this is the detail
            after it.
            **Not a link, and it cannot become one** — this whole block is
            already inside a <Link> to the round page whenever the next item
            is golf, and an <a> in there is invalid HTML. The way to the full
            forecast is the round page, which carries it. */}
        {next.item.kind === 'golf' && next.item.courseId && (
          <CourseWeather
            courseId={next.item.courseId}
            teeAt={next.startsAt ? next.startsAt.toISOString() : null}
            variant="line"
          />
        )}
      </div>
    </div>
  )
}

/**
 * Nothing left on the running order — what the trip has to say for itself.
 *
 * The words come from `tripWrap` in lib/tripStatus.ts, not from here: this
 * card used to say "Every round is in. The leaderboard is final." off the
 * running order alone, which called a board final with cards still out on
 * it. While scores are outstanding the flag square warms to the accent —
 * something is still happening, and this is the line saying what.
 */
function WrapCard({ wrap }: { wrap: TripWrap }) {
  const waiting = wrap.key === 'waiting'
  return (
    <div className="flex items-center gap-3">
      <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        waiting ? 'bg-accent/[0.12] text-accent-deep' : 'bg-bark/[0.06] text-bark'
      }`}>
        <IconFlag size={16} />
      </span>
      <div className="min-w-0">
        <p className="t-cap uppercase tracking-[0.12em] text-ink/50">{wrap.cap}</p>
        <p className="t-cap text-ink/65 mt-0.5">{wrap.body}</p>
      </div>
    </div>
  )
}

/**
 * The whole block, for a device that is nobody yet.
 *
 * Someone arriving on a trip code has exactly one thing to do first, and
 * every other feature on the hub is better after they have done it. So it
 * takes the whole block — but it takes it **in the hub's own card**: cream,
 * a hairline border, the tinted icon square and the arrow, exactly the
 * shape the status card takes for a phone that has claimed. It stood in a
 * two-pixel emerald box on a mint wash, and next to a page of cream cards
 * that read as a different app's component pasted in. Emphasis on this
 * screen is *position* — first thing under the title, alone above the fold
 * — not a heavier box.
 *
 * The explanation came back, and this is the third answer rather than a
 * reversal of the second. It first sat inside the control as a paragraph
 * plus a redundant "Get started"; it was cut for that; and what was
 * actually wrong was the second label and the placement, not saying why
 * claiming is worth a tap. So it sits **under the card and outside the
 * link** — one sentence of prose, no tap target of its own, in the slot
 * this page already uses for a note hanging off the thing above it.
 * `test:recognition` pins it outside the <Link>, which is the part that
 * would quietly regress: a paragraph dragged back inside becomes a second
 * reason to tap and reads as part of the button.
 */
function ClaimSpot({ tripCode }: { tripCode: string }) {
  return (
    <div>
      <Link
        href={`/trip/${tripCode}/players`}
        className="flex items-center gap-3 w-full rounded-2xl border border-bark/12 bg-surface px-4 py-4 press"
      >
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/[0.12] text-accent-deep flex items-center justify-center">
          <IconUsers size={16} />
        </span>
        <span className="flex-1 min-w-0 t-card text-ink">Claim your spot</span>
        <IconArrowRight size={18} className="flex-shrink-0 text-accent-deep" />
      </Link>

      {/* Why it is worth the tap. Left aligned to the card's own edge, at
          the size and weight this page gives every other aside, so it reads
          as a note on the card rather than as a second thing to do. */}
      <p className="mt-2.5 px-1 t-cap text-ink/65">
        Pick your name, or add it if it is not there. This phone then
        remembers you — your scores, your standing, and what is on next.
      </p>
    </div>
  )
}
