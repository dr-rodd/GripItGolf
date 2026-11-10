'use client'

import { useEffect } from 'react'
import { ensureMember } from '@/lib/entryClient'

/**
 * Makes sure this phone is a member of this event (row-level security,
 * stage 1) — once per phone per event, after the page has painted, never in
 * its way. Renders nothing. In the trip layout and the run layout, so every
 * way into an event reaches it: the code typed in, a short link, an email,
 * a QR code, a bookmark, the home-screen app. lib/entryClient.ts does the
 * work; a failure is silent and the next visit tries again.
 */
export default function EnsureMember({ tripCode }: { tripCode: string }) {
  useEffect(() => {
    const go = () => { void ensureMember(tripCode) }
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 3000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(go, 500)
    return () => window.clearTimeout(id)
  }, [tripCode])
  return null
}
