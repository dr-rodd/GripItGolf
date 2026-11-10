'use client'

import { useEffect } from 'react'
import { ensureMember } from '@/lib/entryClient'

/**
 * Makes sure this phone is a member of this event (row-level security,
 * stage 1) — once per phone per event, as soon as the page has painted,
 * never in its way. Renders nothing. In the trip layout and the run layout, so every
 * way into an event reaches it: the code typed in, a short link, an email,
 * a QR code, a bookmark, the home-screen app. lib/entryClient.ts does the
 * work; a failure is silent and the next visit tries again.
 */
export default function EnsureMember({ tripCode }: { tripCode: string }) {
  useEffect(() => {
    // Straight after the first paint, not at idle: from row-level security
    // stage 3 a phone that is not yet a member is refused the event's writes,
    // so a phone opening an event for the first time should be one before
    // anybody's thumb reaches a button. A returning phone answers from its
    // own storage and asks nothing of the network.
    void ensureMember(tripCode)
  }, [tripCode])
  return null
}
