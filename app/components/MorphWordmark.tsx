'use client'

import { STACKED_BOX, LINE_BOX, MORPH_WORDS } from './wordmarkMorph'

/**
 * The wordmark, mid-transformation.
 *
 * Each word is its own small SVG holding the artwork's own paths, positioned
 * in screen pixels. The stacked layout and the single-line layout are the
 * same four words at different sizes and places, so moving between them is a
 * real transformation — nothing crossfades, and no letter is drawn twice.
 *
 * ── Why every word is positioned individually ──────────────────
 *
 * The obvious build is one SVG that scales as a whole, with the words nudged
 * about inside it. That produced a visible jag: inside the frame, "dot" has
 * to travel right to reach its place after "green", so it lurched right while
 * the mark as a whole was moving left.
 *
 * Positioned in screen space, that disappears. The mark shrinks towards its
 * left edge, so as it contracts *every* word genuinely moves left — "green"
 * furthest, "dot" less far, but both in the same direction. What looked like
 * two fights is one movement.
 *
 * ── Up, then left ──────────────────────────────────────────────
 *
 * No word moves in two directions at once. Each rises to the header line
 * first, then slides left into place, and the words are staggered so the eye
 * follows one at a time:
 *
 *   green  goes first — the whole first pull of the scroll is just this,
 *          which is what clears the headroom for everything else
 *   dot    follows a beat later, up and then left
 *   golf   is not in the line mark, so it drops out from under the others
 *          and fades. Down rather than up: it is the bottom line, and going
 *          up would take it straight through "dot" and then "green"
 *   .      last, by the same route, arriving after the words have settled
 *
 * The geometry is generated from the artwork by `npm run logo:line`. Replace
 * the logo, re-run it, and the animation still lands.
 */

type Window = [number, number]

/**
 * When each word moves, on each axis, as a fraction of the whole scroll.
 *
 * Vertical always finishes before horizontal begins for the same word — that
 * is the "up, then left" rule, and breaking it is what made the first version
 * look jagged. The words overlap each other freely; it is only within a word
 * that the two axes are strictly ordered.
 */
const TIMING: Record<string, { y: Window; x: Window }> = {
  // The first pull of the scroll is green rising, alone.
  green: { y: [0.00, 0.26], x: [0.26, 0.50] },
  // Only once green has moved left. Rising while green still sat in the
  // middle put the two words on top of each other for a quarter of the
  // travel — dot has to come up into space green has already vacated.
  dot:   { y: [0.44, 0.68], x: [0.68, 0.90] },
  // Straight down and out, never sideways. It is the only word heading that
  // way, so it crosses nothing on its way off the screen.
  golf:  { y: [0.00, 0.42], x: [0.00, 0.00] },
  // Last, after the words have settled. Punctuation follows its sentence.
  mark:  { y: [0.60, 0.82], x: [0.82, 1.00] },
}

/** How the whole mark shrinks. Runs under everything, start to finish. */
const SIZE: Window = [0.00, 0.86]

/**
 * How far the leaving word drops, in screen pixels.
 *
 * Deliberately not expressed in the artwork's units like everything else.
 * Those get multiplied by a scale that shrinks to a third over the travel,
 * so a generous drop in source units came out as a small one on screen — and
 * because the rest of the mark was rising past it, golf appeared to drift
 * *upwards*. Leaving the frame is a screen-space idea, so it is measured in
 * screen space.
 */
const EXIT_DROP = 150

/** Decelerating. The style guide allows ease-out and nothing more elastic. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function ramp([start, end]: Window, progress: number): number {
  if (end <= start) return progress >= end ? 1 : 0
  if (progress <= start) return 0
  if (progress >= end) return 1
  return easeOut((progress - start) / (end - start))
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export default function MorphWordmark({
  progress,
  heroWidth,
  lineWidth,
  heroOrigin,
  lineOrigin,
  className = '',
}: {
  /** 0 = stacked, 1 = the single line. */
  progress: number
  /** Width of the whole mark at rest, in px. */
  heroWidth: number
  /** Width of the whole mark once it is in the header, in px. */
  lineWidth: number
  /** Top-left of the whole mark at rest, in px within the positioned parent. */
  heroOrigin: readonly [number, number]
  /** Top-left of the whole mark once it has arrived. */
  lineOrigin: readonly [number, number]
  className?: string
}) {
  // The mark's overall scale, from source units to screen px. One curve for
  // the whole mark: the words rearrange within it, but they shrink together.
  const size = ramp(SIZE, progress)
  const unit = lerp(heroWidth / STACKED_BOX[2], lineWidth / LINE_BOX[2], size)

  // Every word interpolates between two real screen positions, rather than
  // being nudged about inside a frame that is itself moving. That is what
  // keeps the motion honest: the mark shrinks towards its left edge, so as
  // it contracts each word moves left, and none of them ever moves right.
  const words = MORPH_WORDS.map(word => {
    const ty = ramp(TIMING[word.id].y, progress)
    const tx = ramp(TIMING[word.id].x, progress)

    const fromX = heroOrigin[0] + (word.stacked[0] - STACKED_BOX[0]) * unit
    const fromY = heroOrigin[1] + (word.stacked[1] - STACKED_BOX[1]) * unit

    // The word that leaves has no place in the line layout, so it goes
    // straight down from wherever it is, by a distance in pixels.
    const toX = word.fades
      ? fromX
      : lineOrigin[0] + (word.line[0] - LINE_BOX[0]) * unit
    const toY = word.fades
      ? fromY + EXIT_DROP
      : lineOrigin[1] + (word.line[1] - LINE_BOX[1]) * unit

    return {
      ...word,
      left: lerp(fromX, toX, tx),
      top:  lerp(fromY, toY, ty),
      width: word.box[2] * unit,
      // Only the word that leaves fades, and only as it leaves the frame.
      opacity: word.fades ? Math.max(0, 1 - ty * 1.8) : 1,
    }
  })

  return (
    <div
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      role="img"
      aria-label="green dot."
    >
      {words.map(w => (
        <svg
          key={w.id}
          viewBox={w.box.join(' ')}
          style={{
            position: 'absolute',
            left: w.left,
            top: w.top,
            width: w.width,
            height: 'auto',
            opacity: w.opacity,
            // Driven entirely by scroll, so a CSS transition here would fight
            // the position rather than smooth it.
            transition: 'none',
          }}
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          dangerouslySetInnerHTML={{ __html: w.body }}
        />
      ))}
    </div>
  )
}
