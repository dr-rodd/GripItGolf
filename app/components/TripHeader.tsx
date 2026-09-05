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
  backTo,
  title = 'green-dot',
  progress,
  wobble,
  action,
  pinned = true,
  lineOffsetY = 0,
}: {
  /**
   * Where tapping the mark goes — the trip hub from inside a trip, the
   * start from the screens that come before one. Omitted on the landing
   * page, which is already there.
   */
  backTo?: string
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
  /** How far through the shake that precedes the move, 0 → 1. */
  wobble?: number
  /**
   * One small control at the bar's right edge — the trip hub's preferences
   * gear. Sat above the backTo link (which is the whole bar), so it stays
   * tappable; kept to the header so it is in the same corner a phone puts
   * its own settings.
   */
  action?: React.ReactNode
  /**
   * Whether the bar holds the top of the screen as the page scrolls.
   *
   * True everywhere but the landing page. There the mark stands *below* the
   * bar rather than in it, so a pinned header holds a 145px mark over open
   * page — and once the event code box made the front page taller than a
   * phone screen, the sentence and the form scrolled up through the
   * letterforms. Unpinned, the mark scrolls with everything else and nothing
   * can pass behind it.
   *
   * A backdrop under the mark would have hidden the overlap without moving
   * anything, and was tried. It hides more than the overlap: the code box
   * scrolls under it too — and on a phone the keyboard's own scroll puts it
   * there, so tapping the box could slide it behind an invisible sheet.
   */
  pinned?: boolean
  /**
   * Where the mark comes to rest, shifted down the page by this many px.
   *
   * For the landing page's departure while the page is scrolled. The bar sits
   * at the top of the *document* there rather than the top of the screen, so
   * without this the mark would collapse to a point above the viewport and
   * the whole animation would happen off screen. Handed the scroll position
   * as the tap lands, it collapses to the top of the screen instead — which
   * is exactly where the next page's bar draws it.
   */
  lineOffsetY?: number
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
  const lineOrigin: [number, number] = [
    LINE_INSET,
    (HEADER_H - lineH) / 2 + lineOffsetY,
  ]

  return (
    <header
      className={`${pinned ? 'sticky' : 'relative'} top-0 z-30`}
      style={{
        height: HEADER_H,
        // The bar itself only appears once the mark has arrived, so an
        // untouched hub has no band across the top of it. Mixed from the
        // tokens rather than baked rgba, so the bar is cream by day and dark
        // by night without this file knowing which.
        backgroundColor: `color-mix(in srgb, var(--color-cream) ${(0.4 + 0.55 * t) * 100}%, transparent)`,
        borderBottom: `1px solid color-mix(in srgb, var(--color-bark) ${12 * t}%, transparent)`,
        backdropFilter: t > 0.9 ? 'blur(2px)' : undefined,
      }}
    >
      <div ref={row} className="max-w-lg mx-auto h-full px-4 relative">
        {backTo && (
          <Link
            href={backTo}
            // Only a logo, so where it goes has to be said out loud
            aria-label={backTo === '/' ? 'Back to the start' : 'Back to the trip'}
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
            wobble={wobble}
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
        {action && (
          <span
            className="absolute flex items-center"
            // Above the backTo link (zIndex 1), which is the whole bar —
            // without this the gear would be a picture of a button.
            style={{ right: 8, top: 0, height: HEADER_H, zIndex: 2 }}
          >
            {action}
          </span>
        )}
      </div>
    </header>
  )
}
