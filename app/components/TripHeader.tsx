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
const HERO_W = 196
const LINE_W = 118

/** How far below the header the mark stands at rest. */
const HERO_TOP = 58

/** The mark's resting distance from the left edge once it has landed. */
const LINE_INSET = 6

/** The height of the mark at rest, from the artwork's own proportions. */
const HERO_H = (STACKED_BOX[3] / STACKED_BOX[2]) * HERO_W

/** The room the mark occupies below the header before it moves. */
export const HERO_SPACE = HERO_TOP + HERO_H + 20

/**
 * The scroll the whole sequence takes.
 *
 * Deliberately longer than the space the mark occupies. They used to be the
 * same number, which left the page's catch-up crammed into whatever scroll
 * was left after the mark had landed — the content shot up two or three
 * times faster than the finger moving it. Giving the sequence more room lets
 * the collapse finish unhurried and the page follow at a readable speed.
 */
const TRAVEL = Math.round(HERO_SPACE * 1.7)

/**
 * How far through the scroll the page starts catching up.
 *
 * Before this the content is completely still — the scroll moves the logo and
 * nothing else. After it the gap the mark leaves closes and the page comes up
 * to meet the header.
 */
const RELEASE_AT = 0.68

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
  const lineOrigin: [number, number] = [LINE_INSET, (HEADER_H - lineH) / 2]

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
 * Holds the page still while the mark collapses into the header.
 *
 * Wraps everything on the hub below the header. Two things happen at once:
 *
 *   · a spacer stands where the mark is, and closes as the mark shrinks
 *   · the whole block is pushed back down by exactly the distance scrolled
 *
 * Together those mean the content does not scroll during the animation — it
 * only rises by as much as the mark above it shrinks, closing the gap the
 * logo leaves behind. The page scrolling past mid-animation was what made
 * the movement hard to follow.
 *
 * Once the mark has landed the offset stops growing and the page scrolls
 * normally from there.
 *
 * Without both halves the arithmetic goes wrong in a way that is easy to
 * miss: a shrinking spacer on its own moves the content up at twice the
 * speed of the scroll, because the spacer is closing and the page is moving.
 */
export function HeroPin({ children }: { children: React.ReactNode }) {
  const { progress, reduced } = useScrollProgress(true)
  const t = reduced ? 1 : progress

  // Pushed down by exactly the distance scrolled. On its own this holds the
  // block completely still: the page moves under it and it does not.
  const offset = TRAVEL * t

  // The gap the mark leaves closes only once the mark has essentially landed.
  // Closing it during the animation is what made the content scroll past
  // mid-movement and pull the eye off the logo.
  //
  // Linear, not eased: this is driven by a finger on a screen, and a curve on
  // top of that reads as the page lurching rather than as the person moving
  // it. The scroll itself supplies the feel.
  const release = Math.min(1, Math.max(0, (t - RELEASE_AT) / (1 - RELEASE_AT)))

  return (
    <div style={{ transform: `translateY(${offset}px)`, willChange: 'transform' }}>
      <div aria-hidden="true" style={{ height: HERO_SPACE * (1 - release) }} />
      {children}
    </div>
  )
}
