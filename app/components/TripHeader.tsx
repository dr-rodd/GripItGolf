'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import MorphWordmark from './MorphWordmark'

/**
 * The mark at the top of every trip screen, and the way back to the trip.
 *
 * Two behaviours, one component:
 *
 *   morph  The trip hub. The mark stands full size below the header and
 *          travels up into it as you scroll — the same element throughout,
 *          its words moving at different rates. Nothing crossfades, so the
 *          header genuinely is where the logo went.
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

/** Scroll distance the morph takes. Short enough to finish in one flick. */
const TRAVEL = 190

/** Width of the mark at each end of the journey. */
const HERO_W = 208
const LINE_W = 118

/** How far below the header the mark starts. */
const HERO_DROP = 104

/**
 * How far through the morph the page has scrolled, 0 → 1.
 *
 * One hook rather than a copy in each component: they have to agree exactly,
 * or the mark and the space reserved for it drift apart mid-scroll. Sharing
 * it also means the reduced-motion escape and the frame coalescing exist
 * once and cannot be true in one place and not the other.
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

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

  // The mark centres itself in the hero, which means knowing how wide the
  // row is. Measured rather than assumed: this is a phone-first app and the
  // row is whatever the viewport allows up to max-w-lg.
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

  // Size, and where it sits. The mark scales about its own left edge, so
  // centring it is a matter of pushing it right by half the leftover room.
  const scale = lerp(HERO_W / LINE_W, 1, t)
  const markW = LINE_W * scale
  const offsetX = rowWidth > 0 ? ((rowWidth - markW) / 2) * (1 - t) : 0
  const offsetY = HERO_DROP * (1 - t)

  return (
    <header
      className="sticky top-0 z-30"
      style={{
        height: HEADER_H,
        // The bar itself only appears once the mark has arrived, so an
        // untouched hub has no band across the top of it.
        backgroundColor: `rgba(246, 244, 240, ${0.35 + 0.6 * t})`,
        borderBottom: `1px solid rgba(74, 55, 40, ${0.12 * t})`,
        backdropFilter: t > 0.9 ? 'blur(2px)' : undefined,
      }}
    >
      <div ref={row} className="max-w-lg mx-auto h-full px-4 relative">
        <Link
          href={`/trip/${tripCode}`}
          aria-label="Back to the trip"
          className="absolute left-4 rounded-lg"
          style={{
            // Anchored to the middle of the bar, then pushed down and out to
            // wherever it is in its journey.
            top: '50%',
            transform: `translate(${offsetX}px, calc(-50% + ${offsetY}px)) scale(${scale})`,
            transformOrigin: 'left center',
            // Driven entirely by scroll, so a CSS transition here would fight
            // the position rather than smooth it.
            transition: 'none',
            willChange: settled ? undefined : 'transform',
          }}
        >
          <MorphWordmark progress={t} width={LINE_W} />
        </Link>
      </div>
    </header>
  )
}

/**
 * The room the mark needs while it is still down in the hero.
 *
 * The mark itself lives in the header and is positioned over the page, so
 * without this the hub's content would start underneath it. The spacer
 * closes as the mark leaves, which is what pulls the page up behind it.
 */
export function HeroWordmarkSpace() {
  const { progress, reduced } = useScrollProgress(true)
  const t = reduced ? 1 : progress
  const height = (HERO_DROP + HERO_W * 0.42) * (1 - t)

  return <div aria-hidden="true" style={{ height, transition: 'none' }} />
}
