'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * The current minute, or null before hydration.
 *
 * The server has no idea what time it is where the reader is standing, so
 * anything that reads the clock during render produces different markup on
 * each side — which React reports as a hydration error and a user sees as a
 * flicker. The server snapshot is deliberately "no clock": every caller
 * renders a stable, sensible page for `null` and the real time arrives on
 * hydration.
 *
 * Bucketed to the minute so the snapshot is stable between renders — the
 * finest thing on the hub is a tee time, and a value that changed on every
 * render would loop forever.
 *
 * Shared by the itinerary, which dims what is done, and the up-next card,
 * which counts down to the first tee. Two clocks a few seconds apart on one
 * screen is exactly the kind of thing nobody reports and everybody notices.
 */
export function useMinute(): Date | null {
  const minute = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      const timer = setInterval(onChange, 30_000)
      return () => clearInterval(timer)
    }, []),
    () => Math.floor(Date.now() / 60_000),
    () => null,
  )
  return minute === null ? null : new Date(minute * 60_000)
}
