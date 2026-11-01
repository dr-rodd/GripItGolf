// Motion that has to run in script rather than CSS — the one copy of the
// putt curve for it. CSS uses `--gd-ease`; these are the same curve, solved
// for a frame loop (docs/style-guide.md §6).

/** The putt curve, cubic-bezier(0.16, 1, 0.3, 1), solved for y at time x. */
export function putt(x: number): number {
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

/** Whether this phone asks for less motion. */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
