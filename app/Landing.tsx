'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import TripHeader from '@/app/components/TripHeader'
import { HERO_SPACE } from '@/app/components/headerMetrics'
import { buttonClass } from '@/app/components/ui'

/**
 * The entry screen, and the way out of it.
 *
 * The wordmark is the page. Below it, one sentence saying what the platform
 * is, and the two things you can do: type the event code you were given, or
 * create an event of your own. Nothing else — no feature list, no marketing.
 *
 * The code goes straight in here rather than behind a Join button: the most
 * common visitor is somebody holding a six-character code from a group chat,
 * and a screen between them and typing it was a screen for its own sake.
 * `/join` survives for shared links, which arrive carrying `?code=`.
 *
 * ── Leaving ────────────────────────────────────────────────────
 *
 * Leaving does not simply navigate. The content fades, the mark collapses
 * out of the middle of the page and into the header bar, and only once it
 * has landed does the next screen arrive — fading up underneath, so the
 * whole thing reads as one movement rather than as a page swap. A joined
 * code takes the same road once it has been checked.
 *
 * The collapse used to be driven by scrolling this page. Moving it onto the
 * tap is what makes it controllable: an animation on a timer runs at the
 * speed it was written to run at, where one driven by a finger runs at
 * whatever speed the finger moves and can stop halfway. It also puts the
 * movement where it means something — you are leaving, and the mark going
 * up to the bar is where it lives on the screen you are going to.
 *
 * The create path is prefetched, so the pause after the animation is as
 * near to nothing as it can be.
 */

/**
 * The shake before the move: the words loosen in place, out of step with one
 * another, so the collapse reads as something the mark does rather than
 * something done to it.
 */
const WOBBLE_MS = 340

/** How long the mark then takes to travel into the bar. */
const TRAVEL_MS = 700

/** The content clears out of the way from the first frame. */
const FADE_MS = 220

/**
 * Starts and ends at rest.
 *
 * The words each decelerate inside their own window already, but the
 * sequence as a whole ran at a constant rate, so it set off at full speed
 * the instant the shake finished. Smoothing the driver is what makes the
 * mark leave gently and arrive gently.
 */
const smooth = (p: number) => p * p * (3 - 2 * p)

export default function Landing() {
  const router = useRouter()
  // One clock. Both the shake and the travel are read off it, so they cannot
  // drift apart or overlap by accident.
  const [elapsed, setElapsed] = useState<number | null>(null)
  const frame = useRef<number | null>(null)
  const going = useRef(false)

  /**
   * How far down the page the mark should land, read once as the tap lands.
   *
   * The header is not pinned here, so the bar it collapses into is at the top
   * of the document, not the top of the screen. Read at departure rather than
   * followed: the mark must travel to one fixed place, and a target that
   * moved with the scroll would be a target that moved mid-flight.
   */
  const [landsAt, setLandsAt] = useState(0)

  // The code being typed, and the check it goes through before departure.
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const leaving = elapsed !== null
  const wobble = elapsed === null ? 0 : Math.min(1, elapsed / WOBBLE_MS)
  const progress = elapsed === null
    ? 0
    : smooth(Math.max(0, Math.min(1, (elapsed - WOBBLE_MS) / TRAVEL_MS)))

  useEffect(() => {
    router.prefetch('/golf')
    router.prefetch('/dashboard/create')
    router.prefetch('/join')
  }, [router])

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
  }, [])

  /** Run the collapse, then go. Every way off this page comes through here. */
  function depart(href: string) {
    // A second tap while the first is running would start a second
    // animation over the top of it
    if (going.current) return
    going.current = true

    // Asked for less motion: go straight there, no collapse, no fade
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      router.push(href)
      return
    }

    // Where the top of the screen is, before anything moves.
    setLandsAt(window.scrollY)
    setElapsed(0)

    // The clock comes from the frame itself rather than from a reading
    // taken beforehand, so the first frame is t=0 however long the browser
    // took to schedule it.
    const total = WOBBLE_MS + TRAVEL_MS
    let start = 0
    const step = (now: number) => {
      if (start === 0) start = now
      const t = now - start
      setElapsed(t)
      if (t < total) {
        frame.current = requestAnimationFrame(step)
      } else {
        frame.current = null
        router.push(href)
      }
    }
    frame.current = requestAnimationFrame(step)
  }

  function leave(href: string) {
    return (e: React.MouseEvent) => {
      // A modified click still does what it always does — open in a new tab
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      depart(href)
    }
  }

  /**
   * The code is checked before the mark moves: a wrong one gets its answer
   * here, on the screen it was typed on, rather than after an animation
   * that promised it was right.
   */
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (checking || going.current) return
    setError('')
    setChecking(true)

    const entered = code.toUpperCase().trim()
    try {
      // Imported when asked for rather than at the top of the file: this
      // page renders without Supabase configured (the tests do exactly
      // that), and nothing else on it needs a database.
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase
        .from('trips')
        .select('trip_code')
        .eq('trip_code', entered)
        .single()

      if (!data) {
        setError('Event not found — check the code and try again')
        setChecking(false)
        return
      }

      setChecking(false)
      depart(`/trip/${data.trip_code}`)
    } catch {
      setError('Could not check the code — try again')
      setChecking(false)
    }
  }

  return (
    <main className="min-h-dvh bg-cream page-enter">

      {/* No trip to go back to yet, so the mark is not a link. It stands
          full size until a tap sends it up into the bar.

          Unpinned here alone: the mark stands below the bar rather than in
          it, so pinning held it over the page while the sentence and the form
          scrolled up through the letterforms. It scrolls with them now, and
          `landsAt` is what still lets it collapse onto the screen the finger
          is looking at. */}
      <TripHeader
        progress={progress}
        wobble={wobble}
        pinned={false}
        lineOffsetY={landsAt}
      />

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

          {/* One line saying what the platform is. The controls sit directly
              below, so it can point at them without naming them twice. */}
          <p className="t-body text-ink/80 text-center text-balance max-w-[20rem]">
            Live scoring and leaderboards for your event.
          </p>

          {/* Holding a code is the common case, so the box for it is the
              first thing under the sentence — no screen in between. */}
          <form onSubmit={handleJoin} className="w-full flex flex-col gap-3 mt-10">
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
              maxLength={6}
              placeholder="EVENT CODE"
              aria-label="Event code"
              className="w-full py-4 px-5 bg-surface border border-bark/12 rounded-xl text-ink text-xl tracking-[0.4em] uppercase text-center placeholder:text-ink/50 placeholder:text-base placeholder:tracking-[0.25em] focus:outline-none focus:border-accent/60 transition-colors"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />

            {error && (
              <p className="text-rust-deep text-sm text-center leading-snug">{error}</p>
            )}

            <button
              type="submit"
              disabled={checking || code.trim().length < 6}
              className={buttonClass('primary')}
            >
              {checking ? 'Checking…' : 'Join Event'}
            </button>
          </form>

          <div className="w-full flex items-center gap-3 my-6" aria-hidden="true">
            <span className="h-px flex-1 bg-bark/12" />
            <span className="t-cap text-ink/50 uppercase tracking-[0.18em]">or</span>
            <span className="h-px flex-1 bg-bark/12" />
          </div>

          {/* Still a real link: it prefetches, it survives a long press,
              and without JavaScript it simply navigates. */}
          <Link
            href="/golf"
            onClick={leave('/golf')}
            className={buttonClass('secondary')}
          >
            Create an Event
          </Link>

          {/* Set as a quotation rather than as a sentence: the words sit on
              their own and the name steps out from under them, down and to
              the right, which is where an attribution has always gone. The
              figure is what carries the width, so the name's right edge is
              the quotation's right edge and not the screen's. */}
          <figure className="mt-12 max-w-[19rem]">
            <blockquote className="t-cap text-ink/65 text-balance">
              &ldquo;Right now that dot is both green and not green. You decide
              what it becomes&rdquo;
            </blockquote>
            <figcaption className="t-cap text-ink/50 mt-1.5 text-right">
              &ndash; Erwin Schr&ouml;dinger
            </figcaption>
          </figure>
        </div>
      </div>
    </main>
  )
}
