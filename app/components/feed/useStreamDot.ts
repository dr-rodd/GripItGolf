'use client'

import { useEffect, useState } from 'react'
import { askFeed } from '@/lib/feedClient'

/** Said on the window when the member has looked at the comments on their cards (D307, amended D320). */
export const STREAM_SEEN_EVENT = 'gd:stream-seen'

/** The Stream tab has cleared the dot — every footer showing it hears. */
export function streamSeen() {
  try { window.dispatchEvent(new Event(STREAM_SEEN_EVENT)) } catch { /* nothing to tell */ }
}

/**
 * The comment dot on the Stream tab (D307, moved by D320): new comments by
 * others on this member's cards. **Never part of Home's first paint** (M3):
 * one small ask once the phone is idle after the page has painted, and only
 * for a signed-in member (`when`). Never polled.
 */
export function useStreamDot(when: boolean): boolean {
  const [dot, setDot] = useState(false)
  useEffect(() => {
    if (!when) return
    let live = true
    const ask = () => {
      void askFeed<{ count?: number }>('badge').then(r => { if (live && r.ok) setDot((r.count ?? 0) > 0) })
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    let idle: number | undefined
    const t = window.setTimeout(() => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(ask, { timeout: 4000 })
      else ask()
    }, 1500)
    const seen = () => setDot(false)
    window.addEventListener(STREAM_SEEN_EVENT, seen)
    return () => {
      live = false
      window.clearTimeout(t)
      if (idle !== undefined) w.cancelIdleCallback?.(idle)
      window.removeEventListener(STREAM_SEEN_EVENT, seen)
    }
  }, [when])
  return dot
}
