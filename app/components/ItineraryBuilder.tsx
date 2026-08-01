'use client'

import { useState } from 'react'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  MouseSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable,
} from '@dnd-kit/core'
import {
  type ItineraryItem, type ItemKind, type TravelMode,
  TRAVEL_MODES, MAX_TEE_TIMES,
  addItem, removeItem, moveItem, itemsForDay, dayCount, dateForDay,
  describeDay, describeItem, itemError,
} from '@/lib/itinerary'
import {
  IconFlag, IconHome, IconArrowRight, IconPlus, IconX, IconChevronDown,
} from './icons'
import { FIELD, FIELD_LABEL, buttonClass, Badge } from './ui'

/**
 * Building a trip's running order, a day at a time.
 *
 * One day is open at a time. Its items are tiles in the order they happen,
 * and the three add buttons are pinned to the bottom of the screen — on a
 * phone that is where the thumb already is, and the alternative is an add
 * button per day repeated down a long page.
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
      className={`flex items-center gap-3 bg-surface border rounded-xl px-3 py-3 transition-opacity ${
        dragging ? 'border-accent/50 opacity-90' : 'border-bark/12'
      }`}
    >
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-bark/[0.06] flex items-center justify-center text-bark">
        <Icon size={17} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block t-card text-ink truncate">{title}</span>
        {detail && <span className="block t-cap text-ink/40 mt-0.5 truncate">{detail}</span>}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-ink/25 hover:text-rust transition-colors duration-150"
        >
          <IconX size={16} />
        </button>
      )}
    </div>
  )
}

function DraggableTile(props: {
  item: ItineraryItem; courseName?: string | null; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.item.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="touch-none">
      <div style={{ opacity: isDragging ? 0.3 : 1 }}>
        <Tile {...props} />
      </div>
    </div>
  )
}

/** A slot between two tiles, and at the end of every day. */
function DropSlot({ dayIndex, position }: { dayIndex: number; position: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${dayIndex}:${position}` })
  return (
    <div
      ref={setNodeRef}
      className={`transition-all duration-150 rounded-full ${
        isOver ? 'h-8 bg-accent/[0.18] border border-dashed border-accent/50' : 'h-2'
      }`}
    />
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
            className="w-11 h-11 -mr-2 flex items-center justify-center text-ink/40 hover:text-ink"
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
  startDate, endDate, courses, items, onChange,
}: {
  startDate: string | null
  endDate: string | null
  courses: Course[]
  items: ItineraryItem[]
  onChange: (items: ItineraryItem[]) => void
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

  function openSheet(kind: ItemKind) {
    setError(null)
    setCourseId(''); setTeeTime(''); setTeeCount(1)
    setStayName('')
    setMode('car'); setFromPlace(''); setToPlace(''); setHours(''); setMins('')
    setSheet(kind)
  }

  function commit() {
    if (!sheet) return
    const id = `tmp-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const duration =
      (parseInt(hours) || 0) * 60 + (parseInt(mins) || 0)

    const draft: Omit<ItineraryItem, 'position'> =
      sheet === 'golf'
        ? { id, dayIndex: openDay, kind: 'golf', courseId, teeTime: teeTime || null, teeCount }
        : sheet === 'stay'
          ? { id, dayIndex: openDay, kind: 'stay', stayName }
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
    if (!over) return
    const target = String(over.id)
    if (!target.startsWith('slot:')) return
    const [, day, position] = target.split(':')
    onChange(moveItem(items, String(active.id), Number(day), Number(position)))
  }

  const dayItems = itemsForDay(items, openDay)

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }: DragStartEvent) =>
        setDragging(items.find(i => i.id === active.id) ?? null)}
      onDragEnd={handleDragEnd}
    >
      <div className="pb-28">

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
                      : 'border-bark/12 bg-surface text-ink/65 hover:border-bark/25'
                  }`}
                >
                  <span className="block t-label">Day {i + 1}</span>
                  <span className="block t-cap text-ink/40 mt-0.5">
                    {count === 0 ? 'empty' : `${count} item${count === 1 ? '' : 's'}`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <p className="t-h2 text-ink mb-1">{describeDay(dateForDay(startDate, openDay), openDay)}</p>
        <p className="t-cap text-ink/40 mb-4">
          {dayItems.length === 0
            ? 'Nothing yet — add golf, a stay or a journey below.'
            : 'Press and hold a tile to move it.'}
        </p>

        {/* The day's running order */}
        <div>
          <DropSlot dayIndex={openDay} position={0} />
          {dayItems.map((item, i) => (
            <div key={item.id}>
              <DraggableTile
                item={item}
                courseName={courseName(item.courseId)}
                onRemove={() => onChange(removeItem(items, item.id))}
              />
              <DropSlot dayIndex={openDay} position={i + 1} />
            </div>
          ))}
        </div>

        {dayItems.length === 0 && (
          <div className="border border-dashed border-bark/25 rounded-xl py-10 text-center">
            <p className="t-body text-ink/40">This day is empty.</p>
          </div>
        )}
      </div>

      {/* Add buttons, pinned where the thumb is */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-cream/95 border-t border-bark/12"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
      >
        <div className="max-w-lg mx-auto px-4 pt-3 grid grid-cols-3 gap-2">
          {(['golf', 'stay', 'travel'] as const).map(kind => {
            const Icon = KIND_ICON[kind]
            return (
              <button
                key={kind}
                type="button"
                onClick={() => openSheet(kind)}
                className="flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl border border-bark/25 bg-surface text-ink hover:border-accent transition-colors duration-150"
              >
                <span className="flex items-center gap-1 text-accent">
                  <IconPlus size={13} /><Icon size={16} />
                </span>
                <span className="t-label">{KIND_LABEL[kind]}</span>
              </button>
            )
          })}
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
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/40">
                <IconChevronDown size={16} />
              </span>
            </div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div>
              <label className={FIELD_LABEL} htmlFor="it-tee">First tee time</label>
              <input
                id="it-tee" type="time" value={teeTime}
                onChange={e => setTeeTime(e.target.value)} className={FIELD}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="it-count">Tee times</label>
              <input
                id="it-count" type="number" inputMode="numeric" min={1} max={MAX_TEE_TIMES}
                value={teeCount}
                onChange={e => setTeeCount(Math.max(1, Math.min(MAX_TEE_TIMES, parseInt(e.target.value) || 1)))}
                className={FIELD}
              />
            </div>
          </div>
          <p className="t-cap text-ink/40">
            One round is created for this course. More tee times just means more
            groups going off.
          </p>
        </Sheet>
      )}

      {sheet === 'stay' && (
        <Sheet title="Add a stay" onClose={() => setSheet(null)} onAdd={commit} addLabel="Add stay" error={error}>
          <div>
            <label className={FIELD_LABEL} htmlFor="it-stay">Where are you staying?</label>
            <input
              id="it-stay" type="text" value={stayName} autoFocus
              onChange={e => setStayName(e.target.value)}
              placeholder="Ballina guesthouse"
              className={FIELD}
            />
          </div>
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
                      : 'border-bark/25 bg-surface text-ink/65'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div>
              <label className={FIELD_LABEL} htmlFor="it-from">From</label>
              <input id="it-from" type="text" value={fromPlace}
                onChange={e => setFromPlace(e.target.value)} placeholder="Dublin" className={FIELD} />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="it-to">To</label>
              <input id="it-to" type="text" value={toPlace}
                onChange={e => setToPlace(e.target.value)} placeholder="Carne" className={FIELD} />
            </div>
          </div>

          <div>
            <label className={FIELD_LABEL}>How long</label>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <input type="number" inputMode="numeric" min={0} max={48} value={hours}
                onChange={e => setHours(e.target.value)} placeholder="Hours" className={FIELD} />
              <input type="number" inputMode="numeric" min={0} max={59} value={mins}
                onChange={e => setMins(e.target.value)} placeholder="Minutes" className={FIELD} />
            </div>
          </div>
        </Sheet>
      )}

      <DragOverlay dropAnimation={null}>
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
