'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { buttonClass } from '@/app/components/ui'

/**
 * One tee-sheet round, from the organiser's side — the organiser area's
 * Starts card on an event and Trip Setup's Tee times section on a trip
 * draw this, so the two cannot drift.
 *
 * Where the sheet stands in a line, the way into the wizard (open it while
 * it is not open yet, change it once it is — deleting is in there), the
 * way to see it, and **Clear the tee sheet** (Ross, 26 Oct 2026): everybody
 * off it, the times kept. Asked once before it goes, because the people on
 * it lose their places.
 */
export default function TeeSheetRoundControls({
  tripId, tripCode, roundId, roundNumber, state, summary, booked, from,
}: {
  tripId: string
  tripCode: string
  roundId: string
  roundNumber: number
  /** lib/teeSheet.ts `roundSheet`'s answer. */
  state: 'vacant' | 'active' | 'legacy'
  /** The sheet in a line, opening included, or null while it is not open yet. */
  summary: string | null
  /** How many are on it. */
  booked: number
  /** Where the wizard sends the way back. */
  from: 'organiser' | 'setup'
}) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function clear() {
    setClearing(true)
    setError(null)
    const { error: err } = await supabase
      .from('tee_assignments')
      .delete()
      .eq('trip_id', tripId)
      .eq('round_id', roundId)
    setClearing(false)
    if (err) {
      console.error('Tee sheet clear failed:', err)
      setError('Could not clear the tee sheet — try again')
      return
    }
    setAsking(false)
    router.refresh()
  }

  return (
    <div>
      <p className="t-cap text-ink/80 leading-snug">
        {summary
          ? `${summary}.${booked > 0 ? ` ${booked} on it.` : ''}`
          : 'Not open yet — the round shows an empty slot on the Tee times tab until it is.'}
      </p>
      <Link
        href={`/trip/${tripCode}/teesheet/${roundId}/setup?from=${from}`}
        className={`${buttonClass('secondary')} mt-3`}
      >
        {state === 'vacant' ? 'Open the tee sheet' : 'Change the tee sheet'}
      </Link>
      {state !== 'vacant' && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-2">
          <Link
            href={`/trip/${tripCode}/teesheet?round=${roundId}`}
            className="t-cap text-accent-deep hover:text-accent transition-colors py-1"
          >
            See the tee sheet →
          </Link>
          {booked > 0 && !asking && (
            <button
              type="button"
              onClick={() => { setAsking(true); setError(null) }}
              className="t-cap text-ink/65 hover:text-ink transition-colors py-1"
            >
              Clear the tee sheet
            </button>
          )}
        </div>
      )}
      {asking && (
        <div className="mt-3 p-3 rounded-tile bg-tint">
          <p className="t-cap text-ink leading-snug">
            Take everybody off round {roundNumber}&apos;s tee sheet? The times stay; the {booked} on it
            lose their places.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={clearing}
              className={`${buttonClass('secondary', false, true)} flex-1`}
            >
              Keep them
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={clearing}
              className={`${buttonClass('danger', false, true)} flex-1`}
            >
              {clearing ? 'Clearing…' : 'Clear'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-rust-deep text-sm mt-2 leading-snug">{error}</p>}
    </div>
  )
}
