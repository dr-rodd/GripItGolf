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
 * Heading for the visible pair, e.g. "Quarter-Final → Semi-Final".
 *
 * There is no round beyond the Final, and nothing before the first, so the
 * arrow only appears when there is genuinely something on both sides.
 */
export function roundHeaderLabel(roundNames: string[], leftIndex: number): string {
  const left  = roundNames[leftIndex]
  const right = roundNames[leftIndex + 1]
  if (!left)  return right ?? ''
  if (!right) return left
  return `${left} → ${right}`
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
