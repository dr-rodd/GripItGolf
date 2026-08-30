'use client'

import { useEffect, useState } from 'react'

/**
 * What the lead player wrote about the trip, under the countdown.
 *
 * Part of the heading's column, on the cream — not a card. A card is for
 * things the hub *does*; this is a fourth line of what the trip *is*, after
 * the name, the dates and the countdown, and boxing it would promote it
 * over all three.
 *
 * Three lines, then an ellipsis. The clamp is the browser's own
 * (`line-clamp`), so the … appears exactly where the cut is, and the whole
 * paragraph is the tap target — no separate "more" link to hunt for on a
 * phone. Tapping toggles; a description short enough to fit is not
 * tappable at all, because a control that does nothing is worse than none.
 *
 * Whether it overflows is measured, not guessed: three lines of text is a
 * different number of characters on every phone width. And it is measured
 * more than once, which is the whole of the "the tap does nothing" bug:
 *
 *   · **The display face arrives after first paint.** A single measurement
 *     on mount asked the fallback font how tall the paragraph was, and a
 *     description that clipped once the real face swapped in stayed
 *     un-tappable, ellipsis and all. `document.fonts.ready` re-asks.
 *   · **The paragraph's own width changes without the window's.** A resize
 *     listener never fires for a sibling appearing above, an orientation
 *     settling, or the scrollbar coming and going. A `ResizeObserver` on the
 *     paragraph itself sees all three.
 *   · **The paragraph is a different DOM node once it becomes tappable** —
 *     it moves from a `<div>` into a `<button>`, so React builds a new one.
 *     The element is therefore held in state rather than a ref, so the
 *     effect re-runs on the node that is actually on screen; an observer
 *     bound to the old one would have been watching a detached element.
 */
export default function TripDescription({ text }: { text: string | null | undefined }) {
  const body = String(text ?? '').trim()
  const [expanded, setExpanded] = useState(false)
  const [clipped, setClipped] = useState(false)
  const [para, setPara] = useState<HTMLParagraphElement | null>(null)

  useEffect(() => {
    if (!para) return
    const measure = () => {
      // Only meaningful while collapsed — expanded, nothing is cut, and the
      // answer from before the tap is the one that still matters.
      if (!para.classList.contains('line-clamp-3')) return
      setClipped(para.scrollHeight > para.clientHeight + 1)
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(para)

    // Fonts settle after the first paint, and the swap changes the height
    // without changing any box this observer watches.
    let live = true
    document.fonts?.ready.then(() => { if (live) measure() }).catch(() => {})

    return () => { live = false; observer.disconnect() }
  }, [para, body])

  if (!body) return null

  const paragraph = (
    <p
      ref={setPara}
      className={`t-body text-ink/80 whitespace-pre-line text-center ${expanded ? '' : 'line-clamp-3'}`}
    >
      {body}
    </p>
  )

  if (!clipped && !expanded) {
    return <div className="mt-3 max-w-[34rem]">{paragraph}</div>
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(e => !e)}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse the trip description' : 'Expand the trip description'}
      className="mt-3 max-w-[34rem] text-left transition-opacity duration-150 active:opacity-70"
    >
      {paragraph}
    </button>
  )
}
