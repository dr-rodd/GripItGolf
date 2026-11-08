// Where a trip and an event live — the only copy (Ross, 8 Nov 2026:
// "Events should be at /event rather than /trip").
//
// There is still one route tree, `app/trip/[tripCode]`: an event's pages are
// a trip's pages reading `trips.kind`, and copying the tree would leave two
// to drift. `proxy.ts` serves `/event/<code>/…` from it, and the trip layout
// sends a phone that asked for the wrong one to the right one — an event's
// old `/trip/` link (an email, a bookmark, a QR code printed last week)
// still arrives. Every link the site draws comes through `tripBase`, so it
// is the right one to begin with. A run challenge is neither: `/run/`.
//
// Pure, and safe on both sides — a server page and a browser component both
// import it.

import { isEvent } from './eventHub'

export type TripRoot = 'trip' | 'event'

/** The request header `proxy.ts` sets: which root the phone asked for. */
export const ROOT_HEADER = 'x-gd-root'
/** …and the address it asked for, path and query, the router's own `_rsc` left out. */
export const PATH_HEADER = 'x-gd-path'

/** The first part of the address: `event` for an event, `trip` for anything else golf. */
export function rootOf(kind: unknown): TripRoot {
  return isEvent(kind) ? 'event' : 'trip'
}

/** A trip's or an event's home: `/trip/GX7K2P`, `/event/GX7K2P`. Every other page hangs off it. */
export function tripBase(code: string, kind: unknown): string {
  return `/${rootOf(kind)}/${code}`
}

/** The root an address asks for, or null for an address under neither. */
export function rootOfPath(path: string): TripRoot | null {
  const m = /^\/(trip|event)(?:\/|$)/.exec(path)
  return m ? (m[1] as TripRoot) : null
}

/**
 * The same address under the other root — `/trip/X/scoring?y=1` →
 * `/event/X/scoring?y=1` — for the layout's redirect. Anything under
 * neither root comes back unchanged.
 */
export function rerooted(path: string, root: TripRoot): string {
  return path.replace(/^\/(trip|event)(?=\/|$|\?)/, `/${root}`)
}

/** Whether `path` is somewhere inside this trip or event, under either root — for a `back=` handed in by a link. */
export function insideTrip(path: string, code: string): boolean {
  return path.startsWith(`/trip/${code}/`) || path.startsWith(`/event/${code}/`)
}
