'use client'

import { useMemo, useRef, useState } from 'react'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  type DropAnimation, defaultDropAnimationSideEffects,
  MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  type ItineraryItem, type ItemKind, type TravelMode,
  TRAVEL_MODES, MAX_ACTIVITY_NAME,
  addItem, addStay, removeItem, moveItem, itemsForDay, dayCount, dateForDay,
  describeDay, describeItem, itemError, nightsAvailable, golfUntil,
} from '@/lib/itinerary'
import {
  IconFlag, IconHome, IconArrowRight, IconFork, IconPlus, IconX,
} from './icons'
import { FIELD, FIELD_LABEL, Badge } from './ui'
import {
  Sheet, Stepper, GolfFields, golfDraftFields, EMPTY_GOLF_DRAFT, type GolfDraft,
} from './ItineraryForms'
import type { DirectoryCourse } from '@/lib/courseDirectory'

/**
 * Building a trip's running order, a day at a time.
 *
 * One day is open at a time. Its items are tiles in the order they happen,
 * and the way forward is pinned to the bottom of the screen — on a phone
 * that is where the thumb already is, and the alternative is an add button
 * per day repeated down a long page.
 *
 * Everything is held in the caller's state. This component never talks to a
 * database: the trip creation flow writes the lot at the end, and the model
 * (lib/itinerary.ts) is pure so the ordering can be tested without one.
 */

type Course = DirectoryCourse

const KIND_ICON = {
  golf: IconFlag,
  stay: IconHome,
  travel: IconArrowRight,
  activity: IconFork,
} as const

const KIND_LABEL = { golf: 'Golf', stay: 'Stay', travel: 'Travel', activity: 'Activity' } as const

/**
 * The order the add buttons appear in, and the only list of them.
 *
 * Golf, a bed, getting there — then everything else the trip is. Activity is
 * last because it is the one that is optional in a way the other three are
 * not: a trip without a dinner booked is a trip; a trip without golf is not.
 */
const KINDS: ItemKind[] = ['golf', 'stay', 'travel', 'activity']

// ─── A tile ────────────────────────────────────────────────────

function Tile({
  item, courseName, onRemove, dragging = false, extraDetail,
}: {
  item: ItineraryItem
  courseName?: string | null
  onRemove?: () => void
  dragging?: boolean
  /** Appended to the detail line — the single-day golf window uses it. */
  extraDetail?: string | null
}) {
  const Icon = KIND_ICON[item.kind]
  const lines = describeItem(item, courseName)
  const { title } = lines
  const detail = [lines.detail, extraDetail ?? ''].filter(Boolean).join(' · ')

  return (
    <div
      className={`flex items-center gap-3 bg-surface border rounded-xl px-3 py-3 ${
        dragging ? 'border-accent/50' : 'border-bark/12'
      }`}
    >
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-bark/[0.06] flex items-center justify-center text-bark">
        <Icon size={17} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block t-card text-ink truncate">{title}</span>
        {detail && <span className="block t-cap text-ink/65 mt-0.5 truncate">{detail}</span>}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-ink/50 hover:text-rust transition-colors duration-150"
        >
          <IconX size={16} />
        </button>
      )}
    </div>
  )
}

/**
 * A tile that can be dragged, and that slides aside when another one is
 * dragged over it.
 *
 * The sliding is the point. A list that only reorders on release leaves the
 * reader working out afterwards what moved and where it went; the tiles
 * moving out of the way as you go is what makes the drop predictable before
 * you let go. dnd-kit drives that through a transform and a transition it
 * hands back here, so `.itin-tile` exists purely to give the reduced-motion
 * rule in globals.css something to switch off.
 */
function SortableTile({
  item, courseName, onRemove, locked = false, extraDetail,
}: {
  item: ItineraryItem; courseName?: string | null; onRemove: () => void
  locked?: boolean; extraDetail?: string | null
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id, disabled: locked })

  return (
    <div
      ref={setNodeRef}
      {...(locked ? {} : listeners)}
      {...attributes}
      className={`itin-tile mb-2 ${locked ? '' : 'touch-none'}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        // Left in place as a gap so the list keeps its height while the
        // overlay carries the tile around
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <Tile
        item={item}
        courseName={courseName}
        onRemove={locked ? undefined : onRemove}
        extraDetail={extraDetail}
      />
    </div>
  )
}

/**
 * The tile settling into its new slot on release.
 *
 * Without this the overlay disappears the instant a finger lifts and the
 * tile reappears elsewhere, which reads as a glitch rather than a move.
 * Ease-out, inside the 250–350ms the guide allows for something this size.
 */
const DROP_ANIMATION: DropAnimation = {
  duration: 260,
  easing: 'ease-out',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.35' } },
  }),
}

// The add sheets and the golf form they share with the scoring screen live
// in ./ItineraryForms — one form, two openings, or the two drift.

/**
 * The single-day sheets' first question: what kind of addition this is.
 *
 * One Add activity button stands where multi-day has three, so the choice
 * between dinner, a journey and a bed moves inside the sheet — switching
 * chips swaps the fields below without closing it. Golf is not here: it has
 * its own button up in the day, because it is the event and these are the
 * trimmings.
 */
function KindSwitch({ current, onSwitch }: {
  current: ItemKind
  onSwitch: (kind: ItemKind) => void
}) {
  const kinds: ItemKind[] = ['activity', 'travel', 'stay']
  return (
    <div>
      <label className={FIELD_LABEL}>What are you adding?</label>
      <div className="grid grid-cols-3 gap-2">
        {kinds.map(k => {
          const Icon = KIND_ICON[k]
          return (
            <button
              key={k} type="button" onClick={() => onSwitch(k)}
              aria-pressed={current === k}
              className={`flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border t-label transition-colors duration-150 ${
                current === k
                  ? 'border-accent bg-accent/[0.10] text-ink'
                  : 'border-bark/25 bg-surface text-ink/80'
              }`}
            >
              <Icon size={15} />{KIND_LABEL[k]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────

export default function ItineraryBuilder({
  startDate, endDate, courses, items, onChange, onContinue, blockedReason = null,
  lockedGolfIds, trackStats = false, continueLabel = 'Proceed to Add Players',
}: {
  startDate: string | null
  endDate: string | null
  courses: Course[]
  items: ItineraryItem[]
  onChange: (items: ItineraryItem[]) => void
  /** Called from the last day, once there is nowhere further to go. */
  onContinue: () => void
  /** Why the trip cannot be taken further yet, if anything. */
  blockedReason?: string | null
  /**
   * What the last day's button says. Creation is walking towards the next
   * step of the wizard; the settings editor is walking towards a save, and
   * "Proceed to Add Players" says something that has already happened.
   */
  continueLabel?: string
  /**
   * Golf items whose round already has a score or a card open on it.
   *
   * Those tiles cannot be moved or removed — a course change would orphan
   * real data — so they carry no remove button and refuse a drag. The lock
   * is per round, not per trip: golf nobody has played is still editable,
   * and new golf can be added at any point, mid-trip included.
   */
  lockedGolfIds?: readonly string[]
  /**
   * Whether this trip records putts and fairways. Decides only whether a
   * casual round is asked about feeding the trip stats — a trip without
   * stats has nothing to ask.
   */
  trackStats?: boolean
}) {
  const days = dayCount(startDate, endDate)
  /**
   * A single-day event wears a different face on the same model. There is
   * no "Day 1" — there is only the day — so the day strip goes, golf gets
   * the big Set Venue button (it is the main event, not one of four equal
   * add buttons), and everything that is not golf shares one Add activity
   * button whose sheet asks what kind it is. The items, the drag ordering
   * and the write path are exactly the multi-day ones.
   */
  const singleDay = days === 1
  const locked = useMemo(() => new Set(lockedGolfIds ?? []), [lockedGolfIds])
  const [openDay, setOpenDay] = useState(0)
  const [sheet, setSheet] = useState<ItemKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<ItineraryItem | null>(null)

  // Draft state for whichever sheet is open
  const [golfDraft, setGolfDraft] = useState<GolfDraft>(EMPTY_GOLF_DRAFT)
  const [stayName, setStayName] = useState('')
  const [nights, setNights] = useState(1)
  const [mode, setMode] = useState<TravelMode>('car')
  const [fromPlace, setFromPlace] = useState('')
  const [toPlace, setToPlace] = useState('')
  const [hours, setHours] = useState('')
  const [mins, setMins] = useState('')
  const [activityName, setActivityName] = useState('')
  const [activityTime, setActivityTime] = useState('')

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A press-and-hold, so a drag is never started by a scroll
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )

  /**
   * Courses added from the picker mid-build. They live here rather than in
   * the caller's list because the caller fetched its list once, before this
   * screen existed — and a course you just added has to be pickable *now*,
   * not after a refetch. Upserted by id: adding fires once on creation and
   * again if the scorecard confirms it, with the verified flag flipped.
   */
  const [addedCourses, setAddedCourses] = useState<Course[]>([])
  const allCourses = useMemo(() => {
    const known = new Set(courses.map(c => c.id))
    return [...courses, ...addedCourses.filter(c => !known.has(c.id))]
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [courses, addedCourses])
  const upsertCourse = (course: Course) =>
    setAddedCourses(prev => prev.some(c => c.id === course.id)
      ? prev.map(c => (c.id === course.id ? course : c))
      : [...prev, course])

  const courseName = (id?: string | null) =>
    allCourses.find(c => c.id === id)?.name ?? null

  /**
   * A key for a tile that has not been saved yet.
   *
   * A counter rather than a clock and a random number: both are impure, and
   * a component has no business reaching for either. Seeded past whatever is
   * already on the list the first time it is asked, so stepping away to the
   * players screen and back cannot hand out a key that is still in use.
   * These live only until the trip is created, when the database issues the
   * real ids.
   */
  const nextKey = useRef(-1)
  function newId() {
    if (nextKey.current < 0) {
      nextKey.current = items.reduce((max, i) => {
        const n = Number(/^tmp-(\d+)/.exec(i.id)?.[1] ?? NaN)
        return Number.isFinite(n) ? Math.max(max, n + 1) : max
      }, 0)
    }
    return `tmp-${nextKey.current++}`
  }

  const lastDay = openDay >= days - 1
  const maxNights = nightsAvailable(openDay, days)

  function openSheet(kind: ItemKind) {
    setError(null)
    setGolfDraft(EMPTY_GOLF_DRAFT)
    setStayName(''); setNights(1)
    setMode('car'); setFromPlace(''); setToPlace(''); setHours(''); setMins('')
    setActivityName(''); setActivityTime('')
    setSheet(kind)
  }

  /**
   * Flip an open single-day sheet to another kind without closing it. The
   * drafts were all reset when the sheet opened, so what was typed under
   * one kind never leaks into another's saved item — `commit` only reads
   * the fields of whichever kind is showing.
   */
  function switchKind(kind: ItemKind) {
    setError(null)
    setSheet(kind)
  }

  function commit() {
    if (!sheet) return
    const id = newId()
    const duration =
      (parseInt(hours) || 0) * 60 + (parseInt(mins) || 0)

    // A stay is entered once and lands on every night it covers, so it is
    // built through its own function rather than as a single draft.
    if (sheet === 'stay') {
      const problem = itemError({ kind: 'stay', stayName })
      if (problem) { setError(problem); return }
      onChange(addStay(items, { id, dayIndex: openDay, stayName }, nights, days))
      setSheet(null)
      return
    }

    const draft: Omit<ItineraryItem, 'position'> =
      sheet === 'golf'
        ? { id, dayIndex: openDay, kind: 'golf', ...golfDraftFields(golfDraft) }
        : sheet === 'activity'
        ? {
            id, dayIndex: openDay, kind: 'activity',
            activityName, activityTime: activityTime || null,
          }
        : {
            id, dayIndex: openDay, kind: 'travel', travelMode: mode,
            fromPlace, toPlace, durationMins: duration || null,
          }

    const problem = itemError(draft)
    if (problem) { setError(problem); return }

    onChange(addItem(items, draft))
    setSheet(null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDragging(null)
    if (!over || active.id === over.id) return
    // Both ids are tiles in the open day, so the target's index is where the
    // dragged one is going.
    const to = dayItems.findIndex(i => i.id === over.id)
    if (to < 0) return
    onChange(moveItem(items, String(active.id), openDay, to))
  }

  const dayItems = itemsForDay(items, openDay)

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }: DragStartEvent) =>
        setDragging(items.find(i => i.id === active.id) ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {/* Clearance for the pinned footer: three add buttons, the way
          forward under them, and the home indicator below that. */}
      <div className="pb-48">

        {locked.size > 0 && (
          <div className="flex items-start gap-3 px-4 py-3 mb-4 bg-accent/10 border border-accent/40 rounded-xl">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            <p className="text-accent text-[13px] leading-snug">
              Rounds with scores are locked and stay where they are. New golf,
              stays, journeys and activities can still be added.
            </p>
          </div>
        )}

        {/* Day picker. Horizontal, because a week does not fit vertically
            above the content it is filtering. One day needs no picker —
            a strip with a single chip saying "Day 1" is furniture. */}
        {days > 1 && (
        <div className="-mx-4 px-4 overflow-x-auto mb-5">
          <div className="flex gap-2 w-max">
            {Array.from({ length: days }, (_, i) => {
              const count = itemsForDay(items, i).length
              const active = i === openDay
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setOpenDay(i)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl border transition-colors duration-150 ${
                    active
                      ? 'border-accent bg-accent/[0.10] text-ink'
                      : 'border-bark/12 bg-surface text-ink/80 hover:border-bark/25'
                  }`}
                >
                  <span className="block t-label">Day {i + 1}</span>
                  <span className="block t-cap text-ink/65 mt-0.5">
                    {count === 0 ? 'empty' : `${count} item${count === 1 ? '' : 's'}`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* On a single day with no date the fallback would read "Day 1",
            which is exactly the redundancy dropping the strip removed. */}
        <p className="t-h2 text-ink mb-1">
          {singleDay && dateForDay(startDate, openDay) === null
            ? 'The day'
            : describeDay(dateForDay(startDate, openDay), openDay)}
        </p>
        <p className="t-cap text-ink/65 mb-4">
          {singleDay
            ? (dayItems.length === 0
              ? 'Golf is the main event — set the venue, then build the day around it.'
              : 'Press and hold a tile to move it. Times can overlap the golf — dinner booked while the last groups are out is a normal day.')
            : (dayItems.length === 0
              ? 'Nothing yet — add golf, a stay, a journey or an activity below.'
              : 'Press and hold a tile to move it.')}
        </p>

        {/* The day's running order. On a single day the golf tile also says
            when the course gives the day back — five hours from the last
            tee time — so an activity timed inside that window reads as
            deliberate, not as a clash nobody noticed. */}
        <SortableContext items={dayItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div>
            {dayItems.map(item => (
              <SortableTile
                key={item.id}
                item={item}
                courseName={courseName(item.courseId)}
                onRemove={() => onChange(removeItem(items, item.id))}
                locked={locked.has(item.id) && item.kind === 'golf'}
                extraDetail={singleDay && item.kind === 'golf' ? golfUntil(item) : null}
              />
            ))}
          </div>
        </SortableContext>

        {/* Golf is the main event of a single day, so its button is not one
            of four equal squares at the bottom — it is the big move, in the
            space the day occupies, and it changes its manner once made:
            Set Venue while there is none, a quiet way to a second round
            (a 36-hole day is a real day) once there is. */}
        {singleDay && (
          dayItems.some(i => i.kind === 'golf') ? (
            <button
              type="button"
              onClick={() => openSheet('golf')}
              className="w-full py-4 border border-dashed border-bark/25 rounded-xl text-ink/65 t-label hover:border-accent hover:text-ink/80 transition-colors duration-150"
            >
              + Add another round
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openSheet('golf')}
              className="w-full py-8 bg-accent-deep text-white rounded-2xl hover:bg-accent transition-colors duration-150 flex flex-col items-center gap-2"
            >
              <IconFlag size={24} />
              <span className="text-sm font-bold tracking-[0.2em] uppercase">Set Venue</span>
              <span className="t-cap text-white/80 normal-case tracking-normal">
                The course, the tee times — the day starts here
              </span>
            </button>
          )
        )}

        {!singleDay && dayItems.length === 0 && (
          <div className="border border-dashed border-bark/25 rounded-xl py-10 text-center">
            <p className="t-body text-ink/65">Nothing added yet. Get your golf in!</p>
          </div>
        )}
      </div>

      {/* The way forward, pinned where the thumb is. The four ways to fill
          a day sit above the way out of it, and carry the extra height —
          they are what this screen is for, and the one underneath is where
          you go when you are finished with it.

          Four across rather than two rows of two: on the narrowest phone the
          guide supports they still clear the tap-target minimum, and a
          second row would push the way out of the day below the fold. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-cream/95 backdrop-blur-sm border-t border-bark/12"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
      >
        <div className="max-w-lg mx-auto px-4 pt-3">
          {/* A single day: golf has its own big button up in the day, so
              everything else shares one — the sheet it opens asks what kind
              of addition it is. Multi-day keeps the four ways to fill a
              day, unchanged. */}
          {singleDay ? (
            <button
              type="button"
              onClick={() => openSheet('activity')}
              className="w-full flex items-center justify-center gap-1.5 min-h-[64px] rounded-xl border border-bark/25 bg-surface text-ink hover:border-accent transition-colors duration-150"
            >
              <span className="flex items-center gap-1 text-accent">
                <IconPlus size={14} /><IconFork size={18} />
              </span>
              <span className="t-label">Add activity</span>
            </button>
          ) : (
          <div className="grid grid-cols-4 gap-2">
            {KINDS.map(kind => {
              const Icon = KIND_ICON[kind]
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => openSheet(kind)}
                  className="flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl border border-bark/25 bg-surface text-ink hover:border-accent transition-colors duration-150"
                >
                  <span className="flex items-center gap-1 text-accent">
                    <IconPlus size={14} /><Icon size={18} />
                  </span>
                  <span className="t-label">{KIND_LABEL[kind]}</span>
                </button>
              )
            })}
          </div>
          )}

          {/* Never disabled by an empty day — a day with nothing planned on
              it is a normal day, not an unfinished one. Only a genuine
              problem with the trip as a whole stops it. */}
          <button
            type="button"
            disabled={lastDay && !!blockedReason}
            onClick={() => (lastDay ? onContinue() : setOpenDay(d => d + 1))}
            className={`w-full mt-2 min-h-[52px] rounded-xl border t-label transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
              lastDay
                ? 'border-accent bg-accent-deep text-white hover:bg-accent'
                : 'border-bark/25 bg-surface text-ink hover:border-bark/40'
            }`}
          >
            {lastDay ? continueLabel : `Continue to Day ${openDay + 2}`}
          </button>

          {lastDay && blockedReason && (
            <p className="t-cap text-rust-deep text-center mt-2">{blockedReason}</p>
          )}
        </div>
      </div>

      {/* ── Sheets ── */}

      {sheet === 'golf' && (
        <Sheet title="Add golf" onClose={() => setSheet(null)} onAdd={commit} addLabel="Add golf" error={error}>
          <GolfFields
            draft={golfDraft}
            onChange={setGolfDraft}
            courses={allCourses}
            onCourseAdded={upsertCourse}
            trackStats={trackStats}
          />
        </Sheet>
      )}

      {sheet === 'stay' && (
        <Sheet title="Add a stay" onClose={() => setSheet(null)} onAdd={commit} addLabel="Add stay" error={error}>
          {singleDay && <KindSwitch current="stay" onSwitch={switchKind} />}
          <div>
            <label className={FIELD_LABEL} htmlFor="it-stay">Accommodation</label>
            <input
              id="it-stay" type="text" value={stayName} autoFocus
              onChange={e => setStayName(e.target.value)}
              placeholder="Where are you staying?"
              className={FIELD}
            />
          </div>

          <Stepper
            label="How many nights"
            value={Math.min(nights, maxNights)}
            min={1}
            max={maxNights}
            unit={n => (n === 1 ? 'night' : 'nights')}
            onChange={setNights}
          />

          <p className="t-cap text-ink/65">
            {nights > 1
              ? `Added to each of the next ${nights} days, so every night has somewhere to sleep on it.`
              : 'Staying more than one night? It will be added to each day.'}
          </p>
        </Sheet>
      )}

      {sheet === 'travel' && (
        <Sheet title="Add a journey" onClose={() => setSheet(null)} onAdd={commit} addLabel="Add journey" error={error}>
          {singleDay && <KindSwitch current="travel" onSwitch={switchKind} />}
          <div>
            <label className={FIELD_LABEL}>How</label>
            <div className="grid grid-cols-3 gap-2">
              {TRAVEL_MODES.map(m => (
                <button
                  key={m} type="button" onClick={() => setMode(m)}
                  className={`min-h-[48px] rounded-xl border t-label capitalize transition-colors duration-150 ${
                    mode === m
                      ? 'border-accent bg-accent/[0.10] text-ink'
                      : 'border-bark/25 bg-surface text-ink/80'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="min-w-0">
              <label className={FIELD_LABEL} htmlFor="it-from">From</label>
              <input id="it-from" type="text" value={fromPlace}
                onChange={e => setFromPlace(e.target.value)} placeholder="Dublin"
                className={`${FIELD} min-w-0`} />
            </div>
            <div className="min-w-0">
              <label className={FIELD_LABEL} htmlFor="it-to">To</label>
              <input id="it-to" type="text" value={toPlace}
                onChange={e => setToPlace(e.target.value)} placeholder="Carne"
                className={`${FIELD} min-w-0`} />
            </div>
          </div>

          <div>
            <label className={FIELD_LABEL}>How long</label>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <input type="number" inputMode="numeric" min={0} max={48} value={hours}
                onChange={e => setHours(e.target.value)} placeholder="Hours"
                className={`${FIELD} min-w-0`} />
              <input type="number" inputMode="numeric" min={0} max={59} value={mins}
                onChange={e => setMins(e.target.value)} placeholder="Minutes"
                className={`${FIELD} min-w-0`} />
            </div>
          </div>
        </Sheet>
      )}

      {sheet === 'activity' && (
        <Sheet title="Add an activity" onClose={() => setSheet(null)} onAdd={commit} addLabel="Add activity" error={error}>
          {singleDay && <KindSwitch current="activity" onSwitch={switchKind} />}
          <div>
            <label className={FIELD_LABEL} htmlFor="it-activity">What is it?</label>
            <input
              id="it-activity" type="text" value={activityName} autoFocus
              maxLength={MAX_ACTIVITY_NAME}
              onChange={e => setActivityName(e.target.value)}
              placeholder="Dinner at the Beach House"
              className={FIELD}
            />
          </div>

          {/* Its own row and full width, for the same reason the tee time is:
              a native time control sizes itself to its own preference and
              runs into whatever sits beside it. */}
          <div>
            <label className={FIELD_LABEL} htmlFor="it-activity-time">Time</label>
            <input
              id="it-activity-time" type="time" value={activityTime}
              onChange={e => setActivityTime(e.target.value)}
              className={`${FIELD} block min-w-0 max-w-full`}
              style={{
                WebkitAppearance: 'none',
                appearance: 'none',
                minWidth: 0,
                maxWidth: '100%',
              }}
            />
          </div>

          <p className="t-cap text-ink/65">
            Dinner, a boat trip, anything that is not golf. The time is
            optional — leave it blank if it is not booked yet.
          </p>
        </Sheet>
      )}

      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {dragging && (
          <div className="w-[calc(100vw-2rem)] max-w-lg shadow-lg shadow-bark/20">
            <Tile item={dragging} courseName={courseName(dragging.courseId)} dragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

/** The summary badge for a day, reused by the trip hub. */
export function DayBadge({ count }: { count: number }) {
  return <Badge>{count === 0 ? 'Nothing planned' : `${count} item${count === 1 ? '' : 's'}`}</Badge>
}
