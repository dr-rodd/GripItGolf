'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { describeShortDate } from '@/lib/itinerary'
import { nextRoundIssue } from '@/lib/leagueSetup'
import { addLeagueRound, confirmLeagueVenue } from '@/lib/leagueRoundStore'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { Sheet } from '@/app/components/ItineraryForms'
import CourseSelect from '@/app/components/CourseSelect'
import DateField from '@/app/components/DateField'
import Toggle from '@/app/components/Toggle'
import InlineUnlock from '@/app/components/InlineUnlock'
import { FIELD_LABEL, IconButton, cardClass } from '@/app/components/ui'
import { IconPlus, IconSettings } from '@/app/components/icons'

/**
 * A league's rounds, where the field can touch them — the Scoring tab and
 * the hub (docs/event-use-cases.md).
 *
 * Two doors, both for a dated series: **Add round**, the next round on the
 * day it is played, at the last venue unless told otherwise or left TBC;
 * and a **TBC round's tile**, paler than the rest, which opens "Choose the
 * venue". Choosing one makes the round (lib/leagueRoundStore.ts), and only
 * then can it be scored — a TBC round has nothing to open a card on.
 *
 * Who may: the organiser always, with the PIN asked in place; the field
 * when the organiser has switched on `add_rounds` or `set_venues`. Adding a
 * missing course from the picker is the field's only with `add_courses`.
 */

/** What both doors are told about the league and the person holding the phone. */
export type LeagueDoor = {
  tripId: string
  tripCode: string
  /** The first round's date — the trip's start. */
  startDate: string
  passcodeHash: string | null
  /** `add_courses` is on: the field may add a missing course from the picker. */
  fieldMayAddCourses: boolean
}

// ─── Shared pieces ─────────────────────────────────────────────

/**
 * The players a new round gives a handicap snapshot to, fetched when a
 * sheet opens and not before — the Scoring tab's rule (AddRound's note).
 * Null until loaded; a failed fetch stops the save rather than making a
 * round nobody has a handicap on.
 */
function usePlayers(tripId: string, enabled: boolean) {
  const [players, setPlayers] = useState<{ id: string; handicap: number | null }[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || players) return
    let live = true
    supabase
      .from('players')
      .select('id, handicap')
      .eq('trip_id', tripId)
      .eq('is_composite', false)
      .then(({ data, error }) => {
        if (!live) return
        if (error) { console.error('League players fetch failed:', error); setFailed(true); return }
        setPlayers(data ?? [])
      })
    return () => { live = false }
  }, [enabled, tripId, players])

  return { players, failed }
}

/** The course list plus anything added from the picker mid-flow. */
function useCourses(enabled: boolean) {
  const { courses } = usePlatformCourses(enabled)
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const all = useMemo(() => {
    const known = new Set(courses.map(c => c.id))
    return [...courses, ...added.filter(c => !known.has(c.id))]
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [courses, added])
  const upsert = (course: DirectoryCourse) =>
    setAdded(prev => prev.some(c => c.id === course.id)
      ? prev.map(c => (c.id === course.id ? course : c))
      : [...prev, course])
  return { courses: all, upsert }
}

/** The PIN, asked in place, when the field has not been given this. */
function OrganiserOnly({ door, what, onUnlocked }: {
  door: LeagueDoor; what: string; onUnlocked: () => void
}) {
  if (!door.passcodeHash) return null
  return (
    <div className={`p-4 ${cardClass()}`}>
      <p className="text-ink text-sm font-medium">The organiser {what}</p>
      <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
        Enter the organiser PIN to carry on.
      </p>
      <InlineUnlock
        tripCode={door.tripCode}
        passcodeHash={door.passcodeHash}
        onUnlocked={onUnlocked}
        prompt="Enter the PIN"
      />
    </div>
  )
}

/** Today on the device's own calendar — the day being played. */
function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ─── Add round ─────────────────────────────────────────────────

export function AddLeagueRound({
  door, endDate, roundDates, number, positionsByDay, lastVenueId, fieldMayAdd,
}: {
  door: LeagueDoor
  endDate: string | null
  /** Every date the league already has a round on, TBC ones included. */
  roundDates: string[]
  /** The number the new round takes (`nextRoundNumber`). */
  number: number
  /** How many items each day already holds, so the round goes after them. */
  positionsByDay: Record<number, number>
  /** The most recent round's course — a league presumes its home venue. */
  lastVenueId: string | null
  /** `add_rounds` is on: the field adds rounds without the PIN. */
  fieldMayAdd: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [date, setDate] = useState('')
  const [courseId, setCourseId] = useState('')
  const [tbc, setTbc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { courses, upsert } = useCourses(open)
  const { players, failed } = usePlayers(door.tripId, open)

  const organiser = unlocked || !isLocked(door.passcodeHash)
  const mayAdd = fieldMayAdd || organiser

  function openSheet() {
    // Read on tap, never during render: the unlock lives in sessionStorage
    // and the date on the device's own calendar.
    setUnlocked(hasUnlocked(door.tripCode))
    const today = localToday()
    setDate(nextRoundIssue(today, { startDate: door.startDate, roundDates }) ? '' : today)
    setCourseId(lastVenueId ?? '')
    setTbc(false)
    setError(null)
    setOpen(true)
  }

  async function add() {
    if (!mayAdd) { setError('Adding a round needs the organiser PIN.'); return }
    const issue = nextRoundIssue(date, { startDate: door.startDate, roundDates })
    if (issue) { setError(issue); return }
    if (!tbc && !courseId) { setError('Pick a venue, or leave it to be confirmed.'); return }
    if (!players) {
      setError(failed ? 'Could not load the field — try again' : 'Still loading the field — try again in a moment')
      return
    }

    setSaving(true)
    setError(null)
    const dayIndex = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${door.startDate}T00:00:00Z`)) / 86_400_000)
    const result = await addLeagueRound({
      tripId: door.tripId, startDate: door.startDate, endDate, date,
      courseId: tbc ? null : courseId, number,
      position: positionsByDay[dayIndex] ?? 0, players,
    })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className={`flex-shrink-0 flex items-center gap-2 pl-3.5 pr-4 py-2.5 -mr-1 hover:border-accent ${cardClass('raised', true)}`}
      >
        <span className="text-accent-deep"><IconPlus size={16} /></span>
        <span className="t-label text-ink">Add round</span>
      </button>

      {open && (
        <Sheet
          title="Add the next round"
          onClose={() => !saving && setOpen(false)}
          onAdd={add}
          addLabel={saving ? 'Adding…' : 'Add round'}
          error={error}
        >
          {!mayAdd && (
            <OrganiserOnly door={door} what="adds rounds" onUnlocked={() => setUnlocked(true)} />
          )}

          <DateField label="Date" value={date} onChange={setDate} min={door.startDate} />

          <div>
            <label className={FIELD_LABEL}>Venue</label>
            {tbc ? (
              <p className="t-cap text-ink/65 leading-snug">
                To be confirmed. The round can’t be played until somebody chooses it.
              </p>
            ) : (
              <CourseSelect
                courses={courses}
                value={courseId}
                onChange={setCourseId}
                onCourseAdded={upsert}
                allowAdd={organiser || door.fieldMayAddCourses}
              />
            )}
            <div className="flex items-center justify-between gap-4 mt-3">
              <p className="text-ink text-sm">Venue to be confirmed</p>
              <Toggle checked={tbc} onChange={setTbc} label="Venue to be confirmed" />
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}

// ─── A round whose venue is TBC ────────────────────────────────

/**
 * The tile a TBC round wears — paler than a round that exists, dashed like
 * the "add" rows elsewhere — and the sheet it opens. Its number is the one
 * `leagueRounds` held for it, and confirming writes exactly that.
 */
export function TbcRoundTile({ door, itemId, date, number, lastVenueId, fieldMaySetVenue }: {
  door: LeagueDoor
  itemId: string
  date: string
  number: number
  lastVenueId: string | null
  /** `set_venues` is on: the field chooses venues without the PIN. */
  fieldMaySetVenue: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [courseId, setCourseId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { courses, upsert } = useCourses(open)
  const { players, failed } = usePlayers(door.tripId, open)

  const organiser = unlocked || !isLocked(door.passcodeHash)
  const mayChoose = fieldMaySetVenue || organiser

  function openSheet() {
    setUnlocked(hasUnlocked(door.tripCode))
    setCourseId(lastVenueId ?? '')
    setError(null)
    setOpen(true)
  }

  async function confirm() {
    if (!mayChoose) { setError('Choosing a venue needs the organiser PIN.'); return }
    if (!courseId) { setError('Pick the venue.'); return }
    if (!players) {
      setError(failed ? 'Could not load the field — try again' : 'Still loading the field — try again in a moment')
      return
    }
    setSaving(true)
    setError(null)
    const result = await confirmLeagueVenue({
      tripId: door.tripId, itemId, courseId, number, date, players,
    })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="flex items-center justify-between w-full px-5 py-4 rounded-card press text-left border border-dashed border-line-strong"
      >
        <div className="min-w-0">
          <p className="t-label text-ink/50 mb-1">
            Round {number} · {describeShortDate(date)}
          </p>
          <p className="t-card text-ink/50">Venue TBC</p>
          <p className="t-cap mt-1 text-ink/50">Tap to choose the venue</p>
        </div>
      </button>

      {open && (
        <Sheet
          title={`Round ${number}’s venue`}
          onClose={() => !saving && setOpen(false)}
          onAdd={confirm}
          addLabel={saving ? 'Saving…' : 'Confirm venue'}
          error={error}
        >
          <p className="t-cap text-ink/65 leading-snug">
            {describeShortDate(date)}. Once it has a venue the round can be scored.
          </p>
          {!mayChoose && (
            <OrganiserOnly door={door} what="chooses venues" onUnlocked={() => setUnlocked(true)} />
          )}
          <div>
            <label className={FIELD_LABEL}>Venue</label>
            <CourseSelect
              courses={courses}
              value={courseId}
              onChange={setCourseId}
              onCourseAdded={upsert}
              allowAdd={organiser || door.fieldMayAddCourses}
            />
          </div>
        </Sheet>
      )}
    </>
  )
}

// ─── One round's settings ──────────────────────────────────────

/**
 * The gear beside a league round on the Scoring tab — that round's own
 * settings (docs/event-use-cases.md, Ross's answer 1). The event's settings
 * live in the organiser area and set the defaults; this manages one round.
 *
 * So far it holds the one switch stage 2 needs: **whether the round counts
 * towards the league** — rained off, too few players. Off is
 * `rounds.casual`, the flag a trip's casual round already uses, so the
 * overall skips it through the one rule in `buildRows` while its own
 * leaderboard still shows, greyed. Never permanent: the scores are not
 * touched, and switching it back counts them again. Sensitive, so the
 * organiser's, with the PIN asked in place.
 */
export function RoundSettings({ door, roundId, number, casual }: {
  door: Pick<LeagueDoor, 'tripId' | 'tripCode' | 'passcodeHash'>
  roundId: string
  number: number
  /** The round does not count towards the league just now. */
  casual: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [counts, setCounts] = useState(!casual)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const organiser = unlocked || !isLocked(door.passcodeHash)

  function openSheet() {
    setUnlocked(hasUnlocked(door.tripCode))
    setCounts(!casual)
    setError(null)
    setOpen(true)
  }

  async function setCounting(next: boolean) {
    if (!organiser) { setError('Changing a round needs the organiser PIN.'); return }
    setSaving(true)
    setError(null)
    setCounts(next)
    const { error: writeError } = await supabase
      .from('rounds')
      .update({ casual: !next })
      .eq('trip_id', door.tripId)
      .eq('id', roundId)
    setSaving(false)
    if (writeError) {
      console.error('Round counting write failed:', writeError)
      setCounts(!next)
      setError('Could not save the change — try again.')
      return
    }
    // The tab, the hub and the board all read the flag on the server.
    router.refresh()
  }

  return (
    <>
      <IconButton
        label={`Round ${number} settings`}
        onClick={openSheet}
        className="flex-shrink-0 self-center"
      >
        <IconSettings size={20} />
      </IconButton>

      {open && (
        <Sheet
          title={`Round ${number}`}
          onClose={() => !saving && setOpen(false)}
          onAdd={() => !saving && setOpen(false)}
          addLabel="Done"
          error={error}
        >
          {!organiser && door.passcodeHash && (
            <div className={`p-4 ${cardClass()}`}>
              <p className="text-ink text-sm font-medium">The organiser changes a round</p>
              <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
                Enter the organiser PIN to carry on.
              </p>
              <InlineUnlock
                tripCode={door.tripCode}
                passcodeHash={door.passcodeHash}
                onUnlocked={() => setUnlocked(true)}
                prompt="Enter the PIN"
              />
            </div>
          )}

          <div className={`p-4 ${cardClass()}`}>
            <div className="flex items-center justify-between gap-4">
              <p className="text-ink text-sm font-medium">Counts towards the league</p>
              <Toggle
                checked={counts}
                onChange={setCounting}
                label="Counts towards the league"
              />
            </div>
            <p className="text-ink/65 text-[13px] mt-2 leading-snug">
              {counts
                ? 'Switch off for a round rained off or short of players. Its scores are kept.'
                : 'Not counting. Its scores are kept and its own leaderboard shows, greyed; the overall skips it. Switch back any time.'}
            </p>
          </div>
        </Sheet>
      )}
    </>
  )
}
