'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'
import MorphWordmark from './MorphWordmark'
import TitleMark, { type TitleMarkKey } from './TitleMark'
import { LINE_BOX } from './wordmarkMorph'
import {
  HEADER_H, HERO_W, LINE_W, HERO_TOP, LINE_INSET,
} from './headerMetrics'

/**
 * The mark at the top of the screen, and the way back to the trip.
 *
 * Settled everywhere by default: the mark sits in the bar from the first
 * pixel and never moves. These screens are read standing on a tee, and
 * nothing on them should move that is not a score.
 *
 * The landing page is the exception, and it drives the movement itself by
 * passing `progress`. The header only renders the position it is handed —
 * it has no opinion about what moves the mark or how long it takes, which
 * is what lets the entry screen animate the collapse on a tap rather than
 * against a finger on a scrollbar.
 *
 * What sits in the bar is either the green dot mark or the page's own name
 * as artwork — "leaderboard.", "settings.", "scoring." — set at the same
 * height, in the same place, so moving between screens changes the word and
 * nothing else.
 *
 * Tapping it goes to the trip hub. Without a trip to go back to — the
 * landing page — it is not a link at all.
 */

export default function TripHeader({
  tripCode,
  title = 'green-dot',
  progress,
}: {
  /** The trip to go back to. Omitted where there is no trip yet. */
  tripCode?: string
  /** What stands in the bar: the mark, or this page's name as artwork. */
  title?: 'green-dot' | TitleMarkKey
  /**
   * How far the mark has travelled from its full size into the bar, 0 → 1.
   *
   * Left out on every screen but the landing page, where it settles at once.
   * The landing page hands in a number it is animating itself, so the header
   * has no opinion about what drives the movement or how long it takes.
   */
  progress?: number
}) {
  // A named page has no stacked form to collapse out of, and the word is a
  // label rather than a brand moment — so it is always settled.
  const t = title === 'green-dot' ? (progress ?? 1) : 1

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
        {tripCode && (
          <Link
            href={`/trip/${tripCode}`}
            aria-label="Back to the trip"
            className="absolute inset-0 rounded-lg"
            // The tap target is the header bar itself. The mark overflows it
            // while it is still down in the hero, and a link the size of the
            // mark would then swallow taps meant for the page behind it.
            style={{ zIndex: 1 }}
          />
        )}
        {title === 'green-dot' ? (
          <MorphWordmark
            progress={t}
            heroWidth={HERO_W}
            lineWidth={LINE_W}
            heroOrigin={heroOrigin}
            lineOrigin={lineOrigin}
          />
        ) : (
          // Exactly where the line mark comes to rest, and exactly as tall,
          // so a page that names itself and a page that shows the mark put
          // the same weight in the same place.
          <span
            className="absolute pointer-events-none"
            style={{ left: lineOrigin[0], top: lineOrigin[1] }}
          >
            <TitleMark name={title} height={lineH} />
          </span>
        )}
      </div>
    </header>
  )
}
