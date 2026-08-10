'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FIELD, FIELD_LABEL, buttonClass } from '@/app/components/ui'
import { IRISH_COUNTIES, emptyTeeDraft } from '@/lib/courseDirectory'
import {
  addTee, saveTee, setCardVerified, updateCourseIdentity, type ActionResult,
} from './actions'

/**
 * The editable half of the course page: identity, tees, the verified flag.
 *
 * Validation happens in the actions (lib/courseDirectory's rules); this
 * component only carries what was typed and shows what came back. Each form
 * is its own useActionState, so a bad slope on the Blue tee does not block
 * saving the county.
 */

const IDLE: ActionResult = { error: null, saved: false }

type Tee = {
  id: string
  name: string
  gender: string
  par: number | null
  course_rating: number | null
  slope: number | null
}

export default function CourseEditor({
  course, tees,
}: {
  course: {
    id: string
    name: string
    county: string | null
    website: string | null
    card_verified: boolean
  }
  tees: Tee[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <IdentityForm course={course} />
      <TeesSection courseId={course.id} tees={tees} />
      <VerifiedToggle courseId={course.id} verified={course.card_verified} />
    </div>
  )
}

function SaveRow({ state, pending, label }: { state: ActionResult; pending: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button type="submit" disabled={pending} className={buttonClass('secondary', false)}>
        {pending ? 'Saving…' : (label ?? 'Save')}
      </button>
      {state.error && <p className="text-rust-deep text-[13px] leading-snug">{state.error}</p>}
      {state.saved && !state.error && !pending && (
        <p className="text-accent-deep text-[13px]">Saved.</p>
      )}
    </div>
  )
}

function IdentityForm({ course }: { course: { id: string; name: string; county: string | null; website: string | null } }) {
  const [state, formAction, pending] = useActionState(
    updateCourseIdentity.bind(null, course.id), IDLE,
  )

  return (
    <section className="bg-surface border border-bark/12 rounded-2xl px-4 py-4">
      <h2 className="font-[family-name:var(--font-display)] text-base mb-3">Course</h2>
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="course-name" className={FIELD_LABEL}>Name</label>
          <input id="course-name" name="name" defaultValue={course.name} className={FIELD} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="course-county" className={FIELD_LABEL}>County</label>
            <input
              id="course-county"
              name="county"
              defaultValue={course.county ?? ''}
              list="admin-counties"
              className={FIELD}
            />
            <datalist id="admin-counties">
              {IRISH_COUNTIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="course-website" className={FIELD_LABEL}>Website</label>
            <input
              id="course-website"
              name="website"
              defaultValue={course.website ?? ''}
              placeholder="carnegolflinks.com"
              className={FIELD}
            />
          </div>
        </div>
        <SaveRow state={state} pending={pending} />
      </form>
    </section>
  )
}

// ─── Tees ──────────────────────────────────────────────────────

const TEE_FIELD =
  'w-full bg-surface border border-bark/25 rounded-lg px-2.5 py-2 text-sm ' +
  'text-ink focus:outline-none focus:border-accent transition-colors'

function TeeFields({ draft }: { draft: { name: string; gender: string; par: string; courseRating: string; slope: string } }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      <div>
        <label className="block text-[13px] uppercase tracking-[0.12em] text-ink/65 mb-1">Tee</label>
        <input name="name" defaultValue={draft.name} placeholder="White" className={TEE_FIELD} />
      </div>
      <div>
        <label className="block text-[13px] uppercase tracking-[0.12em] text-ink/65 mb-1">Card</label>
        <select name="gender" defaultValue={draft.gender} className={TEE_FIELD}>
          <option value="M">Men&rsquo;s</option>
          <option value="F">Ladies</option>
        </select>
      </div>
      <div>
        <label className="block text-[13px] uppercase tracking-[0.12em] text-ink/65 mb-1">Par</label>
        <input name="par" defaultValue={draft.par} inputMode="numeric" placeholder="72" className={TEE_FIELD} />
      </div>
      <div>
        <label className="block text-[13px] uppercase tracking-[0.12em] text-ink/65 mb-1">Rating</label>
        <input name="courseRating" defaultValue={draft.courseRating} inputMode="decimal" placeholder="71.4" className={TEE_FIELD} />
      </div>
      <div>
        <label className="block text-[13px] uppercase tracking-[0.12em] text-ink/65 mb-1">Slope</label>
        <input name="slope" defaultValue={draft.slope} inputMode="numeric" placeholder="127" className={TEE_FIELD} />
      </div>
    </div>
  )
}

function TeeRow({ courseId, tee }: { courseId: string; tee: Tee }) {
  const [state, formAction, pending] = useActionState(
    saveTee.bind(null, courseId, tee.id), IDLE,
  )
  return (
    <form action={formAction} className="border-t border-bark/12 pt-3 flex flex-col gap-2">
      <TeeFields
        draft={{
          name: tee.name,
          gender: tee.gender,
          par: tee.par === null ? '' : String(tee.par),
          courseRating: tee.course_rating === null ? '' : String(tee.course_rating),
          slope: tee.slope === null ? '' : String(tee.slope),
        }}
      />
      <SaveRow state={state} pending={pending} />
    </form>
  )
}

function AddTeeForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(addTee.bind(null, courseId), IDLE)
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass('quiet', false)}>
        + Add a tee
      </button>
    )
  }
  return (
    <form action={formAction} className="border-t border-bark/12 pt-3 flex flex-col gap-2">
      <TeeFields draft={emptyTeeDraft()} />
      <SaveRow state={state} pending={pending} label="Add tee" />
    </form>
  )
}

function TeesSection({ courseId, tees }: { courseId: string; tees: Tee[] }) {
  return (
    <section className="bg-surface border border-bark/12 rounded-2xl px-4 py-4">
      <h2 className="font-[family-name:var(--font-display)] text-base mb-1">Tees</h2>
      <p className="text-ink/65 text-[13px] mb-3 leading-snug">
        Slope and rating come off the club&rsquo;s card. The same ranges the
        scorecard check accepts apply here.
      </p>
      <div className="flex flex-col gap-3">
        {tees.length === 0 && (
          <p className="text-ink/65 text-sm">No tees yet — add the ones on the card.</p>
        )}
        {tees.map(t => <TeeRow key={t.id} courseId={courseId} tee={t} />)}
        <AddTeeForm courseId={courseId} />
      </div>
    </section>
  )
}

// ─── Verified ──────────────────────────────────────────────────

function VerifiedToggle({ courseId, verified }: { courseId: string; verified: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const flip = () => {
    setError(null)
    startTransition(async () => {
      const result = await setCardVerified(courseId, !verified)
      setError(result.error)
      if (!result.error) router.refresh()
    })
  }

  return (
    <section className="bg-surface border border-bark/12 rounded-2xl px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-base">
            Card {verified ? 'verified' : 'not verified'}
          </h2>
          <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
            {verified
              ? 'Confirmed against a scorecard photo. Scoring is open on this course.'
              : 'Scoring stays gated until the card is confirmed — normally by a scorecard photo.'}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={flip}
          className={buttonClass(verified ? 'danger' : 'secondary', false)}
        >
          {pending ? 'Saving…' : verified ? 'Mark unverified' : 'Mark verified'}
        </button>
      </div>
      {error && <p className="text-rust-deep text-[13px] mt-2 leading-snug">{error}</p>}
    </section>
  )
}
