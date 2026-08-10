'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  type ItineraryItem,
  addItem, dayCount, dateForDay, dayNumber, itemError,
} from '@/lib/itinerary'
import { saveItinerary } from '@/lib/itineraryStore'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import {
  Sheet, GolfFields, golfDraftFields, EMPTY_GOLF_DRAFT, type GolfDraft,
} from '@/app/components/ItineraryForms'
import { FIELD_LABEL } from '@/app/components/ui'
import { IconPlus } from '@/app/components/icons'

/**
 * Adding a round from the scoring screen — the door for the impromptu game.
 *
 * A subgroup standing in a car park deciding to play an extra course should
 * not have to find Trip Setup, open the gear, open the itinerary and know
 * that golf lives there. The + opens the same golf form the itinerary uses
 * (`GolfFields` — one form, two openings) in a sheet that rises from below,
 * and the save goes through `saveItinerary`, so the round lands exactly as
 * an itinerary edit would land it: a golf item on the chosen day, the round
 * with the next number, handicap snapshots for every player.
 */
export default function AddRound({
  tripId, startDate, endDate, trackStats, items, players, courses,
}: {
  tripId: string
  startDate: string | null
  endDate: string | null
  trackStats: boolean
  /** The whole itinerary as saved — the diff needs what already exists. */
  items: ItineraryItem[]
  players: { id: string; handicap: number | null }[]
  courses: DirectoryCourse[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<GolfDraft>(EMPTY_GOLF_DRAFT)
  const [dayIndex, setDayIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const days = dayCount(startDate, endDate)

  // Same convention as the builder: a course added from the picker mid-flow
  // lives here, because the page fetched its list before this sheet existed.
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

  function openSheet() {
    setDraft(EMPTY_GOLF_DRAFT)
    setDayIndex(todayIndex(startDate, days))
    setError(null)
    setOpen(true)
  }

  async function add() {
    const problem = itemError({ kind: 'golf', courseId: draft.courseId, teeCount: draft.teeCount })
    if (problem) { setError(problem); return }

    setSaving(true)
    setError(null)
    const after = addItem(items, {
      id: 'tmp-1', dayIndex, kind: 'golf', ...golfDraftFields(draft),
    })
    const result = await saveItinerary({
      tripId, startDate, before: items, after, lockedGolfItemIds: [], players,
    })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    setOpen(false)
    // The new round's tile comes back from the server, not from assumption.
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-label="Add a round"
        className="w-11 h-11 -mr-1 rounded-full bg-cream border border-bark/25 flex items-center justify-center text-accent-deep hover:border-accent transition-colors duration-150"
      >
        <IconPlus size={18} />
      </button>

      {open && (
        <Sheet
          title="Add a round"
          onClose={() => !saving && setOpen(false)}
          onAdd={add}
          addLabel={saving ? 'Adding…' : 'Add round'}
          error={error}
        >
          {/* Which day it is played. The builder knows because a day is
              open; here the question has to be asked — defaulting to today,
              which is when an impromptu round is usually for. One day needs
              no question. */}
          {days > 1 && (
            <div>
              <label className={FIELD_LABEL}>Day</label>
              <div className="-mx-4 px-4 overflow-x-auto">
                <div className="flex gap-2 w-max">
                  {Array.from({ length: days }, (_, i) => {
                    const active = i === dayIndex
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setDayIndex(i)}
                        className={`flex-shrink-0 px-3 py-2 rounded-xl border transition-colors duration-150 ${
                          active
                            ? 'border-accent bg-accent/[0.10] text-ink'
                            : 'border-bark/12 bg-surface text-ink/80 hover:border-bark/25'
                        }`}
                      >
                        <span className="block t-label">Day {i + 1}</span>
                        <span className="block t-cap text-ink/65 mt-0.5">
                          {shortDate(dateForDay(startDate, i)) ?? '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <GolfFields
            draft={draft}
            onChange={setDraft}
            courses={allCourses}
            onCourseAdded={upsertCourse}
            trackStats={trackStats}
          />
        </Sheet>
      )}
    </>
  )
}

/**
 * The trip day today falls on, clamped into the trip.
 *
 * Read off the device's own calendar date — the person adding a round is
 * standing in the day they mean. Before the trip that clamps to day one,
 * after it to the last day, and a trip with no dates has only day 0.
 * Called on tap, never during render, so the clock cannot disagree with
 * anything the server drew.
 */
function todayIndex(startDate: string | null, days: number): number {
  const start = dayNumber(startDate)
  if (start === null) return 0
  const now = new Date()
  const today = dayNumber(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  )
  if (today === null) return 0
  const index = Math.round((today - start) / 86_400_000)
  return Math.max(0, Math.min(days - 1, index))
}

/** "Fri 12 Sep" under a day chip — or null with no dates to say. */
function shortDate(date: string | null): string | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}
