'use client'

import { useCallback, useEffect, useState } from 'react'
import { hasUnlocked, UNLOCK_EVENT } from '@/lib/passcode'

/**
 * Whether this device holds the organiser's unlock for this trip — and
 * follows it as it changes: the header's lock (`OrganiserLock`) or any PIN
 * box on the page opening it, or the lock tapped shut again, reaches every
 * organiser control on the page at once (Ross, 10 Nov 2026).
 *
 * False until mounted — this phone's storage is the browser's — so the server and
 * the first paint agree. The setter is kept for the in-place PIN boxes that
 * already call it; they write the shared memory too (`rememberUnlock`).
 */
export function useUnlocked(tripCode: string): [boolean, (on: boolean) => void] {
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => {
    const read = () => setUnlocked(hasUnlocked(tripCode))
    read()
    window.addEventListener(UNLOCK_EVENT, read)
    return () => window.removeEventListener(UNLOCK_EVENT, read)
  }, [tripCode])
  const set = useCallback((on: boolean) => setUnlocked(on), [])
  return [unlocked, set]
}
