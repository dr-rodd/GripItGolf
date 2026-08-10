'use client'

import { useEffect, useRef, useState } from 'react'

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
 * different number of characters on every phone width, so the component
 * asks the collapsed paragraph if it had to cut, and re-asks on resize.
 */
export default function TripDescription({ text }: { text: string | null | undefined }) {
  const body = String(text ?? '').trim()
  const [expanded, setExpanded] = useState(false)
  const [clipped, setClipped] = useState(false)
  const para = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = para.current
    if (!el) return
    const measure = () => {
      // Only meaningful while collapsed — expanded, nothing is cut, and the
      // answer from before the tap is the one that still matters.
      if (!el.classList.contains('line-clamp-3')) return
      setClipped(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [body])

  if (!body) return null

  const paragraph = (
    <p
      ref={para}
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
