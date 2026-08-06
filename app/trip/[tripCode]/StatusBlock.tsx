'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { forgetPlayer } from '@/lib/playerCookie'
import { type ItineraryItem, describeDay } from '@/lib/itinerary'
import {
  upNext, describeCountdown, describeGroups, type RoundDates,
} from '@/lib/upNext'
import { useMinute } from '@/app/components/useMinute'
import { IconArrowRight, IconFlag, IconHome, IconCar, IconPlane, IconTrain } from '@/app/components/icons'

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
  courseNames,
}: {
  tripCode: string
  /** Null when this device is not linked to anybody on this trip. */
  player: StatusPlayer | null
  items: ItineraryItem[]
  startDate: string | null
  /** Round date by the itinerary item that made it — the date half of the join. */
  roundDates: [string, string | null][]
  courseNames: Record<string, string>
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

  return (
    <div className="w-full rounded-2xl border border-bark/12 bg-surface px-4 py-4">

      {/* ── Greeting. One line, and the way out of it. ── */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-card text-ink min-w-0 truncate">{player.firstName}</p>
        <button
          onClick={() => {
            forgetPlayer(tripCode)
            setDismissed(true)
            router.push(`/trip/${tripCode}/players`)
          }}
          className="flex-shrink-0 t-cap uppercase tracking-[0.12em] text-ink/50 hover:text-ink/80 transition-colors duration-150"
        >
          Not you?
        </button>
      </div>

      {/* ── Up next ── */}
      <div className="mt-3.5 pt-3.5 border-t border-bark/[0.08]">
        {next ? <UpNextLines next={next} countdown={countdown} /> : <TripOver />}
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
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/[0.12] text-accent-deep flex items-center justify-center">
        {itemIcon(next.item, 16)}
      </span>

      <div className="flex-1 min-w-0">
        <p className="t-cap uppercase tracking-[0.12em] text-ink/50">Up next</p>
        <p className="t-card text-ink truncate mt-0.5">{next.title}</p>

        {/* The date, then how many groups go off and when the first one does.
            Never a personal tee time — nothing on the platform records who
            is in which group, so anything narrower would be invented. */}
        <p className="t-cap text-ink/65 mt-0.5">
          {[day, groups || next.detail].filter(Boolean).join(' · ')}
        </p>

        {/* Golf only. A stay or a journey carries a day and nothing finer,
            so there is no moment to count down to. */}
        {countdown && (
          <p className="t-cap text-accent-deep mt-1 tabular-nums">in {countdown}</p>
        )}
      </div>
    </div>
  )
}

/** Nothing left on the running order. */
function TripOver() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-bark/[0.06] text-bark flex items-center justify-center">
        <IconFlag size={16} />
      </span>
      <div className="min-w-0">
        <p className="t-cap uppercase tracking-[0.12em] text-ink/50">That&apos;s the trip</p>
        <p className="t-cap text-ink/65 mt-0.5">Every round is in. The leaderboard is final.</p>
      </div>
    </div>
  )
}

/**
 * The whole block, for a device that is nobody yet.
 *
 * Deliberately the loudest thing on the screen. Someone arriving on a trip
 * code has exactly one thing to do first, and every other feature on the hub
 * is better after they have done it.
 */
function ClaimSpot({ tripCode }: { tripCode: string }) {
  return (
    <Link
      href={`/trip/${tripCode}/players`}
      className="block w-full rounded-2xl border-2 border-accent bg-accent/[0.07] px-5 py-6 text-center transition-colors duration-150 hover:bg-accent/[0.12]"
    >
      <p className="t-h2 text-ink">Claim your spot</p>
      <p className="t-cap text-ink/65 mt-1.5 leading-snug">
        Find your name and this phone remembers you — scores, standings and
        what is on next.
      </p>
      <span className="inline-flex items-center gap-2 mt-4 text-accent-deep t-cap uppercase tracking-[0.18em]">
        Get started
        <IconArrowRight size={15} />
      </span>
    </Link>
  )
}
