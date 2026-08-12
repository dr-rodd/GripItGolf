"use client"

import { useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

/**
 * Keeping a page current while somebody is looking at it.
 *
 * `router.refresh()` re-runs the whole server render, which on the trip
 * leaderboard is ten queries. That is the right price while a card is open —
 * the board is being read on a golf course and a stale one is useless — and
 * the wrong price when nothing is happening.
 *
 * So the two cadences are far apart on purpose. **Fifteen seconds while a
 * round is live.** Three minutes when none is: the only thing that can move
 * an idle board is somebody committing a card, and committing a card opens a
 * live round first, which flips `isActive` and brings the fast cadence back
 * with it. A refresh in flight also competes with the next tab press, so a
 * minute-by-minute rebuild of a page nobody is watching was costing the
 * navigation it was sitting behind.
 *
 * Coming back to the tab refreshes at once regardless, which is what actually
 * matters: a phone out of a pocket shows current data on the first frame
 * rather than waiting out whichever interval it is on.
 */
const LIVE_MS = 15_000
const IDLE_MS = 180_000

export default function Poller({ isActive = false }: { isActive?: boolean }) {
  const router = useRouter()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const intervalMs = isActive ? LIVE_MS : IDLE_MS

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => router.refresh(), intervalMs)
  }, [intervalMs, router])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!document.hidden) startPolling()

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        router.refresh()
        startPolling()
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      stopPolling()
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [startPolling, stopPolling, router])

  return null
}
