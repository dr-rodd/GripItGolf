// Where a trip and an event live — the only copy (Ross, 8 Nov 2026: trips at
// /golf/trip/<code>, events at /golf/event/<code>, run challenges at
// /run/<code> — the sport first, "to keep things clean").
//
// One set of pages, `app/golf/[root]/[tripCode]`, answers to both: `root` is
// a real route segment, `trip` or `event`, so neither address is a rewrite
// and nothing runs in front of the pages to make it work. (The first attempt
// at /event did, as a proxy.ts, and greendot.live refused connections until
// it was reverted — docs/gotchas-and-debt.md.) The old /trip/<code> and
// /event/<code> addresses — emails, bookmarks, printed QR codes — are sent on
// by `redirects()` in next.config.ts, Next's own, and an event reached at its
// trip address (or a trip at its event one) keeps working: the layout puts
// the address bar right in place (`AddressFix`), the rest of it kept.
//
// Every link the site draws comes from here: a server page from `tripHomeAt`
// (the root it was opened at), a browser component from `useTripBase` (the
// layout's, off the kind), anything else from `tripBase(code, kind)`.
// Pure, and safe on both sides.

import { isEvent } from './eventHub'

export type TripRoot = 'trip' | 'event'

/** Whether a route segment is one of the two roots — anything else under /golf/ is not a page. */
export function isTripRoot(x: unknown): x is TripRoot {
  return x === 'trip' || x === 'event'
}

/** The root a trip or event lives under: `event` for an event, `trip` for anything else golf. */
export function rootOf(kind: unknown): TripRoot {
  return isEvent(kind) ? 'event' : 'trip'
}

/** A trip's or an event's home: `/golf/trip/GX7K2P`, `/golf/event/GX7K2P`. Every other page hangs off it. */
export function tripBase(code: string, kind: unknown): string {
  return `/golf/${rootOf(kind)}/${code}`
}

/** The home of the address a page was opened at — its own `root` segment — for a server page's links. */
export function tripHomeAt(root: string, code: string): string {
  return `/golf/${isTripRoot(root) ? root : 'trip'}/${code}`
}

/**
 * An address moved onto the right home — `/golf/trip/X/scoring?y=1` with the
 * home `/golf/event/X` is `/golf/event/X/scoring?y=1` — or null when it is
 * already there, or is not a trip or event address at all.
 */
export function rehomed(path: string, home: string): string | null {
  const m = /^\/golf\/(?:trip|event)\/[^/?#]+/.exec(path)
  if (!m || m[0] === home) return null
  return home + path.slice(m[0].length)
}

/** Whether `path` is somewhere inside this trip or event, under either root — for a `back=` link handed in. */
export function insideTrip(path: string, code: string): boolean {
  return path.startsWith(`/golf/trip/${code}/`) || path.startsWith(`/golf/event/${code}/`)
}
