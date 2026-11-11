'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { MAX_MATCH_SLOTS, MAX_SESSION_NAME } from '@/lib/sessions'
import { setSessionName, setSessionSlots } from '@/lib/sessionMatchStore'
import { useUnlocked } from '@/app/components/useUnlocked'
import Toggle from '@/app/components/Toggle'
import { Stepper } from '@/app/components/ItineraryForms'
import { FIELD, FIELD_LABEL, cardClass } from '@/app/components/ui'

/**
 * The organiser's settings for one round, on its own summary page (Ross,
 * 10 Nov 2026): drawn only once the header's lock is open (`OrganiserLock`,
 * `useUnlocked`) — or always, where there is no PIN to open. Tee times on or
 * off for the round, and, where the round is a session of a Dynamic Overall
 * Leaderboard, its name, its format (on the Session formats page) and, for
 * a Matches session, how many matches it holds and where they are set.
 *
 * Nothing here touches a score. Turning tee times off keeps the sheet and
 * every match as they are — the round simply stops starting from a sheet,
 * and a Matches session's matches carry on as its order of play.
 */
export default function RoundOrganiser({
  tripId, tripCode, roundId, pinSet, isTrip, teeTimes, sheetOpen, links, session,
}: {
  tripId: string
  tripCode: string
  roundId: string
  pinSet: boolean
  isTrip: boolean
  /** The round starts from a tee sheet (`rounds.start_format`). */
  teeTimes: boolean
  /** Its sheet has been opened in the wizard. */
  sheetOpen: boolean
  links: { teeSheet: string; teeSetup: string; sessions: string; order: string; more: string }
  /** The round's session, on an event or trip with an Overall. */
  session: { name: string; storedName: string; format: string; matches: boolean; slots: number; floor: number } | null
}) {
  const router = useRouter()
  const [unlocked] = useUnlocked(tripCode)
  const [tee, setTee] = useState(teeTimes)
  const [slots, setSlots] = useState(session?.slots ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!unlocked && pinSet) return null

  async function toggleTeeTimes(on: boolean) {
    const prev = tee
    setTee(on)
    setError(null)
    setSaving(true)
    const { error: err } = await supabase
      .from('rounds')
      .update({ start_format: on ? 'tee_sheet' : null })
      .eq('id', roundId)
      .eq('trip_id', tripId)
    setSaving(false)
    if (err) { setTee(prev); setError('Could not change the tee times — try again'); return }
    router.refresh()
  }

  async function changeSlots(n: number) {
    const prev = slots
    setSlots(n)
    setError(null)
    const res = await setSessionSlots(supabase, tripId, roundId, n)
    if (!res.ok) { setSlots(prev); setError(res.reason); return }
    router.refresh()
  }

  async function rename(name: string) {
    if (!session || name.trim() === session.storedName) return
    setError(null)
    const res = await setSessionName(supabase, tripId, roundId, name)
    if (!res.ok) { setError(res.reason); return }
    router.refresh()
  }

  return (
    <section className={`p-4 ${cardClass('flat')}`} aria-label="Organiser settings">
      <p className="t-card text-ink">Organiser settings</p>
      <p className="t-cap text-ink/65 mt-0.5 leading-snug">
        {isTrip ? 'For this round — open with the Trip Setup passcode.' : 'For this round — open with your organiser PIN.'}
      </p>

      {session && (
        <div className="mt-4">
          <label htmlFor={`session-name-${roundId}`} className={FIELD_LABEL}>Session name</label>
          <input
            id={`session-name-${roundId}`}
            type="text"
            className={FIELD}
            maxLength={MAX_SESSION_NAME}
            defaultValue={session.storedName}
            placeholder={session.name}
            onBlur={e => void rename(e.target.value)}
          />
          <div className="flex items-center justify-between gap-3 mt-3">
            <p className="text-ink text-[15px] min-w-0">{session.format}</p>
            <Link href={links.sessions} className="t-label text-accent-deep flex-shrink-0">Change the format →</Link>
          </div>
        </div>
      )}

      {session?.matches && (
        <div className="mt-4">
          <Stepper
            label="How many matches?"
            value={Math.max(slots, session.floor)}
            min={session.floor}
            max={MAX_MATCH_SLOTS}
            unit={n => (n === 1 ? 'match' : 'matches')}
            onChange={n => void changeSlots(n)}
          />
          <Link href={links.order} className="t-label text-accent-deep mt-2 inline-block">Set the matches →</Link>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-line">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-label text-ink">Tee times</p>
            <p className="t-cap text-ink/65 mt-0.5 leading-snug">
              {tee
                ? sheetOpen ? 'This round starts from its tee sheet.' : 'On — the tee sheet isn’t open yet.'
                : session?.matches ? 'Off — the matches are set in the order of play.' : 'Off — nobody picks a time.'}
            </p>
          </div>
          <Toggle checked={tee} onChange={on => void toggleTeeTimes(on)} disabled={saving} label="Tee times for this round" />
        </div>
        {tee && (
          <Link href={sheetOpen ? links.teeSheet : links.teeSetup} className="t-label text-accent-deep mt-2 inline-block">
            {sheetOpen ? 'See the tee sheet →' : 'Open the tee sheet →'}
          </Link>
        )}
        {!tee && sheetOpen && (
          <p className="t-cap text-ink/65 mt-2 leading-snug">Its tee sheet is kept, and comes back if tee times are turned on again.</p>
        )}
      </div>

      {error && <p className="t-cap text-rust-deep mt-3">{error}</p>}

      <Link href={links.more} className="t-label text-accent-deep mt-4 inline-block">
        {isTrip ? 'Everything else in Trip Setup →' : 'Everything else in the organiser area →'}
      </Link>
    </section>
  )
}
