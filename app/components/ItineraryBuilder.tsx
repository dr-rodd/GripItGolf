'use client'

import { useRef, useState } from 'react'
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
  TRAVEL_MODES, MAX_TEE_TIMES,
  addItem, addStay, removeItem, moveItem, itemsForDay, dayCount, dateForDay,
  describeDay, describeItem, itemError, nightsAvailable,
} from '@/lib/itinerary'
import {
  IconFlag, IconHome, IconArrowRight, IconPlus, IconX, IconChevronDown,
} from './icons'
import { FIELD, FIELD_LABEL, buttonClass, Badge } from './ui'

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

type Course = { id: string; name: string; location?: string | null }

const KIND_ICON = {
  golf: IconFlag,
  stay: IconHome,
  travel: IconArrowRight,
} as const

const KIND_LABEL = { golf: 'Golf', stay: 'Stay', travel: 'Travel' } as const

// ─── A tile ────────────────────────────────────────────────────

function Tile({
  item, courseName, onRemove, dragging = false,
}: {
  item: ItineraryItem
  courseName?: string | null
  onRemove?: () => void
  dragging?: boolean
}) {
  const Icon = KIND_ICON[item.kind]
  const { title, detail } = describeItem(item, courseName)

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
  item, courseName, onRemove, locked = false,
}: {
  item: ItineraryItem; courseName?: string | null; onRemove: () => void; locked?: boolean
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
      <Tile item={item} courseName={courseName} onRemove={locked ? undefined : onRemove} />
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

// ─── A stepper ─────────────────────────────────────────────────

/**
 * A number chosen by tapping rather than typed.
 *
 * A number input cannot be cleared without going through an empty string,
 * and an empty string coerced back to the minimum means the field snaps to
 * 1 the moment you delete the digit — so it reads as only ever being 1 or
 * 10. Two buttons and a read-only figure cannot get into that state, and on
 * a phone they are the easier target anyway.
 */
function Stepper({
  label, value, min, max, unit, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  unit: (n: number) => string
  onChange: (n: number) => void
}) {
  const step = (by: number) => onChange(Math.max(min, Math.min(max, value + by)))
  const btn =
    'w-14 h-14 flex-shrink-0 rounded-xl border border-bark/25 bg-surface text-ink ' +
    'flex items-center justify-center text-2xl leading-none ' +
    'hover:border-bark/40 transition-colors duration-150 ' +
    'disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div>
      <label className={FIELD_LABEL}>{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button" onClick={() => step(-1)} disabled={value <= min}
          aria-label={`Fewer — ${label}`} className={btn}
        >
          −
        </button>
        <span
          className="flex-1 text-center t-h2 text-ink tabular-nums"
          aria-live="polite"
        >
          {value} <span className="t-cap text-ink/65">{unit(value)}</span>
        </span>
        <button
          type="button" onClick={() => step(1)} disabled={value >= max}
          aria-label={`More — ${label}`} className={btn}
        >
          +
        </button>
      </div>
    </div>
  )
}

// ─── The add sheets ────────────────────────────────────────────

function Sheet({
  title, onClose, onAdd, addLabel = 'Add', error, children,
}: {
  title: string
  onClose: () => void
  onAdd: () => void
  addLabel?: string
  error: string | null
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40" />
      <div
        className="relative bg-cream rounded-t-2xl max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-cream px-4 pt-4 pb-3 flex items-center justify-between border-b border-bark/12">
          <h2 className="t-h2 text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mr-2 flex items-center justify-center text-ink/65 hover:text-ink"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="px-4 py-5 space-y-5">{children}</div>

        <div className="px-4">
          {error && <p className="t-cap text-rust-deep mb-2">{error}</p>}
          <button type="button" onClick={onAdd} className={buttonClass('primary')}>
            {addLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────

export default function ItineraryBuilder({
  startDate, endDate, courses, items, onChange, onContinue, blockedReason = null,
  lockGolf = false, continueLabel = 'Proceed to Add Players',
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
   * Golf cannot be added, moved or removed — only stays and journeys can.
   *
   * Used when the trip already has scores recorded somewhere: a course
   * change would orphan real data, so editing golf at all is what has to be
   * refused rather than any single edit. The golf tiles still show, so the
   * running order still reads as a whole — they simply carry no remove
   * button and cannot be dragged.
   */
  lockGolf?: boolean
}) {
  const days = dayCount(startDate, endDate)
  const [openDay, setOpenDay] = useState(0)
  const [sheet, setSheet] = useState<ItemKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<ItineraryItem | null>(null)

  // Draft state for whichever sheet is open
  const [courseId, setCourseId] = useState('')
  const [teeTime, setTeeTime] = useState('')
  const [teeCount, setTeeCount] = useState(1)
  const [stayName, setStayName] = useState('')
  const [nights, setNights] = useState(1)
  const [mode, setMode] = useState<TravelMode>('car')
  const [fromPlace, setFromPlace] = useState('')
  const [toPlace, setToPlace] = useState('')
  const [hours, setHours] = useState('')
  const [mins, setMins] = useState('')

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A press-and-hold, so a drag is never started by a scroll
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )

  const courseName = (id?: string | null) =>
    courses.find(c => c.id === id)?.name ?? null

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
    setCourseId(''); setTeeTime(''); setTeeCount(1)
    setStayName(''); setNights(1)
    setMode('car'); setFromPlace(''); setToPlace(''); setHours(''); setMins('')
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
        ? { id, dayIndex: openDay, kind: 'golf', courseId, teeTime: teeTime || null, teeCount }
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

        {lockGolf && (
          <div className="flex items-start gap-3 px-4 py-3 mb-4 bg-accent/10 border border-accent/40 rounded-xl">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            <p className="text-accent text-[13px] leading-snug">
              Scores already exist on this trip, so rounds are locked. Stays and journeys can
              still be added, moved or removed.
            </p>
          </div>
        )}

        {/* Day picker. Horizontal, because a week does not fit vertically
            above the content it is filtering. */}
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

        <p className="t-h2 text-ink mb-1">{describeDay(dateForDay(startDate, openDay), openDay)}</p>
        <p className="t-cap text-ink/65 mb-4">
          {dayItems.length === 0
            ? 'Nothing yet — add golf, a stay or a journey below.'
            : 'Press and hold a tile to move it.'}
        </p>

        {/* The day's running order */}
        <SortableContext items={dayItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div>
            {dayItems.map(item => (
              <SortableTile
                key={item.id}
                item={item}
                courseName={courseName(item.courseId)}
                onRemove={() => onChange(removeItem(items, item.id))}
                locked={lockGolf && item.kind === 'golf'}
              />
            ))}
          </div>
        </SortableContext>

        {dayItems.length === 0 && (
          <div className="border border-dashed border-bark/25 rounded-xl py-10 text-center">
            <p className="t-body text-ink/65">Nothing added yet. Get your golf in!</p>
          </div>
        )}
      </div>

      {/* The way forward, pinned where the thumb is. The three ways to fill
          a day sit above the way out of it, and carry the extra height —
          they are what this screen is for, and the one underneath is where
          you go when you are finished with it. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-cream/95 backdrop-blur-sm border-t border-bark/12"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
      >
        <div className="max-w-lg mx-auto px-4 pt-3">
          <div className="grid grid-cols-3 gap-2">
            {(['golf', 'stay', 'travel'] as const).map(kind => {
              const Icon = KIND_ICON[kind]
              const disabled = lockGolf && kind === 'golf'
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={disabled}
                  onClick={() => openSheet(kind)}
                  className="flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-xl border border-bark/25 bg-surface text-ink hover:border-accent transition-colors duration-150 disabled:opacity-30 disabled:hover:border-bark/25 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-1 text-accent">
                    <IconPlus size={14} /><Icon size={18} />
                  </span>
                  <span className="t-label">{KIND_LABEL[kind]}</span>
                </button>
              )
            })}
          </div>

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
          <div>
            <label className={FIELD_LABEL} htmlFor="it-course">Course</label>
            <div className="relative">
              <select
                id="it-course"
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
                className={`${FIELD} appearance-none pr-10`}
              >
                <option value="">Choose a course</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.location ? ` — ${c.location}` : ''}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/65">
                <IconChevronDown size={16} />
              </span>
            </div>
          </div>

          {/* Full width, and stacked. Side by side, a native time control
              claims its own intrinsic width and runs into whatever is next
              to it — the same thing DateField exists to stop. */}
          <div>
            <label className={FIELD_LABEL} htmlFor="it-tee">First tee time</label>
            <input
              id="it-tee" type="time" value={teeTime}
              onChange={e => setTeeTime(e.target.value)}
              className={`${FIELD} block min-w-0 max-w-full`}
              style={{
                // Stops iOS sizing the field to the native control's preference
                WebkitAppearance: 'none',
                appearance: 'none',
                minWidth: 0,
                maxWidth: '100%',
              }}
            />
          </div>

          <Stepper
            label="Tee times"
            value={teeCount}
            min={1}
            max={MAX_TEE_TIMES}
            unit={n => (n === 1 ? 'group' : 'groups')}
            onChange={setTeeCount}
          />

          <p className="t-cap text-ink/65">
            How many groups are going out?
          </p>
        </Sheet>
      )}

      {sheet === 'stay' && (
        <Sheet title="Add a stay" onClose={() => setSheet(null)} onAdd={commit} addLabel="Add stay" error={error}>
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
