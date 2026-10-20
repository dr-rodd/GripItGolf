'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { addItem, dayNumber } from '@/lib/itinerary'
import { saveItinerary } from '@/lib/itineraryStore'
import { nextEventIssue } from '@/lib/leagueSetup'
import { hasUnlocked, isLocked } from '@/lib/passcode'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { Sheet } from '@/app/components/ItineraryForms'
import CourseSelect from '@/app/components/CourseSelect'
import DateField from '@/app/components/DateField'
import InlineUnlock from '@/app/components/InlineUnlock'
import { FIELD_LABEL, cardClass } from '@/app/components/ui'
import { IconPlus } from '@/app/components/icons'
import { useSheetData } from './AddRound'

/**
 * Adding a series' next event — the door for a league played as it goes.
 *
 * A winter league turns up on the day: somebody opens the Scoring tab,
 * adds today's event with its venue, and the group scores it
 * (docs/event-use-cases.md). The event is a golf item and its round, on its
 * own date at its offset from the first event, written through the same
 * `saveItinerary` every other round goes through — the next number, and a
 * handicap snapshot for everybody who has a handicap.
 *
 * The trip runs from its first event to its last, so an event past the end
 * moves the end on first. That order is deliberate: an end date stretched
 * with no event under it yet is a harmless longer range, and the retry
 * makes the event; the other way round, an event could sit outside its own
 * league's dates.
 *
 * Who may: the organiser, always, with the PIN asked in place; the field
 * when the organiser has switched on `add_events`. Adding a course from the
 * picker is the field's only with `add_courses` — the first surface on an
 * event where a participant meets the add-course form, so the gate the
 * registry promised is read here.
 */
export default function AddEvent({
  tripId, tripCode, startDate, endDate, eventDates, lastVenueId,
  fieldMayAdd, fieldMayAddCourses, passcodeHash,
}: {
  tripId: string
  tripCode: string
  /** The first event's date — the trip's start. */
  startDate: string
  endDate: string | null
  /** Every date the series already has an event on. */
  eventDates: string[]
  /** The most recent event's course, offered first — a league has a home. */
  lastVenueId: string | null
  /** `add_events` is on: the field adds events without the PIN. */
  fieldMayAdd: boolean
  /** `add_courses` is on: the field may add a missing course from the picker. */
  fieldMayAddCourses: boolean
  passcodeHash: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [date, setDate] = useState('')
  const [courseId, setCourseId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Fetched when the sheet exists and not before — the Scoring tab's rule,
  // the same as AddRound's.
  const { courses } = usePlatformCourses(open)
  const { items, players, state: dataState } = useSheetData(tripId, open)

  const [addedCourses, setAddedCourses] = useState<DirectoryCourse[]>([])
  const allCourses = useMemo(() => {
    const known = new Set(courses.map(c => c.id))
    return [...courses, ...addedCourses.filter(c => !known.has(c.id))]
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [courses, addedCourses])
  const upsertCourse = (course: DirectoryCourse) =>
    setAddedCourses(prev => prev.some(c => c.id === course.id)
      ? prev.map(c => (c.id === course.id ? course : c))
      : [...prev, course])

  const organiser = unlocked || !isLocked(passcodeHash)
  const mayAdd = fieldMayAdd || organiser

  function openSheet() {
    // Read on tap, never during render: the unlock lives in sessionStorage
    // and the date on the device's own calendar.
    setUnlocked(hasUnlocked(tripCode))
    const today = localToday()
    setDate(nextEventIssue(today, { startDate, eventDates }) ? '' : today)
    setCourseId(lastVenueId ?? '')
    setError(null)
    setOpen(true)
  }

  async function add() {
    if (!mayAdd) {
      setError('Adding an event needs the organiser PIN.')
      return
    }
    // `items` is the `before` half of the diff — a failed fetch must stop the
    // save rather than stand in as an empty itinerary (AddRound says why).
    if (dataState !== 'ready' || !items || !players) {
      setError(dataState === 'failed'
        ? 'Could not load the event’s existing rounds — try again'
        : 'Still loading the event’s rounds — try again in a moment')
      return
    }
    const issue = nextEventIssue(date, { startDate, eventDates })
    if (issue) { setError(issue); return }
    if (!courseId) { setError('Pick a venue for the event.'); return }

    setSaving(true)
    setError(null)

    if (!endDate || date > endDate) {
      const { error: endErr } = await supabase
        .from('trips')
        .update({ end_date: date })
        .eq('id', tripId)
      if (endErr) {
        setSaving(false)
        setError('Could not add the event — try again.')
        return
      }
    }

    const dayIndex = (dayNumber(date)! - dayNumber(startDate)!) / 86_400_000
    const after = addItem(items, {
      id: 'tmp-1', dayIndex, kind: 'golf', courseId, teeTime: null, teeCount: 1,
    })
    const result = await saveItinerary({
      tripId, startDate, before: items, after, lockedGolfItemIds: [], players,
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
        <span className="t-label text-ink">Add event</span>
      </button>

      {open && (
        <Sheet
          title="Add the next event"
          onClose={() => !saving && setOpen(false)}
          onAdd={add}
          addLabel={saving ? 'Adding…' : 'Add event'}
          error={error}
        >
          {!mayAdd && passcodeHash && (
            <div className={`p-4 ${cardClass()}`}>
              <p className="text-ink text-sm font-medium">The organiser adds events</p>
              <p className="text-ink/65 text-[13px] mt-0.5 mb-3 leading-snug">
                Enter the organiser PIN to add this one.
              </p>
              <InlineUnlock
                tripCode={tripCode}
                passcodeHash={passcodeHash}
                onUnlocked={() => setUnlocked(true)}
                prompt="Enter the PIN"
              />
            </div>
          )}

          <DateField label="Date" value={date} onChange={setDate} min={startDate} />

          <div>
            <label className={FIELD_LABEL}>Venue</label>
            <CourseSelect
              courses={allCourses}
              value={courseId}
              onChange={setCourseId}
              onCourseAdded={upsertCourse}
              allowAdd={organiser || fieldMayAddCourses}
            />
          </div>
        </Sheet>
      )}
    </>
  )
}

/** Today on the device's own calendar, as YYYY-MM-DD — the day being played. */
function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
