'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import Wordmark from './Wordmark'

/**
 * The mark at the top of every trip screen, and the way back to the trip.
 *
 * Two behaviours, one component:
 *
 *   morph  The trip hub. The stacked mark stands full size in the hero and,
 *          as you scroll, rises and contracts into the single-line mark in
 *          the header — so the header is where the logo went, not a second
 *          logo that happens to be there too.
 *
 *   fixed  The leaderboard and the scoring screens. Just the single-line
 *          mark, sticky from the first pixel. Those screens are read while
 *          standing on a tee; nothing on them should be moving that is not
 *          a score.
 *
 * Tapping it goes to the trip hub, from anywhere.
 */

/** Header height. The leaderboard's own sticky row sits directly below it. */
export const HEADER_H = 52

/** Scroll distance the morph takes. Short enough to finish in one flick. */
const TRAVEL = 132


/**
 * How far through the morph the page has scrolled, 0 → 1.
 *
 * One hook rather than a copy in each component: they have to agree exactly,
 * or the stacked mark and the header mark drift apart mid-scroll and the
 * illusion breaks. Sharing it also means the reduced-motion escape and the
 * frame coalescing exist once and cannot be true in one place and not the
 * other.
 *
 * Returns 1 immediately for anyone who asked for less motion — the end state,
 * not a slower version of the journey.
 */
function useScrollProgress(enabled: boolean): { progress: number; reduced: boolean } {
  const [progress, setProgress] = useState(enabled ? 0 : 1)
  const [reduced, setReduced] = useState(false)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (query.matches) { setReduced(true); setProgress(1); return }

    const read = () => {
      frame.current = null
      setProgress(Math.min(1, Math.max(0, (window.scrollY || 0) / TRAVEL)))
    }
    // Scroll fires constantly on a phone, so the work is coalesced into a
    // frame and the listener is passive so it can never block the scroll.
    const onScroll = () => {
      if (frame.current === null) frame.current = requestAnimationFrame(read)
    }

    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [enabled])

  return { progress, reduced }
}

export default function TripHeader({
  tripCode,
  variant = 'fixed',
}: {
  tripCode: string
  variant?: 'fixed' | 'morph'
}) {
  // 0 = the mark is still in the hero, 1 = it has arrived in the header.
  const { progress, reduced } = useScrollProgress(variant === 'morph')

  // The line mark arrives over the back half of the travel, so the two are
  // never both at full strength — that overlap is what reads as a morph
  // rather than as one thing swapping for another.
  const arrival = Math.max(0, (progress - 0.45) / 0.55)
  const settled = variant === 'fixed' || reduced || arrival >= 1

  return (
    <header
      className="sticky top-0 z-30 bg-cream/95 backdrop-blur-[2px]"
      style={{
        height: HEADER_H,
        // The rule appears only once the mark has, so an untouched hub has no
        // line across it.
        borderBottom: `1px solid rgba(74, 55, 40, ${0.12 * arrival})`,
      }}
    >
      <div className="max-w-lg mx-auto h-full px-4 flex items-center">
        <Link
          href={`/trip/${tripCode}`}
          aria-label="Back to the trip"
          className="inline-flex items-center h-full -ml-1 px-1 rounded-lg"
          style={{
            opacity: settled ? 1 : arrival,
            // Rises the last few pixels into place rather than fading in flat
            transform: `translateY(${(1 - arrival) * 6}px)`,
            transition: 'none',
            pointerEvents: arrival > 0.5 ? 'auto' : 'none',
          }}
        >
          <Wordmark variant="line" width={118} />
        </Link>
      </div>
    </header>
  )
}

/**
 * The stacked mark in the hub's hero, which is the thing that appears to
 * become the header.
 *
 * It shrinks towards the header's size and rises towards it, so the two
 * movements meet. Kept as a separate export because it lives in the page
 * body, not in the header, and only the hub has one.
 */
export function HeroWordmark() {
  const { progress, reduced } = useScrollProgress(true)

  // Leaves over the front half, as the line mark is arriving over the back.
  const leaving = reduced ? 0 : Math.min(1, progress / 0.7)

  return (
    <div
      className="flex justify-center"
      style={{
        // Scale and lift, not a fade in place: the mark should look like it
        // went somewhere, and where it went is the header.
        transform: `translateY(${-leaving * 34}px) scale(${1 - leaving * 0.42})`,
        opacity: 1 - leaving,
        transformOrigin: 'center top',
        transition: 'none',
        // Collapses its own height as it goes, so the page does not keep a
        // hole where it used to be.
        marginBottom: `${-leaving * 40}px`,
        pointerEvents: leaving > 0.5 ? 'none' : 'auto',
      }}
    >
      <Wordmark variant="stacked" width={200} priority ariaHidden />
    </div>
  )
}
