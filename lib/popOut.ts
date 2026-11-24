// The pop-out (D330, D331, D334, D335) — the site's one motion for a tile
// that opens into a card over the page, the one copy, pure so test:branding
// can hold it. Modelled on the menu Ross sent from X (24 Nov 2026): the card
// grows out of the tile that was tapped as a soft, blurred shape, springs a
// hair past its place as it sharpens, and rests. FLIP — laid out where it
// ends, drawn from the tile's place and let go — on the putt curve, landing
// **at most 2% past its place, of the way it travelled**: the one exception
// to D8's "no springs or overshoot", written down here and nowhere else.
// Closing is the same in reverse, back into the tile. Under Reduce Motion it
// fades. `app/components/popOut.ts` plays it; every expanding pop-out on the
// site uses that and nothing else (the stream's card, the leaderboard's
// scorecard). The timings are tokens in `app/globals.css` too
// (`--gd-pop-open`, `--gd-pop-close`), held equal to these by test:branding.

/**
 * Slower than X's (Ross, 24 Nov 2026: "too fast") — the wizard step's and the
 * tee time lift's 340ms, inside the 400ms every touch response keeps to (D8).
 */
export const SHEET_OPEN_MS = 340
export const SHEET_CLOSE_MS = 260

/** The settle (D331): at most 2% past its place, of the way it travelled. */
export const SHEET_SETTLE = 0.02

/** Where in the opening it is furthest past its place, before it rests. */
export const SETTLE_AT = 0.8

/** How soft the shape is as it leaves the tile — sharp by the time it rests. */
export const SHEET_BLUR_PX = 10

/** The pop-out's names as the rest of the site reads them. */
export const POP_OPEN_MS = SHEET_OPEN_MS
export const POP_CLOSE_MS = SHEET_CLOSE_MS

/** The putt curve as the Web Animations API takes it — `--gd-ease`, which a script cannot read. */
export const PUTT_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

type Box = { left: number; top: number; width: number; height: number }

function fromTile(from: Box, to: Box) {
  const sx = to.width ? from.width / to.width : 1
  const sy = to.height ? from.height / to.height : 1
  return { sx, sy, dx: from.left - to.left, dy: from.top - to.top }
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * The opening's keyframes, from the tile's box to the card's: the tile's
 * place and size, soft and half seen; then 2% past the card's, nearly sharp;
 * then the card. Transforms, opacity and a blur only, so nothing is laid out
 * again while it moves (`transform-origin: top left` on the card).
 */
export function openKeyframes(from: Box, to: Box): Keyframe[] {
  const { sx, sy, dx, dy } = fromTile(from, to)
  const f = SHEET_SETTLE
  return [
    { offset: 0, transform: `translate(${r3(dx)}px, ${r3(dy)}px) scale(${r3(sx)}, ${r3(sy)})`, opacity: 0.5, filter: `blur(${SHEET_BLUR_PX}px)` },
    { offset: SETTLE_AT, transform: `translate(${r3(-f * dx)}px, ${r3(-f * dy)}px) scale(${r3(1 + f * (1 - sx))}, ${r3(1 + f * (1 - sy))})`, opacity: 1, filter: 'blur(1px)' },
    { offset: 1, transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, filter: 'blur(0px)' },
  ]
}

/** Closing: back into the tile, softening as it goes — no settle on the way out. */
export function closeKeyframes(to: Box | null, card: Box): Keyframe[] {
  if (!to) return [{ transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }, { transform: 'scale(0.96)', opacity: 0, filter: `blur(${SHEET_BLUR_PX}px)` }]
  const { sx, sy, dx, dy } = fromTile(to, card)
  return [
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, filter: 'blur(0px)' },
    { transform: `translate(${r3(dx)}px, ${r3(dy)}px) scale(${r3(sx)}, ${r3(sy)})`, opacity: 0, filter: `blur(${SHEET_BLUR_PX}px)` },
  ]
}
