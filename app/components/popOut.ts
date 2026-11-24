// Playing the pop-out (D335) — the site's one motion for a tile that opens
// into a card over the page. The rules and timings are lib/popOut.ts's; this
// is the browser half, so every expanding pop-out moves exactly alike: the
// stream's card (`ItemSheet`) and the leaderboard's scorecard
// (`ScorecardSheet`). A new pop-out calls `popOpen` when it mounts and
// `popClose` before it unmounts — never its own keyframes.
//
// Where it grows from: the tile handed in, else the last thing tapped on the
// page (`watchTaps`, one listener for the whole site, read at the moment the
// card mounts). Neither on screen: it fades and scales a touch instead.

import { reducedMotion } from '@/lib/motion'
import { POP_CLOSE_MS, POP_OPEN_MS, PUTT_EASING, closeKeyframes, openKeyframes } from '@/lib/popOut'

let lastTap: { el: Element; at: number } | null = null
let watching = false

/** Remember what was tapped, so a card opened by it can grow out of it. Safe to call often. */
export function watchTaps(): void {
  if (watching || typeof document === 'undefined') return
  watching = true
  document.addEventListener('pointerdown', e => {
    const t = e.target as Element | null
    const el = t?.closest?.('[data-pop-origin], article, button, a, [role="button"], li, tr') ?? null
    if (el) lastTap = { el, at: Date.now() }
  }, { capture: true, passive: true })
}

/** The tile a card about to open came from: the one handed in, else the last tap of the last couple of seconds. */
export function popOrigin(given?: Element | null): Element | null {
  if (given && given.isConnected) return given
  return lastTap && Date.now() - lastTap.at < 2500 && lastTap.el.isConnected ? lastTap.el : null
}

function onScreen(el: Element | null): DOMRect | null {
  if (!el || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  return r.width && r.height && r.bottom > 0 && r.top < window.innerHeight ? r : null
}

/** The card opening: out of its tile, soft to sharp, the one settle; a fade under Reduce Motion. */
export function popOpen(card: HTMLElement | null, origin?: Element | null, backdrop?: HTMLElement | null): void {
  if (!card?.animate) return
  // Measured at rest: an opening already running (a second call, React's
  // development double run) would hand back the shrunken card as its place.
  card.getAnimations?.().forEach(a => a.cancel())
  backdrop?.getAnimations?.().forEach(a => a.cancel())
  backdrop?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: POP_OPEN_MS, easing: 'ease-out' })
  const from = reducedMotion() ? null : onScreen(origin ?? null)
  const to = card.getBoundingClientRect()
  if (!from || !to.width || !to.height) {
    card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' })
    return
  }
  card.style.transformOrigin = 'top left'
  card.animate(openKeyframes(from, to), { duration: POP_OPEN_MS, easing: PUTT_EASING })
}

/** The card closing: back into its tile where it is still on screen; a fade under Reduce Motion. Resolves when done. */
export function popClose(card: HTMLElement | null, origin?: Element | null, backdrop?: HTMLElement | null): Promise<void> {
  if (!card?.animate) return Promise.resolve()
  card.getAnimations?.().forEach(a => a.cancel())
  backdrop?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: POP_CLOSE_MS, easing: 'ease-out', fill: 'forwards' })
  const anim = reducedMotion()
    ? card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' })
    : (() => {
        card.style.transform = ''
        card.style.transformOrigin = 'top left'
        return card.animate(closeKeyframes(onScreen(origin ?? null), card.getBoundingClientRect()), { duration: POP_CLOSE_MS, easing: PUTT_EASING, fill: 'forwards' })
      })()
  return new Promise(resolve => { anim.onfinish = () => resolve(); anim.oncancel = () => resolve() })
}
