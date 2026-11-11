'use client'

import { useEffect, useState } from 'react'

/**
 * True only once `on` has been true for `ms` without a break; false at once
 * when it goes false. For a notice that should not flash up for the moment a
 * normal thing takes — a score on good signal is queued and sent in well under
 * a second, and "Weak signal" for that moment is a false alarm (Ross, 11 Nov
 * 2026). The timer runs while `on` stays true, so more scores arriving do not
 * restart it.
 */
export function useAfterDelay(on: boolean, ms: number): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!on) { setShown(false); return }
    const t = setTimeout(() => setShown(true), ms)
    return () => clearTimeout(t)
  }, [on, ms])
  return on && shown
}
