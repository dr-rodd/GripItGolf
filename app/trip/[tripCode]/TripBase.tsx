'use client'

import { createContext, useContext } from 'react'

/**
 * Where this trip or event lives, handed down by the trip layout — `/trip/X`
 * or `/event/X` (lib/tripPaths.ts) — so a browser component's links go to
 * the right one without each being handed the kind. The layout knows the
 * kind; nothing under it has to.
 */
const TripBaseContext = createContext<string | null>(null)

export function TripBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <TripBaseContext.Provider value={base}>{children}</TripBaseContext.Provider>
}

/**
 * This trip's or event's home address, every other page hanging off it.
 * Outside the trip layout (a run challenge's organiser page borrows a
 * component) there is no provider, and the trip address is the answer —
 * the layout redirects an event from it.
 */
export function useTripBase(tripCode: string): string {
  return useContext(TripBaseContext) ?? `/trip/${tripCode}`
}
