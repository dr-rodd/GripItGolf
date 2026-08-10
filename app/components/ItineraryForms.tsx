'use client'

/**
 * The itinerary's sheets, and the golf form that fills one.
 *
 * Extracted from `ItineraryBuilder` the day the scoring screen grew its own
 * "add a round" sheet. The golf form is the piece that matters: it asks for
 * a course, a tee time, the groups and whether the round counts, and a
 * second copy of it is how the two doors drift — one gains a question the
 * other never asks. One form, two openings.
 *
 * `Sheet` is the container both use: pinned to the bottom, scrim behind,
 * rising from below (`sheet-up` in globals.css — a phone sheet that simply
 * appears reads as a glitch, one that rises reads as arriving).
 */

import {
  type ItineraryItem, MAX_TEE_TIMES,
} from '@/lib/itinerary'
import { IconX } from './icons'
import { FIELD, FIELD_LABEL, buttonClass } from './ui'
import CourseSelect from './CourseSelect'
import Toggle from './Toggle'
import type { DirectoryCourse } from '@/lib/courseDirectory'

// ─── The sheet itself ──────────────────────────────────────────

export function Sheet({
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
      <div className="absolute inset-0 bg-ink/40 page-enter" />
      <div
        className="relative bg-cream rounded-t-2xl max-h-[88vh] overflow-y-auto sheet-up"
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
export function Stepper({
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

// ─── The golf form ─────────────────────────────────────────────

/** Everything the golf sheet asks. One draft, wherever it opens. */
export type GolfDraft = {
  courseId: string
  teeTime: string
  teeCount: number
  /** Whether the round counts on the leaderboard. On by default. */
  counts: boolean
  /** Whether a casual round's cards still feed the trip stats. */
  casualStats: boolean
}

export const EMPTY_GOLF_DRAFT: GolfDraft = {
  courseId: '', teeTime: '', teeCount: 1, counts: true, casualStats: false,
}

/** The draft as the golf fields of an itinerary item. */
export function golfDraftFields(
  draft: GolfDraft,
): Pick<ItineraryItem, 'courseId' | 'teeTime' | 'teeCount' | 'casual' | 'casualStats'> {
  return {
    courseId: draft.courseId,
    teeTime: draft.teeTime || null,
    teeCount: draft.teeCount,
    casual: !draft.counts,
    casualStats: !draft.counts && draft.casualStats,
  }
}

export function GolfFields({
  draft, onChange, courses, onCourseAdded, trackStats = false,
}: {
  draft: GolfDraft
  onChange: (next: GolfDraft) => void
  courses: DirectoryCourse[]
  /** A course added from the picker mid-flow — see `CourseSelect`. */
  onCourseAdded: (course: DirectoryCourse) => void
  /**
   * Whether the trip records putts and fairways. Decides only whether a
   * casual round is asked about feeding the trip stats — a trip without
   * stats has nothing to ask.
   */
  trackStats?: boolean
}) {
  const patch = (p: Partial<GolfDraft>) => onChange({ ...draft, ...p })

  return (
    <>
      <div>
        <label className={FIELD_LABEL}>Course</label>
        {/* Not a dropdown any more: the directory grew a search box, a
            filter, and a door for courses it does not hold yet. */}
        <CourseSelect
          courses={courses}
          value={draft.courseId}
          onChange={id => patch({ courseId: id })}
          onCourseAdded={onCourseAdded}
        />
      </div>

      {/* Full width, and stacked. Side by side, a native time control
          claims its own intrinsic width and runs into whatever is next
          to it — the same thing DateField exists to stop. */}
      <div>
        <label className={FIELD_LABEL} htmlFor="it-tee">First tee time</label>
        <input
          id="it-tee" type="time" value={draft.teeTime}
          onChange={e => patch({ teeTime: e.target.value })}
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
        value={draft.teeCount}
        min={1}
        max={MAX_TEE_TIMES}
        unit={n => (n === 1 ? 'group' : 'groups')}
        onChange={n => patch({ teeCount: n })}
      />

      <p className="t-cap text-ink/65">
        How many groups are going out?
      </p>

      {/* A casual round — a subgroup's extra game that should not move
          the trip standings. Off is the exception, so the switch reads
          in the positive and starts on. */}
      <div className="pt-1 border-t border-bark/12">
        <div className="flex items-center justify-between gap-3 pt-4">
          <span className="text-ink text-sm">Counts on the leaderboard</span>
          <Toggle
            checked={draft.counts}
            onChange={next => patch({ counts: next })}
            label="Counts on the leaderboard"
          />
        </div>
        {!draft.counts && (
          <p className="t-cap text-ink/65 mt-2">
            A casual round — scored as usual, kept off every leaderboard.
          </p>
        )}
        {!draft.counts && trackStats && (
          <div className="flex items-center justify-between gap-3 mt-4">
            <span className="text-ink text-sm">Include in trip stats</span>
            <Toggle
              checked={draft.casualStats}
              onChange={next => patch({ casualStats: next })}
              label="Include in trip stats"
            />
          </div>
        )}
      </div>
    </>
  )
}
