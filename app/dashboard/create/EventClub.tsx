'use client'

import { createContext, useContext } from 'react'
import { cardClass } from '@/app/components/ui'

/**
 * Whose event is being made (Q3, D153). An owner or admin of a verified club
 * is asked once, at the gate, "the club's" or "just mine"; the answer is held
 * here for the wizard behind it. Null: the maker's own, every wizard exactly
 * as before. Anybody else on a club's list makes their own and is never asked
 * (D139: only admins run club events).
 *
 * The server decides again (`/api/trip/create` checks the maker runs that
 * verified club); this only shapes the wizard.
 */
export interface EventClub { id: string; name: string }

export const EventClubContext = createContext<EventClub | null>(null)

/** The club this event is being made for, or null for the maker's own. */
export function useEventClub(): EventClub | null {
  return useContext(EventClubContext)
}

/**
 * A club's event needs no PIN (D138): Club admins only, nobody holding one.
 * A PIN typed in is lent to helpers. So the PIN is optional — left blank,
 * no issue; typed, the usual checks.
 */
export function clubPinIssue(club: EventClub | null, pin: string, again: string, issue: string | null): string | null {
  return club && !pin && !again ? null : issue
}

/** Said over the PIN boxes of a club's event: what the PIN is for now. */
export function ClubPinNote({ club }: { club: EventClub }) {
  return (
    <div className={`px-4 py-4 ${cardClass()}`}>
      <p className="text-ink text-sm font-medium">{club.name}’s event</p>
      <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
        Its Officers run it on any phone they sign in on. Lend a PIN to helpers? It’s optional:
        leave it blank and the settings stay with the club’s admins.
      </p>
    </div>
  )
}
