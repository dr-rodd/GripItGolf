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

/** Degrees a word tips at the peak of the shake. */
const WOBBLE_DEG = 2.6

/** How many times it swings through before setting off. */
const WOBBLE_CYCLES = 2

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
  // Green leads, and is brisk about it — up quickly, then away left.
  green: { y: [0.00, 0.16], x: [0.16, 0.44] },
  // Rises while green is still sliding left. The only real constraint in the
  // whole sequence is that green must be clear of the spot dot lands on
  // before dot gets there, and easeOut carries green most of the way in the
  // first third of its slide — so dot needs a short head start, not a long
  // wait. Everything past that was dead air.
  dot:   { y: [0.20, 0.50], x: [0.50, 0.74] },
  // Straight down and out, never sideways. It is the only word heading that
  // way, so it crosses nothing on its way off the screen.
  golf:  { y: [0.00, 0.30], x: [0.00, 0.00] },
  // Rises with the words rather than long after them. It still lands last,
  // but because it starts from the far right of the stacked mark and has the
  // furthest to come — not because it waits its turn. A long window here
  // left the last third of the scroll doing nothing.
  mark:  { y: [0.24, 0.52], x: [0.52, 0.80] },
}

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
  wobble = 0,
  heroWidth,
  lineWidth,
  heroOrigin,
  lineOrigin,
  className = '',
}: {
  /** 0 = stacked, 1 = the single line. */
  progress: number
  /**
   * How far through the shake-loose, 0 → 1. The words tip a little, out of
   * step with one another, before any of them travels.
   *
   * Enveloped so it starts and ends at rest: 0 and 1 both sit still, which
   * is what lets it hand over to the move without a seam. Left at 0 on every
   * screen but the one leaving the landing page.
   */
  wobble?: number
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
  // Each word shrinks on its own clock, as it rises.
  //
  // A single shrink for the whole mark looks like a bug: a word's resting
  // position is measured from the mark's left edge, so as the mark contracts
  // every word slides left towards it — before its own move has begun. Words
  // that had not started yet visibly drifted, and the emerald dot in
  // particular ended up adrift of where it began.
  //
  // Tying the scale to the word's own rise means a word that has not moved is
  // exactly where it was, at full size. It shrinks as it climbs, and is at
  // its final size by the time it slides left.
  // The words tip a little before they go. Enveloped by a half sine so the
  // shake grows out of stillness and settles back into it, and each word is
  // a quarter-cycle behind the last so the mark loosens rather than rocking
  // as one block.
  const shake = Math.sin(Math.PI * Math.min(1, Math.max(0, wobble)))

  const heroUnit = heroWidth / STACKED_BOX[2]
  const lineUnit = lineWidth / LINE_BOX[2]

  // Every word interpolates between two real screen positions, rather than
  // being nudged about inside a frame that is itself moving. That is what
  // keeps the motion honest: the mark shrinks towards its left edge, so as
  // it contracts each word moves left, and none of them ever moves right.
  const words = MORPH_WORDS.map((word, i) => {
    const ty = ramp(TIMING[word.id].y, progress)
    const tx = ramp(TIMING[word.id].x, progress)

    // Shrinks with the rise, so it is the right size before it moves across.
    const unit = lerp(heroUnit, lineUnit, ty)

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
      tilt: shake * WOBBLE_DEG
        * Math.sin(2 * Math.PI * WOBBLE_CYCLES * wobble + i * (Math.PI / 2)),
    }
  })

  return (
    <div
      // `gd-mark` is what dark mode hangs off: the words' brown fill is an
      // attribute in the generated markup, and globals.css lifts it to the
      // dark palette's bark under html.dark. The emerald dot keeps its own
      // fill either way.
      className={`gd-mark ${className}`}
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
            // Rotation only — the position is set outright, never scaled or
            // translated, which is what keeps every word moving left.
            transform: w.tilt ? `rotate(${w.tilt.toFixed(3)}deg)` : undefined,
            transformOrigin: 'center',
            // Every frame is computed, so a CSS transition here would fight
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
