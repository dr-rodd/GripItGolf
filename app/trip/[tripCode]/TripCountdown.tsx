'use client'

import { useEffect, useState } from 'react'

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getTimeLeft(target: Date): TimeLeft | null {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return null
  return {
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

/**
 * The countdown to the first tee.
 *
 * Part of the trip's title — name, dates, then this — rather than a block of
 * its own beneath one. It reads as the third line of a heading, which is what
 * it is: a fact about the trip, the same kind as when it runs.
 *
 * **Brown, at 24px.** It arrived from Donegal as four emerald figures at 48px
 * with a glow behind them and a black drop shadow under them, which was the
 * loudest thing on a screen it is not the subject of — and the shadow was
 * drawn for a dark page this app does not have. Emerald is an accent here:
 * the dot, one action, a status. A number that changes every second is none
 * of those, so the figures are bark and the unit letters stay muted.
 *
 * The colour was the fix; the size overshot. At 17px it sat under the dates
 * and read as a footnote to them, when on a trip that has not started this is
 * the line being looked for. It is between the trip's name and its dates now
 * — clearly not the heading, clearly not an aside.
 *
 * All four units stay on show even at zero. Dropping "00 d" on the morning of
 * departure would reflow the row on the one day somebody is watching it.
 *
 * The collapse at zero is unchanged — a grid row from 1fr to 0fr, so the page
 * closes over it rather than jumping. The margin lives inside the collapsing
 * half, or the gap it held would outlive it.
 */
export default function TripCountdown({
  target,
}: {
  /** ISO date string (YYYY-MM-DD or full ISO); null skips the countdown. */
  target: string | null
}) {
  const [mounted, setMounted]     = useState(false)
  const [timeLeft, setTimeLeft]   = useState<TimeLeft | null>(null)
  const [timerGone, setTimerGone] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (!target) {
      setTimerGone(true)
      return
    }
    const targetDate = new Date(target)
    const initial = getTimeLeft(targetDate)
    if (!initial) {
      // Already under way, or over — nothing to count to
      setTimerGone(true)
      return
    }
    setTimeLeft(initial)
    const id = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000)
    return () => clearInterval(id)
  }, [target])

  // Reaches zero: collapse, then leave the DOM
  useEffect(() => {
    if (!mounted || timerGone || timeLeft !== null) return
    const t = setTimeout(() => setTimerGone(true), 700)
    return () => clearTimeout(t)
  }, [timeLeft, mounted, timerGone])

  if (timerGone) return null

  const collapsing = mounted && !timeLeft

  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateRows: collapsing ? '0fr' : '1fr',
        transition: 'grid-template-rows 700ms ease-in-out',
      }}
    >
      <div className="overflow-hidden">
        {/* The height is held before hydration so the block below does not
            jump up and back down as the figures arrive. */}
        {!mounted ? (
          <div className="h-[40px]" />
        ) : timeLeft ? (
          <div className="flex items-baseline justify-center gap-3.5 mt-4 tabular-nums">
            {[
              { unit: 'd', value: timeLeft.days },
              { unit: 'h', value: timeLeft.hours },
              { unit: 'm', value: timeLeft.minutes },
              { unit: 's', value: timeLeft.seconds },
            ].map(({ unit, value }) => (
              <span key={unit} className="flex items-baseline gap-0.5">
                <span className="font-[family-name:var(--font-display)] font-semibold text-bark text-[24px] leading-none">
                  {String(value).padStart(2, '0')}
                </span>
                <span className="t-cap text-ink/50 leading-none">{unit}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
