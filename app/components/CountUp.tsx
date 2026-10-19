'use client'

import { useLayoutEffect, useRef, useState } from 'react'

/**
 * A total that counts up to itself, once, after somebody did the thing that
 * changed it (refresh plan, Phase 8; D10). Two places and no others: your
 * total on a run challenge's Add tab after a run is logged, and your total on
 * a round summary the first time you see it after signing. **Never on a live
 * board** — a number being read never moves — and `test:branding` holds that.
 *
 * Two ways to start:
 *   · `onceKey` — count from 0 the first time this device sees the number
 *     under that key, then never again (remembered in localStorage, so a
 *     refresh or a back-and-forth shows the number still).
 *   · neither — count from the last value this component showed when the
 *     value goes **up** while it is mounted, which is exactly what a
 *     `router.refresh()` after a save does. Going down (a run deleted) just
 *     changes: a count-down celebrates nothing.
 *
 * 400ms on the putt curve, tabular numerals so the width never jumps. The
 * server renders the final figure, so without JavaScript — or with Reduce
 * Motion — the right number is simply there. Screen readers only ever get
 * the final figure.
 */
export const COUNT_UP_MS = 400

/** The putt curve, cubic-bezier(0.16, 1, 0.3, 1), solved for y at time x. */
function putt(x: number): number {
  const [x1, y1, x2, y2] = [0.16, 1, 0.3, 1]
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t ** 2 * (1 - t) + t ** 3
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t ** 2 * (1 - t) + t ** 3
  let lo = 0, hi = 1, t = x
  for (let i = 0; i < 20; i++) {
    t = (lo + hi) / 2
    if (bx(t) < x) lo = t; else hi = t
  }
  return by(t)
}

/** Whole numbers bare, the rest to one place — the way points print. */
const show = (n: number, decimals: 0 | 1) =>
  decimals === 0 ? String(Math.round(n)) : String(Math.round(n * 10) / 10)

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function CountUp({ value, decimals = 0, onceKey, className = '' }: {
  value: number
  decimals?: 0 | 1
  /** Count from 0 once per device under this key. */
  onceKey?: string
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const last = useRef(value)
  const frame = useRef<number | null>(null)

  // Before paint, so the final figure never flashes before the count.
  useLayoutEffect(() => {
    let from: number | null = null
    if (onceKey) {
      try {
        const k = `gd-countup:${onceKey}`
        if (!localStorage.getItem(k)) { localStorage.setItem(k, '1'); if (value > 0) from = 0 }
      } catch { /* storage refused: just show the number */ }
    } else if (value > last.current) {
      from = last.current
    }
    last.current = value
    if (from === null || reduced()) { setShown(value); return }

    const start = performance.now()
    const begin = from
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_UP_MS)
      setShown(begin + (value - begin) * putt(p))
      if (p < 1) frame.current = requestAnimationFrame(tick)
    }
    setShown(begin)
    frame.current = requestAnimationFrame(tick)
    return () => { if (frame.current) cancelAnimationFrame(frame.current) }
  }, [value, onceKey])

  return (
    <span className={`tabular-nums ${className}`.trim()}>
      <span aria-hidden="true">{show(shown, decimals)}</span>
      <span className="sr-only">{show(value, decimals)}</span>
    </span>
  )
}
