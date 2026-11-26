// Swipe a message right to reply (D346, Ross, 26 Nov 2026: "If a swipe right
// is done on any of them there's a spring feeling and that's how you reply.
// I want a sticky feeling"). The only copy of its feel: the message follows
// the finger less and less the further it goes (a rubber band), clicks a few
// pixels on as it passes the point where letting go replies (the sticky
// detent), and springs home when let go — a quick, lightly damped spring,
// sampled into keyframes the Web Animations API plays linearly, as the
// pop-out's is (lib/popOut.ts). Pure; app/components/feed/SwipeReply.tsx
// wires it to a finger. Under Reduce Motion it goes home at once.

/** The most a message travels, however far the finger goes. */
export const REPLY_REACH = 88
/** Past this, letting go replies. */
export const REPLY_AT = 52
/** The detent: how far on the message clicks as it passes REPLY_AT. */
export const REPLY_DETENT = 6
/** Movement before a touch is a swipe rather than a tap or a scroll. */
export const REPLY_SLOP = 10
/** A touch this close to the screen's left edge is the browser's own back gesture, never a reply. */
export const REPLY_EDGE = 24
/** The spring home: about a third of a second, a touch past rest and back (D346's named exception to D8). */
export const REPLY_BACK_MS = 360
const RESPONSE_S = 0.32
const DAMPING = 0.65
const STEP_MS = 16

/** Where the message stands for a finger `pull` px to the right of where it started. */
export function swipeOffset(pull: number): { x: number; armed: boolean } {
  const p = Math.max(0, pull)
  const band = REPLY_REACH * (1 - Math.exp(-p / REPLY_REACH))
  const armed = band >= REPLY_AT
  return { x: band + (armed ? REPLY_DETENT : 0), armed }
}

/** A swipe or not: sideways, to the right, and clearly more sideways than down. */
export function swipeStarts(dx: number, dy: number): 'swipe' | 'scroll' | null {
  if (Math.abs(dy) > REPLY_SLOP && Math.abs(dy) >= Math.abs(dx)) return 'scroll'
  if (dx > REPLY_SLOP && dx > Math.abs(dy) * 1.5) return 'swipe'
  return null
}

/** The damped spring from rest: 0 at release, 1 home, a little past. */
function spring(ms: number): number {
  const t = Math.max(0, ms) / 1000
  const w = (2 * Math.PI) / RESPONSE_S
  const wd = w * Math.sqrt(1 - DAMPING * DAMPING)
  return 1 - Math.exp(-DAMPING * w * t) * (Math.cos(wd * t) + ((DAMPING * w) / wd) * Math.sin(wd * t))
}

/** How far past home the spring goes, as a share of the travel. */
export function backOvershoot(): number {
  return Math.exp((-Math.PI * DAMPING) / Math.sqrt(1 - DAMPING * DAMPING))
}

/** The keyframes that send a message home from `x`, the last exactly home. */
export function backFrames(x: number): Keyframe[] {
  const frames: Keyframe[] = []
  for (let ms = 0; ms < REPLY_BACK_MS; ms += STEP_MS) frames.push({ transform: `translateX(${(x * (1 - spring(ms))).toFixed(2)}px)` })
  frames.push({ transform: 'translateX(0px)' })
  return frames
}
