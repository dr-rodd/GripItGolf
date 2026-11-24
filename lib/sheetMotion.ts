// The card sheet's opening (D330, D331) — the one copy of its motion, pure so
// test:branding can hold it. The sheet grows out of the card that was tapped
// (FLIP: it is laid out where it ends, then drawn from the card's place and
// let go) on the putt curve, and lands **a hair past its place — at most 2%
// of the way it travelled — before it rests**. That settle is the one
// exception to D8's "no springs or overshoot", written down here and nowhere
// else; every other motion on the site still stops dead. Under Reduce Motion
// the sheet fades instead (ItemSheet.tsx).

/** Inside the 400ms every touch response keeps to (D8). */
export const SHEET_OPEN_MS = 360
export const SHEET_CLOSE_MS = 240

/** The settle (D331): at most 2% past its place, of the way it travelled. */
export const SHEET_SETTLE = 0.02

/** Where in the opening it is furthest past its place, before it rests. */
export const SETTLE_AT = 0.8

type Box = { left: number; top: number; width: number; height: number }

/**
 * The opening's keyframes, from the card's box to the sheet's: the card's
 * place and size, then 2% past the sheet's, then the sheet. Transforms only
 * (with `transform-origin: top left` on the sheet), so nothing is laid out
 * again while it moves.
 */
export function openKeyframes(from: Box, to: Box): Keyframe[] {
  const sx = to.width ? from.width / to.width : 1
  const sy = to.height ? from.height / to.height : 1
  const dx = from.left - to.left
  const dy = from.top - to.top
  const f = SHEET_SETTLE
  const r = (n: number) => Math.round(n * 1000) / 1000
  return [
    { offset: 0, transform: `translate(${r(dx)}px, ${r(dy)}px) scale(${r(sx)}, ${r(sy)})`, opacity: 0.6 },
    { offset: SETTLE_AT, transform: `translate(${r(-f * dx)}px, ${r(-f * dy)}px) scale(${r(1 + f * (1 - sx))}, ${r(1 + f * (1 - sy))})`, opacity: 1 },
    { offset: 1, transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 },
  ]
}
