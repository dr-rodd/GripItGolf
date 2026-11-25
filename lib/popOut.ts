// The pop-out (D330, D331, D334, D335, D337) — the site's one motion for a
// tile that opens into a card over the page, the one copy, pure so
// test:branding can hold it. Modelled on the menus Ross sent from X (24 Nov
// 2026): the card grows out of the tile that was tapped as a soft, blurred
// shape, springs a hair past its place as it sharpens, and rests. FLIP —
// laid out where it ends, drawn from the tile's place and let go.
//
// **A real spring, not a curve** (D337, Ross, 25 Nov 2026: "still too quick…
// spring, blur and sharpen into new page"). The putt curve does four fifths
// of its travel in the first tenth of its time, so however long it ran it
// read as a snap. A damped spring starts from rest, gathers, glides in and
// drifts **at most 2% past its place, of the way it travelled** before it
// settles — the one exception to D8's "no springs or overshoot", written
// down here and nowhere else. The blur clears late, so the card sharpens as
// it lands rather than before it moves. The spring is sampled into keyframes
// played linearly, which is how the Web Animations API takes a spring.
//
// Closing is the putt curve back into the tile, softening as it goes — a
// close should get out of the way. Under Reduce Motion it fades.
// `app/components/popOut.ts` plays it; every expanding pop-out on the site
// uses that and nothing else (the stream's card, the leaderboard's
// scorecard). The timings are tokens in `app/globals.css` too
// (`--gd-pop-open`, `--gd-pop-close`), held equal to these by test:branding.

/**
 * The spring, as Apple describes one (and X's menus use): its **response** —
 * how long one swing takes, so the larger the slower — and its **damping**,
 * 1 being no overshoot at all. 0.6s and 0.8 — the X example's pace (Ross,
 * 25 Nov 2026: a "slightly slower" 0.7 was asked of a build that had not
 * deployed, and reverted): a gentle start, most of the way there by 300ms,
 * furthest past its place (about 1.5%) near 500ms.
 */
export const SPRING_RESPONSE_S = 0.6
export const SPRING_DAMPING = 0.8

/** The whole opening: by then the spring is within a fraction of a pixel of rest. */
export const POP_OPEN_MS = 720
/** Closing, on the putt curve: back into the tile, out of the way. */
export const POP_CLOSE_MS = 280
/** The backdrop darkening as the card comes out — a fade, not part of the spring. */
export const POP_FADE_MS = 340

/** The settle's ceiling (D331): at most 2% past its place, of the way it travelled. */
export const POP_SETTLE = 0.02

/** How soft the shape is as it leaves the tile. */
export const POP_BLUR_PX = 10
/** When it is sharp: late, so it sharpens as it lands (D337). */
export const POP_SHARP_MS = 440
/** When it is fully seen: it leaves the tile half seen. */
export const POP_SEEN_MS = 200

/** How often the spring is sampled into a keyframe — about one a frame. */
export const POP_STEP_MS = 16

/** The putt curve as the Web Animations API takes it — `--gd-ease`, which a script cannot read. */
export const PUTT_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

/**
 * Where an underdamped spring released from rest stands `ms` after release:
 * 0 at the tile, 1 at its place, a little over 1 as it drifts past.
 */
export function springAt(ms: number): number {
  const t = Math.max(0, ms) / 1000
  const w = (2 * Math.PI) / SPRING_RESPONSE_S
  const z = SPRING_DAMPING
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))
}

/** How far past its place the spring goes, as a share of the travel. */
export function springOvershoot(): number {
  const z = SPRING_DAMPING
  return Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z))
}

type Box = { left: number; top: number; width: number; height: number }

function fromTile(from: Box, to: Box) {
  const sx = to.width ? from.width / to.width : 1
  const sy = to.height ? from.height / to.height : 1
  return { sx, sy, dx: from.left - to.left, dy: from.top - to.top }
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * The opening's keyframes, from the tile's box to the card's, to be played
 * with `easing: 'linear'` over `POP_OPEN_MS`: the spring sampled about once a
 * frame, the blur and the fade by time. Transforms, opacity and a blur only,
 * so nothing is laid out again while it moves (`transform-origin: top left`
 * on the card). The last keyframe is the card exactly, sharp.
 */
export function openKeyframes(from: Box, to: Box): Keyframe[] {
  const { sx, sy, dx, dy } = fromTile(from, to)
  const frames: Keyframe[] = []
  const steps = Math.ceil(POP_OPEN_MS / POP_STEP_MS)
  for (let i = 0; i <= steps; i++) {
    const ms = Math.min(POP_OPEN_MS, i * POP_STEP_MS)
    const last = i === steps
    // The drift past its place eased out over the last part, so it comes
    // to rest on the last frame rather than stepping onto it.
    const tail = Math.min(1, (POP_OPEN_MS - ms) / (POP_OPEN_MS * 0.35))
    const p = last ? 1 : 1 + (springAt(ms) - 1) * (springAt(ms) > 1 ? tail : 1)
    const soft = Math.max(0, 1 - ms / POP_SHARP_MS)
    frames.push({
      offset: r3(ms / POP_OPEN_MS),
      transform: last
        ? 'translate(0px, 0px) scale(1, 1)'
        : `translate(${r3((1 - p) * dx)}px, ${r3((1 - p) * dy)}px) scale(${r3(sx + (1 - sx) * p)}, ${r3(sy + (1 - sy) * p)})`,
      opacity: r3(Math.min(1, 0.5 + (0.5 * ms) / POP_SEEN_MS)),
      filter: `blur(${r3(POP_BLUR_PX * soft * soft)}px)`,
    })
  }
  return frames
}

/** Closing: back into the tile, softening as it goes — no settle on the way out. */
export function closeKeyframes(to: Box | null, card: Box): Keyframe[] {
  if (!to) return [{ transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }, { transform: 'scale(0.96)', opacity: 0, filter: `blur(${POP_BLUR_PX}px)` }]
  const { sx, sy, dx, dy } = fromTile(to, card)
  return [
    { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, filter: 'blur(0px)' },
    { transform: `translate(${r3(dx)}px, ${r3(dy)}px) scale(${r3(sx)}, ${r3(sy)})`, opacity: 0, filter: `blur(${POP_BLUR_PX}px)` },
  ]
}
