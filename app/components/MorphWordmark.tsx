'use client'

import { STACKED_BOX, LINE_BOX, MORPH_WORDS } from './wordmarkMorph'

/**
 * The wordmark, mid-transformation.
 *
 * One SVG containing the artwork's own paths, grouped by word. The stacked
 * layout and the single-line layout are the same four groups at different
 * offsets, so moving between them is a real transformation rather than one
 * image fading into another: nothing crossfades, and no letter is ever drawn
 * twice.
 *
 * Every word travels on its own curve, which is what stops it reading as a
 * single block sliding about:
 *
 *   green  goes first and arrives early — it is the anchor the rest line up
 *          against, so it settles while the others are still moving
 *   dot    starts a beat later and travels furthest, up and across, so it
 *          appears to follow green rather than accompany it
 *   golf   leaves. It is not in the line mark, so it slides out and fades
 *          while the other two are still climbing
 *   .      the emerald dot goes last, up and then across, landing after the
 *          words have settled — punctuation arriving at the end of a sentence
 *
 * The offsets come from wordmarkMorph.ts, which is generated from the
 * artwork. Replace the logo, re-run `npm run logo:line`, and the animation
 * still lands in the right place.
 */

type Window = [number, number]

/**
 * When each word moves, on each axis, as a fraction of the whole scroll.
 *
 * The two axes are separate on purpose. Moving a word diagonally is the
 * obvious thing to do and it looks wrong: "dot" sits below "green" and ends
 * up to its right, so a straight diagonal drags it clean through the middle
 * of the other word. Letters collide, and for about a third of the travel it
 * reads as an inky mess.
 *
 * Sliding across first and only then rising keeps every word in clear air —
 * and it is what the movement wants to be anyway: things get out of the way,
 * then settle into line.
 */
const TIMING: Record<string, { x: Window; y: Window }> = {
  // Leaves first, so the room it vacates is free before anything needs it
  golf:  { x: [0.00, 0.44], y: [0.00, 0.44] },
  // The anchor. It has nowhere to go relative to the others, but it is the
  // thing the rest line up against, so it settles early.
  green: { x: [0.02, 0.60], y: [0.02, 0.60] },
  // Across into open space first, then up onto the line beside green
  dot:   { x: [0.10, 0.62], y: [0.48, 0.92] },
  // Last, and by the same route: out to the end, then up. Punctuation
  // arriving after the sentence it belongs to.
  mark:  { x: [0.26, 0.74], y: [0.58, 1.00] },
}

/** How the frame closes in around the mark as the words come together. */
const BOX: Window = [0.05, 0.95]

/** Decelerating. The style guide allows ease-out and nothing springier. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function ramp([start, end]: Window, progress: number): number {
  if (progress <= start) return 0
  if (progress >= end) return 1
  return easeOut((progress - start) / (end - start))
}

/** Where one word is on one axis, given how far the page has scrolled. */
function at(id: string, axis: 'x' | 'y', progress: number): number {
  const w = TIMING[id]
  return w ? ramp(w[axis], progress) : ramp([0, 1], progress)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export default function MorphWordmark({
  progress,
  width,
  className = '',
}: {
  /** 0 = stacked, 1 = the single line. */
  progress: number
  width: number
  className?: string
}) {
  // The frame closes in around the mark as the words come together.
  const box = ramp(BOX, progress)
  const viewBox = STACKED_BOX.map((v, i) => lerp(v, LINE_BOX[i], box))

  return (
    <svg
      viewBox={viewBox.join(' ')}
      width={width}
      // Height comes from the viewBox, so the element reshapes as the crop
      // does and the layout around it never has to be told.
      style={{ width, height: 'auto', overflow: 'visible' }}
      className={className}
      role="img"
      aria-label="green dot."
      xmlns="http://www.w3.org/2000/svg"
    >
      {MORPH_WORDS.map(word => {
        const tx = at(word.id, 'x', progress)
        const ty = at(word.id, 'y', progress)
        // Fading is tied to the horizontal run, which is the one that takes
        // golf off the edge — it should be gone by the time it gets there.
        const t = tx
        return (
          <g
            key={word.id}
            transform={`translate(${word.dx * tx}, ${word.dy * ty})`}
            // Only golf fades, and only because it is leaving. Everything
            // else is opaque throughout — a word that dims mid-move reads as
            // a crossfade, which is the thing this replaces.
            opacity={word.fades ? Math.max(0, 1 - t * 1.35) : 1}
            dangerouslySetInnerHTML={{ __html: word.body }}
          />
        )
      })}
    </svg>
  )
}
