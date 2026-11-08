'use client'

import { useEffect, createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'
import { rehomed } from '@/lib/tripPaths'

/**
 * Where this trip or event lives, handed down by the trip layout —
 * `/golf/trip/X` or `/golf/event/X` (lib/tripPaths.ts) — so a browser
 * component's links go to the right one without each being handed the kind.
 * The layout knows the kind; nothing under it has to.
 */
const TripBaseContext = createContext<string | null>(null)

export function TripBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <TripBaseContext.Provider value={base}>{children}</TripBaseContext.Provider>
}

/**
 * This trip's or event's home address, every other page hanging off it.
 * Outside the trip layout (a run challenge's organiser page borrows a
 * component) there is no provider, and the trip address is the answer.
 */
export function useTripBase(tripCode: string): string {
  return useContext(TripBaseContext) ?? `/golf/trip/${tripCode}`
}

/**
 * The address bar put right, in place: an event opened at its trip address
 * (an old link, sent on from /trip/ by next.config.ts) or a trip at its
 * event one shows its own, the rest of the address kept. The page is the
 * same either way — one set of pages answers to both — so this only
 * rewrites what the bar says (`history.replaceState`, which Next's router
 * follows), never loads anything.
 */
export function AddressFix({ base }: { base: string }) {
  const pathname = usePathname()
  useEffect(() => {
    const { pathname: here, search, hash } = window.location
    const fixed = rehomed(here, base)
    if (fixed) window.history.replaceState(null, '', fixed + search + hash)
  }, [pathname, base])
  return null
}
