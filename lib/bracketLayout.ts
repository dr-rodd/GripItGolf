// Geometry for the two-column bracket view.
//
// The view shows two rounds at once. The left column is the current round at
// standard spacing; the right column is the next round at double spacing, so
// each right-hand tile sits level with the midpoint of the two tiles feeding
// it. Swiping advances a continuous position, so the columns are addressed by
// a *slot* — the signed distance from the left column — which may be
// fractional mid-animation.
//
// Everything here is pure, so the spacing and connector logic can be checked
// across every bracket size without a browser. See scripts/test-bracket-layout.ts.

export type ColumnGeometry = {
  /** Vertical distance between the tops of consecutive tiles. */
  pitch: number
  /** Vertical shift of the whole column, keeping it centred on its feeders. */
  offset: number
}

/**
 * Where a column sits given its slot.
 *
 * Slot 0 is the left column, 1 the right. Each step right doubles the pitch,
 * because each round has half as many matches as the one before. The offset
 * follows from that doubling: a column must start half a pitch lower than the
 * one on its left so its first tile lands between that column's first pair.
 *
 * Both curves are continuous in `slot`, which is the point — during a swipe
 * the slot is fractional, and adjacent columns keep an exact 2:1 pitch ratio
 * at every instant. That is what lets the connectors stay joined mid-animation
 * instead of snapping into place at the end.
 */
export function columnGeometry(slot: number, basePitch: number): ColumnGeometry {
  const scale = Math.pow(2, slot)
  return {
    pitch: basePitch * scale,
    offset: basePitch * (scale - 1) / 2,
  }
}

/** Top edge of the tile at `index` within the column at `slot`. */
export function tileTop(index: number, slot: number, basePitch: number): number {
  const { pitch, offset } = columnGeometry(slot, basePitch)
  return index * pitch + offset
}

/** Vertical centre of a tile — what connectors join to. */
export function tileCenter(
  index: number, slot: number, basePitch: number, tileHeight: number,
): number {
  return tileTop(index, slot, basePitch) + tileHeight / 2
}

/** Horizontal offset of a column from the left edge of the viewport. */
export function columnX(slot: number, stride: number): number {
  return slot * stride
}

/**
 * How far right to nudge the whole view, so the last round centres.
 *
 * Every position but the last shows two columns, pinned to the two edges of
 * the screen — which is what makes the pair read as one bracket. The last
 * position has nothing on its right, so the same rule left the Final alone
 * against the left edge with half a screen of nothing beside it, looking like
 * a column that had failed to load rather than the end of the draw.
 *
 * So the view slides right as the last round arrives, until the final tile is
 * centred. It is a **continuous** function of `position`, like everything else
 * here: the slide happens over the same swipe that brings the Final in, so
 * there is no second animation to keep in step with the first, and the
 * connectors stay welded to the tiles throughout because they are offset by
 * the identical number.
 *
 * A bracket of one round — two players, a final and nothing else — is centred
 * outright, since there was never a pair to pin.
 */
export function centringShift(o: {
  position: number
  roundCount: number
  /** The viewport the bracket is drawn in. */
  width: number
  tileWidth: number
}): number {
  if (o.roundCount <= 0) return 0
  const centred = Math.max(0, (o.width - o.tileWidth) / 2)
  // 1 at the last round, 0 at the one before it, proportional between
  const t = Math.min(1, Math.max(0, o.position - (o.roundCount - 2)))
  return centred * t
}

/**
 * Total height a column needs. Columns to the right are spaced twice as far
 * apart but hold half as many tiles, so every column in a bracket spans very
 * nearly the same height — which keeps the view from jumping as you swipe.
 */
export function columnHeight(
  matchCount: number, slot: number, basePitch: number, tileHeight: number,
): number {
  if (matchCount <= 0) return 0
  return tileTop(matchCount - 1, slot, basePitch) + tileHeight
}

/**
 * An SVG path joining a pair of tiles to the single tile they feed.
 *
 * Drawn as the usual bracket bridge: a stub out of each feeder, a vertical
 * spine joining them, and a stub into the target. Coordinates are absolute
 * within the same space the tiles are positioned in, so the path is recomputed
 * from the identical numbers each frame rather than tweened separately.
 */
export function connectorPath(o: {
  feederRightX: number
  feederTopY: number
  feederBottomY: number
  targetLeftX: number
  targetY: number
}): string {
  const midX = (o.feederRightX + o.targetLeftX) / 2
  return [
    `M ${o.feederRightX} ${o.feederTopY} H ${midX}`,
    `M ${o.feederRightX} ${o.feederBottomY} H ${midX}`,
    `M ${midX} ${o.feederTopY} V ${o.feederBottomY}`,
    `M ${midX} ${o.targetY} H ${o.targetLeftX}`,
  ].join(' ')
}

/**
 * Heading for the view — the left column's round only.
 *
 * The right column is the next round and is self-evidently so, so naming both
 * just made the header long enough to truncate on a phone. With one name there
 * is nothing to handle at either end of the bracket: the Final reads "Final".
 */
export function roundHeaderLabel(roundNames: string[], leftIndex: number): string {
  return roundNames[leftIndex] ?? ''
}

/** Clamp a position to the rounds that exist. */
export function clampPosition(position: number, roundCount: number): number {
  if (roundCount <= 1) return 0
  return Math.min(Math.max(position, 0), roundCount - 1)
}

/** Ease-out cubic — quick to start, settles gently. */
export function easeOut(t: number): number {
  const c = Math.min(Math.max(t, 0), 1)
  return 1 - Math.pow(1 - c, 3)
}

// ─── Swiping ───────────────────────────────────────────────────
//
// The gesture, decided here so it can be checked without a finger. Three
// rules, each the fix for something the first version got wrong:
//
//   · **One axis per gesture.** A finger moving up the page is scrolling it,
//     and a few pixels of sideways wobble on the way must not move the
//     bracket — nor, on release, flick it a whole round. The direction is
//     settled once, over the first few pixels, and the gesture is that
//     direction until the finger lifts (`swipeAxis`). The 45° line is the
//     browser's own for `touch-action: pan-y`, so the two always agree on
//     whose gesture it is.
//   · **A swipe is one round, at most** (`dragRange`, `releaseTarget`),
//     landed by distance or by speed — someone swiping to see their
//     player's next match wants that match, not the one after it, however
//     long their thumb's sweep across the screen.
//   · **The bracket closes in on what you are looking at** (`focalY`).
//     Every column is one tree drawn at a scale of 2^-position, so moving a
//     round on halves it; anchored at the top, the half a phone was scrolled
//     to at the bottom of a big draw flew up off the screen. The point under
//     the finger is held still instead, and the page scrolls to keep it so.

/** Pixels a finger travels before the gesture's direction is decided. */
export const SWIPE_SLOP = 8

/** How much of a round a drag must cover to carry on to the next. */
export const SWIPE_COMMIT = 0.22

/** px per ms. Faster than this, a release goes on whatever the distance. */
export const FLICK_SPEED = 0.45

/**
 * Whose gesture this is, from how far the finger has moved: still deciding,
 * the bracket's (sideways) or the page's (up and down).
 */
export function swipeAxis(dx: number, dy: number, slop = SWIPE_SLOP): 'pending' | 'x' | 'y' {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (Math.max(ax, ay) < slop) return 'pending'
  return ax > ay ? 'x' : 'y'
}

/**
 * How far one drag may carry the bracket: a round either side of the round
 * it started on — the nearest, when it caught a settle mid-flight.
 */
export function dragRange(from: number, roundCount: number): [number, number] {
  const base = Math.round(from)
  return [clampPosition(base - 1, roundCount), clampPosition(base + 1, roundCount)]
}

/**
 * Where a released drag settles, as a round index.
 *
 * `velocity` is the finger's speed at the release in px per ms, positive
 * towards later rounds (the finger moving left). A flick goes to the next
 * round in its direction from wherever the bracket stands. Otherwise the
 * drag settles on the nearest round, nudged in the direction it travelled
 * so that `SWIPE_COMMIT` of a round is enough to carry it on.
 */
export function releaseTarget(o: {
  /** Where the drag started (may be mid-animation). */
  from: number
  /** Where the bracket stands now. */
  position: number
  velocity: number
  roundCount: number
}): number {
  const eps = 1e-6
  let target: number
  if (Math.abs(o.velocity) >= FLICK_SPEED) {
    target = o.velocity > 0
      ? Math.floor(o.position + eps) + 1
      : Math.ceil(o.position - eps) - 1
  } else {
    const travelled = o.position - o.from
    target = Math.round(o.position + Math.sign(travelled) * (0.5 - SWIPE_COMMIT))
  }
  const [lo, hi] = dragRange(o.from, o.roundCount)
  return Math.min(hi, Math.max(lo, target))
}

/**
 * How long the bracket takes to settle `distance` rounds: the full swipe
 * time for a round or more, less for the last part of one a finger has
 * already done most of — never so little it reads as a jump.
 */
export function settleMs(distance: number, fullMs: number): number {
  const d = Math.abs(distance)
  return Math.round(fullMs * Math.min(1, Math.max(0.45, d)))
}

/**
 * Where a point in the bracket, `y` down the view at one position, sits at
 * another.
 *
 * A tile's top is b·2^(r−P)·(j + ½) − b/2 for round r, index j at position
 * P, which is (j + ½)·2^r — a fixed place in the tree — scaled by 2^−P about
 * the line b/2 above the view. So every point moves the same way whatever
 * column it is in, and this is that one scaling, read from one position to
 * another.
 */
export function focalY(y: number, from: number, to: number, basePitch: number): number {
  return (y + basePitch / 2) * Math.pow(2, from - to) - basePitch / 2
}
