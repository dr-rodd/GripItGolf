'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseEventPermissions } from '@/lib/eventPermissions'
import Toggle from '@/app/components/Toggle'
import TeeTimesAccess from '@/app/components/TeeTimesAccess'
import { SectionHeader, cardClass } from '@/app/components/ui'
import TeeSheetRoundControls from '../teesheet/TeeSheetRoundControls'

/**
 * A trip's tee times (Ross, 26 Oct 2026: "tee time functionality in trips
 * as well, under similar conditions") — Trip Setup's section, the trip's
 * counterpart to an event's Starts card.
 *
 * On or off for the whole trip: on, every round starts from a tee sheet —
 * a vacant slot on the Tee times tab, which takes Stats' place on the bar,
 * until it is opened — and a round added later follows. Off takes the
 * rounds off tee sheets and deletes nothing: turned back on, the sheets
 * are where they were. Then the tee times question's two answers, stored
 * as an event stores them (`teeSheetAccess`), and each round's own
 * controls, the same piece the organiser area draws.
 *
 * Behind Trip Setup's passcode when the trip has one, like the rest of the
 * screen.
 */
export type TripTeeRound = {
  id: string
  roundNumber: number
  state: 'vacant' | 'active' | 'legacy'
  summary: string | null
  booked: number
}

export default function TripTeeTimes({ tripId, tripCode, initialOn, rawPermissions, rounds }: {
  tripId: string
  tripCode: string
  /** Whether any round starts from a tee sheet now. */
  initialOn: boolean
  /** `trips.event_permissions` as read — the two answers ride in it. */
  rawPermissions: unknown
  /** The tee-sheet rounds — none while it is off. The page draws this only for a trip with rounds. */
  rounds: TripTeeRound[]
}) {
  const router = useRouter()
  const [on, setOn] = useState(initialOn)
  const [perms, setPerms] = useState(() => parseEventPermissions(rawPermissions))
  const [error, setError] = useState<string | null>(null)

  async function toggle(next: boolean) {
    const prev = on
    setOn(next)
    setError(null)
    // Every round onto a tee sheet, or every tee-sheet round off one.
    const query = supabase.from('rounds').update({ start_format: next ? 'tee_sheet' : null }).eq('trip_id', tripId)
    const { error: err } = next ? await query : await query.eq('start_format', 'tee_sheet')
    if (err) {
      console.error('Trip tee times toggle failed:', err)
      setOn(prev)
      setError('Could not save — try again')
      return
    }
    // The bar's fourth tab follows (lib/eventHub.ts `fourthTab`).
    router.refresh()
  }

  async function saveAccess(next: { anyoneMakes: boolean; playersPick: boolean }) {
    const prev = perms
    const merged = { ...perms, set_tee_sheets: next.anyoneMakes, edit_tee_sheet: next.playersPick }
    setPerms(merged)
    setError(null)
    const { error: err } = await supabase.from('trips').update({ event_permissions: merged }).eq('id', tripId)
    if (err) {
      setPerms(prev)
      setError(/column|schema cache/i.test(err.message ?? '')
        ? 'Could not save — a database update may not have been applied yet.'
        : 'Could not save the change — try again')
    }
  }

  return (
    <section>
      <SectionHeader className="mb-4">Tee times</SectionHeader>

      <div className={`flex items-center justify-between gap-4 px-4 py-3 ${cardClass()}`}>
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">Tee sheets</p>
          <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
            A tee sheet for every round — a Tee times tab in Stats&apos; place.
          </p>
        </div>
        <Toggle checked={on} onChange={toggle} label="Tee sheets" />
      </div>

      {on && (
        <>
          <div className={`p-4 mt-4 ${cardClass()}`}>
            <TeeTimesAccess
              value={{ anyoneMakes: perms.set_tee_sheets, playersPick: perms.edit_tee_sheet }}
              onChange={saveAccess}
              trip
            />
          </div>

          <ul className="flex flex-col gap-3 mt-4">
            {rounds.map(r => (
              <li key={r.id} className={`p-4 ${cardClass()}`}>
                <p className="text-ink text-sm font-medium mb-2">Round {r.roundNumber}</p>
                <TeeSheetRoundControls
                  tripId={tripId}
                  tripCode={tripCode}
                  roundId={r.id}
                  roundNumber={r.roundNumber}
                  state={r.state}
                  summary={r.summary}
                  booked={r.booked}
                  from="setup"
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="text-rust-deep text-sm mt-3 leading-snug">{error}</p>}
    </section>
  )
}
