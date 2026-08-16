'use client'

import { useEffect, useRef } from 'react'

/**
 * A repeating fetch that stops when nobody is looking, and when there is no
 * signal to look down.
 *
 * ## Why this is not just `setInterval`
 *
 * Two screens on the scoring path refreshed themselves every fifteen seconds
 * — the round dashboard's list of scorecards and the live leaderboard — and
 * neither ever stopped. Not while a card was being scored, not while the
 * phone was in a pocket, not in a dead spot. On a course with patchy service
 * that is the worst possible behaviour: the requests queue behind each other
 * on a struggling radio, and **the write that matters — the hole just
 * entered — ends up behind a stack of refreshes nobody asked for.**
 *
 * So a poll here runs only while its screen is actually being read:
 *
 * - **`active`** is the caller's own answer to "is this on screen?". The
 *   dashboard's list is not being read while a card is open in front of it.
 * - **Hidden means stopped.** A phone locked in a bag, or the app behind
 *   another one, is not a screen anybody is reading.
 * - **Offline means stopped.** A poll into a dead spot cannot succeed and
 *   costs the radio the same as one that could.
 *
 * And coming back — visible again, or online again — fetches **immediately**
 * rather than waiting out the rest of an interval, because the first thing
 * somebody does on reopening the app is look at the numbers.
 *
 * `fn` is held in a ref rather than listed as a dependency: a callback that
 * changes identity every render would otherwise tear down and rebuild the
 * interval on each one, and the timer would never actually reach its own
 * period. The caller does not have to memoise it for this to be correct.
 */
export function usePoll(fn: () => void, everyMs: number, active = true): void {
  const latest = useRef(fn)
  latest.current = fn

  useEffect(() => {
    if (!active) return

    const canRun = () =>
      (typeof document === 'undefined' || document.visibilityState === 'visible') &&
      (typeof navigator === 'undefined' || navigator.onLine !== false)

    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer !== null) { clearInterval(timer); timer = null }
    }
    const start = () => {
      if (timer !== null || !canRun()) return
      latest.current()
      timer = setInterval(() => {
        // Checked on every tick as well as on the events: `visibilitychange`
        // is not fired in every case a screen stops being read — an iOS app
        // switch has been known to miss it — and a tick that checks costs
        // nothing next to a request that should not have gone out.
        if (canRun()) latest.current()
        else stop()
      }, everyMs)
    }

    start()

    const onWake = () => { if (canRun()) start(); else stop() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    window.addEventListener('offline', onWake)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
      window.removeEventListener('offline', onWake)
    }
  }, [everyMs, active])
}
