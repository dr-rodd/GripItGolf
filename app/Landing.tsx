'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import TripHeader from '@/app/components/TripHeader'
import { HERO_SPACE } from '@/app/components/headerMetrics'
import { buttonClass } from '@/app/components/ui'

/**
 * The entry screen, and the way out of it.
 *
 * The wordmark is the page. Below it, one sentence saying what to do, and
 * the two things you can do. Nothing else — no feature list, no marketing.
 *
 * ── Leaving ────────────────────────────────────────────────────
 *
 * Tapping either button does not simply navigate. The buttons fade, the mark
 * collapses out of the middle of the page and into the header bar, and only
 * once it has landed does the next screen arrive — fading up underneath, so
 * the whole thing reads as one movement rather than as a page swap.
 *
 * The collapse used to be driven by scrolling this page. Moving it onto the
 * tap is what makes it controllable: an animation on a timer runs at the
 * speed it was written to run at, where one driven by a finger runs at
 * whatever speed the finger moves and can stop halfway. It also puts the
 * movement where it means something — you are leaving, and the mark going
 * up to the bar is where it lives on the screen you are going to.
 *
 * Both destinations are prefetched, so the pause after the animation is as
 * near to nothing as it can be.
 */

/** How long the mark takes to travel into the bar. */
const TRAVEL_MS = 380

/** The content clears out of the way first, and quickly. */
const FADE_MS = 160

export default function Landing() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const frame = useRef<number | null>(null)
  const going = useRef(false)

  useEffect(() => {
    router.prefetch('/dashboard/create')
    router.prefetch('/join')
  }, [router])

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
  }, [])

  function leave(href: string) {
    return (e: React.MouseEvent) => {
      // A modified click still does what it always does — open in a new tab
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      // A second tap while the first is running would start a second
      // animation over the top of it
      if (going.current) return
      going.current = true

      // Asked for less motion: go straight there, no collapse, no fade
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        router.push(href)
        return
      }

      setLeaving(true)

      // The clock comes from the frame itself rather than from a reading
      // taken beforehand, so the first frame is t=0 however long the browser
      // took to schedule it.
      let start = 0
      const step = (now: number) => {
        if (start === 0) start = now
        const t = Math.min(1, (now - start) / TRAVEL_MS)
        setProgress(t)
        if (t < 1) {
          frame.current = requestAnimationFrame(step)
        } else {
          frame.current = null
          router.push(href)
        }
      }
      frame.current = requestAnimationFrame(step)
    }
  }

  return (
    <main className="min-h-dvh bg-cream page-enter">

      {/* No trip to go back to yet, so the mark is not a link. It stands
          full size until a tap sends it up into the bar. */}
      <TripHeader progress={progress} />

      {/* The room the mark occupies. It does not close as the mark leaves:
          the content below is on its way out too, and moving it up while it
          fades would be two things happening for no reason. */}
      <div aria-hidden="true" style={{ height: HERO_SPACE }} />

      <div
        className="px-6 pb-12 flex flex-col items-center"
        style={{
          opacity: leaving ? 0 : 1,
          transition: `opacity ${FADE_MS}ms ease-out`,
          // Nothing below should be tappable once it is on its way out
          pointerEvents: leaving ? 'none' : undefined,
        }}
      >
        <div className="w-full max-w-sm flex flex-col items-center">

          {/* One line saying what to do next. The buttons sit directly below,
              so it can point at them without naming them twice. */}
          <p className="t-body text-ink/65 text-center text-balance max-w-[20rem]">
            Live scoring, leaderboards and matchplay for your golf trip.
            Tap below to start one, or to join a trip you have a code for.
          </p>

          <div className="w-full flex flex-col gap-3 mt-10">
            {/* Still real links: they prefetch, they survive a long press,
                and without JavaScript they simply navigate. */}
            <Link
              href="/dashboard/create"
              onClick={leave('/dashboard/create')}
              className={buttonClass('primary')}
            >
              Create a trip
            </Link>
            <Link
              href="/join"
              onClick={leave('/join')}
              className={buttonClass('secondary')}
            >
              Join a trip
            </Link>
          </div>

          <p className="t-cap text-ink/40 text-center mt-12 max-w-[19rem] text-balance">
            Your handicap is the best 8 of your last 20 rounds. On the graph,
            those eight are green dots.
          </p>
        </div>
      </div>
    </main>
  )
}
