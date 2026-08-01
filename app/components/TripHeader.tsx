'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import MorphWordmark from './MorphWordmark'
import { STACKED_BOX, LINE_BOX } from './wordmarkMorph'

/**
 * The mark at the top of every trip screen, and the way back to the trip.
 *
 * Two behaviours, one component:
 *
 *   morph  The trip hub. The mark stands full size below the header and
 *          travels up into it as the page scrolls, one word at a time. The
 *          page itself stays put while that happens — the first pull of the
 *          scroll moves only the logo, and the content catches up once the
 *          mark has landed.
 *
 *   fixed  The leaderboard and the scoring screens. The settled line mark,
 *          from the first pixel, never moving. Those screens are read while
 *          standing on a tee; nothing on them should move that is not a
 *          score.
 *
 * Tapping it goes to the trip hub, from anywhere.
 */

/** Header height. The leaderboard's own sticky row sits directly below it. */
export const HEADER_H = 52

/** Width of the mark at each end of the journey. */
const HERO_W = 210
const LINE_W = 118

/** How far below the header the mark stands at rest. */
const HERO_TOP = 96

/** The height of the mark at rest, from the artwork's own proportions. */
const HERO_H = (STACKED_BOX[3] / STACKED_BOX[2]) * HERO_W

/**
 * The room the mark occupies below the header before it moves.
 *
 * This is also the scroll distance the whole animation takes, and the two
 * being equal is what pins the page: the spacer shrinks by exactly as much
 * as the page has scrolled, so the content underneath does not move until
 * the mark has arrived and the spacer is spent.
 */
export const HERO_SPACE = HERO_TOP + HERO_H + 28

/**
 * How far through the morph the page has scrolled, 0 → 1.
 *
 * One hook rather than a copy in each component: the mark and the space
 * reserved for it have to agree exactly, or the page shifts under the
 * animation. Sharing it also means the reduced-motion escape and the frame
 * coalescing exist once and cannot be true in one place and not the other.
 *
 * Returns 1 immediately for anyone who asked for less motion — the end state,
 * not a slower version of the journey.
 */
export function useScrollProgress(enabled: boolean): { progress: number; reduced: boolean } {
  const [progress, setProgress] = useState(enabled ? 0 : 1)
  const [reduced, setReduced] = useState(false)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (query.matches) { setReduced(true); setProgress(1); return }

    const read = () => {
      frame.current = null
      setProgress(Math.min(1, Math.max(0, (window.scrollY || 0) / HERO_SPACE)))
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
  const { progress, reduced } = useScrollProgress(variant === 'morph')
  const settled = variant === 'fixed' || reduced
  const t = settled ? 1 : progress

  // The mark centres itself at rest, which means knowing how wide the row is.
  // Measured rather than assumed: this is a phone-first app and the row is
  // whatever the viewport allows, up to max-w-lg.
  const row = useRef<HTMLDivElement>(null)
  const [rowWidth, setRowWidth] = useState(0)

  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const measure = () => setRowWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Where the mark stands at rest, and where it ends up. Both are top-left
  // corners inside the header's row.
  //
  // The horizontal pair is the reason nothing ever moves right: at rest the
  // mark is centred and wide, and it ends left-aligned and narrow, so every
  // word in it travels leftwards to get there.
  const lineH = (LINE_BOX[3] / LINE_BOX[2]) * LINE_W
  const heroOrigin: [number, number] = [
    rowWidth > 0 ? (rowWidth - HERO_W) / 2 : 0,
    HERO_TOP,
  ]
  const lineOrigin: [number, number] = [0, (HEADER_H - lineH) / 2]

  return (
    <header
      className="sticky top-0 z-30"
      style={{
        height: HEADER_H,
        // The bar itself only appears once the mark has arrived, so an
        // untouched hub has no band across the top of it.
        backgroundColor: `rgba(246, 244, 240, ${0.4 + 0.55 * t})`,
        borderBottom: `1px solid rgba(74, 55, 40, ${0.12 * t})`,
        backdropFilter: t > 0.9 ? 'blur(2px)' : undefined,
      }}
    >
      <div ref={row} className="max-w-lg mx-auto h-full px-4 relative">
        <Link
          href={`/trip/${tripCode}`}
          aria-label="Back to the trip"
          className="absolute inset-0 rounded-lg"
          // The tap target is the header bar itself. The mark overflows it
          // while it is still down in the hero, and a link the size of the
          // mark would then swallow taps meant for the page behind it.
          style={{ zIndex: 1 }}
        />
        <MorphWordmark
          progress={t}
          heroWidth={HERO_W}
          lineWidth={LINE_W}
          heroOrigin={heroOrigin}
          lineOrigin={lineOrigin}
        />
      </div>
    </header>
  )
}

/**
 * The room the mark needs while it is still standing below the header.
 *
 * The mark lives in the header and is drawn over the page, so without this
 * the hub's content would start underneath it. Because the spacer shrinks by
 * exactly the distance scrolled, the content below holds still while the mark
 * moves — the first pull of the scroll animates the logo and nothing else.
 * Once the spacer is spent, the page scrolls normally.
 */
export function HeroWordmarkSpace() {
  const { progress, reduced } = useScrollProgress(true)
  const t = reduced ? 1 : progress
  return <div aria-hidden="true" style={{ height: HERO_SPACE * (1 - t) }} />
}
