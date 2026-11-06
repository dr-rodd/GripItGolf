// A tapped box swelling into what it opens, and back — the only copy of
// the geometry (Ross, 6 Nov 2026: "I want the tapped box to swell to become
// the name selector and sit on top", not a full screen).
//
// The box grows from where it was tapped into a floating card centred on
// it, kept inside the visible screen (the keyboard's half of it too), and
// shrinks back into the same place. What it opens is laid out once, at the
// card's own size, and never reflows as the box grows: the box clips it.
// The words fade out before the box shrinks back, and the box lands as a
// blank tile that melts into the place under it. Until 6 Nov 2026 the box
// landed with the list still showing, so a frame or two of names appeared
// inside the place before it went (Ross: "it ruins the effect").
//
// Pure; BracketDrawer's `Swell` moves the elements.

export type Box = { left: number; top: number; width: number; height: number }

/** The screen it may use: the visible part of it, and the phone's safe areas. */
export type SwellView = {
  width: number
  height: number
  /** Where the visible part starts — `visualViewport.offsetTop`, above a keyboard. */
  top: number
  left: number
  insetTop: number
  insetBottom: number
}

/** The page's side gutter, kept round the card. */
export const SWELL_GUTTER = 16
/** The widest the card grows. */
export const SWELL_MAX_W = 380
/** The tallest the card grows; a longer list scrolls inside it. */
export const SWELL_MAX_H = 520
/** The corner it starts and ends with — a place's `rounded-tile`. */
export const SWELL_FROM_RADIUS = 12
/** The card's corner — `rounded-card`. */
export const SWELL_CARD_RADIUS = 20

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/** How wide the card is on this screen. */
export function swellWidth(view: SwellView): number {
  return Math.max(0, Math.min(SWELL_MAX_W, view.width - 2 * SWELL_GUTTER))
}

/**
 * Where the card sits: centred on the box it grew from, as tall as what it
 * holds (`natural`) up to the cap, and moved and shortened to stay inside
 * the visible screen — so a keyboard coming up moves it up rather than
 * covering it.
 */
export function swellCard(from: Box, view: SwellView, natural: number): Box {
  const width = swellWidth(view)
  const minTop = view.top + Math.max(SWELL_GUTTER, view.insetTop + 8)
  const maxBottom = view.top + view.height - Math.max(SWELL_GUTTER, view.insetBottom + 8)
  const height = Math.max(0, Math.min(natural, SWELL_MAX_H, maxBottom - minTop))
  const top = clamp(from.top + from.height / 2 - height / 2, minTop, maxBottom - height)
  const minLeft = view.left + SWELL_GUTTER
  const left = clamp(from.left + from.width / 2 - width / 2, minLeft, view.left + view.width - SWELL_GUTTER - width)
  return { left, top, width, height }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** The box at `t` of the way from the place (0) to the card (1). */
export function swellBox(from: Box, to: Box, t: number): Box {
  return {
    left: lerp(from.left, to.left, t),
    top: lerp(from.top, to.top, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
  }
}

/** Its corner at `t`. */
export function swellRadius(t: number, to = SWELL_CARD_RADIUS): number {
  return lerp(SWELL_FROM_RADIUS, to, t)
}

const ramp = (v: number) => Math.min(1, Math.max(0, v))

/**
 * How much shows at `t`, the same both ways so an interrupted swell never
 * jumps: the box itself only near the place (it fades in as it leaves and
 * melts into the place as it lands), the words only in the second half —
 * so a shrinking box is empty well before it arrives — and the dimming
 * behind it all the way.
 */
export function swellFades(t: number): { box: number; content: number; scrim: number } {
  return { box: ramp(t / 0.15), content: ramp((t - 0.5) / 0.5), scrim: ramp(t) }
}
