'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  type ItineraryItem,
  addItem, dayCount, dateForDay, dayNumber, itemError,
} from '@/lib/itinerary'
import { fromItemRow, type ItemRow } from '@/lib/itinerarySync'
import { saveItinerary } from '@/lib/itineraryStore'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
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
  tripId, startDate, endDate, trackStats,
}: {
  tripId: string
  startDate: string | null
  endDate: string | null
  trackStats: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<GolfDraft>(EMPTY_GOLF_DRAFT)
  const [dayIndex, setDayIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Everything this sheet needs, fetched when the sheet exists and not before
  // — the catalogue included. The Scoring tab is a list of rounds; it does
  // not need a course directory, the whole itinerary and every player's
  // handicap to draw one, and it was carrying all three on every visit for a
  // sheet most visits never open. See the note in `usePlatformCourses`.
  const { courses } = usePlatformCourses(open)
  const { items, players, state: dataState } = useSheetData(tripId, open)

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
    // The itinerary this sheet was handed is the `before` half of a diff, and
    // a diff against an empty `before` reads as "remove everything". So a
    // failed or unfinished fetch stops the save dead rather than defaulting to
    // `[]` — the one way moving this data off the server could have done real
    // harm, and the reason `dataState` exists rather than a bare `?? []`.
    if (dataState !== 'ready' || !items || !players) {
      setError(dataState === 'failed'
        ? 'Could not load the trip’s existing rounds — try again'
        : 'Still loading this trip’s rounds — try again in a moment')
      return
    }

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
      {/* Dressed like the round tiles below it — same surface, same corner —
          because it belongs to the same family: one more thing on this page
          you can open. The word is there because a bare + was a mystery. */}
      <button
        type="button"
        onClick={openSheet}
        className="flex-shrink-0 flex items-center gap-2 pl-3.5 pr-4 py-2.5 -mr-1 rounded-2xl bg-surface border border-bark/[0.08] hover:border-accent press"
      >
        <span className="text-accent-deep"><IconPlus size={16} /></span>
        <span className="t-label text-ink">Add round</span>
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
 * The itinerary and the players, fetched when the sheet opens.
 *
 * Two queries that used to sit in the page's own `Promise.all`, serialised
 * into the HTML of the Scoring tab on every visit, so that a sheet behind a
 * `+` could have its data ready in case anybody pressed it. The tab is the
 * one screen a group loads over and over on a course, often on bad signal,
 * and this is the CLAUDE.md rule about a list fetched for a control behind a
 * tap — the same rule the platform course catalogue already followed.
 *
 * `state` is not decoration. `items` is the `before` half of the diff
 * `saveItinerary` writes from, and an empty `before` against a populated
 * `after` is a request to delete the trip's whole itinerary. So the three
 * cases are kept apart and only `ready` may save.
 */
function useSheetData(tripId: string, enabled: boolean) {
  const [items, setItems] = useState<ItineraryItem[] | null>(null)
  const [players, setPlayers] = useState<{ id: string; handicap: number | null }[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')

  useEffect(() => {
    if (!enabled || state === 'ready' || state === 'loading') return
    let live = true
    setState('loading')

    Promise.all([
      supabase
        .from('itinerary_items')
        .select('id, day_index, position, kind, course_id, tee_time, tee_count, ' +
                'stay_name, travel_mode, from_place, to_place, duration_mins, ' +
                'activity_name, activity_time')
        .eq('trip_id', tripId)
        .order('day_index')
        .order('position'),
      supabase
        .from('players')
        .select('id, handicap')
        .eq('trip_id', tripId)
        .eq('is_composite', false),
    ]).then(([itinRes, playerRes]) => {
      if (!live) return
      if (itinRes.error || playerRes.error) {
        console.error('AddRound sheet data failed:', itinRes.error ?? playerRes.error)
        setState('failed')
        return
      }
      setItems(((itinRes.data ?? []) as unknown as (Omit<ItemRow, 'trip_id'> & { id: string })[])
        .map(fromItemRow))
      setPlayers(playerRes.data ?? [])
      setState('ready')
    })

    return () => { live = false }
  }, [tripId, enabled, state])

  return { items, players, state }
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
