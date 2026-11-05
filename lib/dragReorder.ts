// Dragging a row of a list to a new place — the maths of the drag, the only
// copy (Ross, 5 Nov 2026: "make the tile float in drag with a nice smooth
// animation on where they'll be dropped"). The row under the finger follows
// it; the rows between where it was and where it would land slide aside by
// its height, so the gap it will drop into is always open; let go, it
// settles into the gap. Measured once, when the drag starts, so nothing moves
// under the maths while it runs. Pure.

/** The rows as they stood when the drag began: each one's top and height. */
export type RowBoxes = { tops: readonly number[]; heights: readonly number[] }

/** Where the dragged row lands, moved `dy` from where it started: past a row's middle is past the row. */
export function dropIndex(rows: RowBoxes, from: number, dy: number): number {
  const centre = rows.tops[from] + rows.heights[from] / 2 + dy
  let over = from
  for (let i = from + 1; i < rows.tops.length; i++) {
    if (centre > rows.tops[i] + rows.heights[i] / 2) over = i
  }
  for (let i = from - 1; i >= 0; i--) {
    if (centre < rows.tops[i] + rows.heights[i] / 2) over = i
  }
  return over
}

/** How far a row other than the dragged one slides aside while it would land at `over`. */
export function makeRoom(rows: RowBoxes, from: number, over: number, i: number): number {
  if (i === from) return 0
  if (from < i && i <= over) return -rows.heights[from]
  if (over <= i && i < from) return rows.heights[from]
  return 0
}

/** How far the dragged row travels to settle into the gap at `over`. */
export function settleOffset(rows: RowBoxes, from: number, over: number): number {
  if (over > from) return rows.tops[over] + rows.heights[over] - rows.heights[from] - rows.tops[from]
  if (over < from) return rows.tops[over] - rows.tops[from]
  return 0
}
