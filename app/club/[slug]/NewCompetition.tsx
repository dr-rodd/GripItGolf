'use client'

import { useMemo, useState } from 'react'
import CourseSelect from '@/app/components/CourseSelect'
import DateField from '@/app/components/DateField'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { FIELD, FIELD_LABEL, Segmented, buttonClass, chipClass } from '@/app/components/ui'
import { makeCompetition } from '@/lib/accountClient'
import { compFormIssue, type CompForm } from '@/lib/clubComp'
import { irishToday } from '@/lib/clubs'
import type { DirectoryCourse } from '@/lib/courseDirectory'

const INTERVALS = [8, 9, 10, 12] as const

/**
 * "New competition" (D162), for a verified club's owners and admins, on
 * Comps: the name, the day, the course (the club's home course to start
 * with, D161), Stableford or strokes and the allowance, who may watch
 * (D184), and the tee times — first, the minutes between, players a time,
 * how many, and when booking opens. No PIN, no collaboration question, no
 * tags: the club's admins run it, and its field is the club's list.
 */
export default function NewCompetition({ clubId, homeCourseId, onCancel }: {
  clubId: string
  homeCourseId: string | null
  onCancel: () => void
}) {
  const { courses: listed } = usePlatformCourses()
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const [form, setForm] = useState<CompForm>({
    name: '', date: '', courseId: homeCourseId ?? '', scoring: 'stableford', allowance: 95, watch: 'members',
    first: '08:00', interval: 10, perTime: 4, times: 20, opens: { daysBefore: 7, time: '20:00' },
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = useMemo(() => irishToday(new Date()), [])
  const courses = [...listed.filter(c => !added.some(a => a.id === c.id)), ...added]
  const issue = compFormIssue(form, today)
  const set = <K extends keyof CompForm>(k: K, v: CompForm[K]) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const r = await makeCompetition(clubId, form as unknown as Record<string, unknown>)
    if (!r.ok) { setBusy(false); setError(r.error); return }
    window.location.assign(`/club/${r.slug}/comp/${r.code}`)
  }

  return (
    <section className="mt-6 space-y-5" aria-busy={busy}>
      <h1 className="t-h1 text-ink">New competition</h1>
      <div>
        <label htmlFor="comp-name" className={FIELD_LABEL}>Name</label>
        <input id="comp-name" className={FIELD} value={form.name} maxLength={60} placeholder="e.g. November Medal"
          onChange={e => set('name', e.target.value)} />
      </div>
      <DateField label="Day" value={form.date} min={today} onChange={v => set('date', v)} />
      <div>
        <p className={FIELD_LABEL}>Course</p>
        <CourseSelect courses={courses} value={form.courseId} onChange={id => set('courseId', id)}
          onCourseAdded={c => setAdded(a => [...a.filter(x => x.id !== c.id), c])} />
      </div>
      <div>
        <p className={FIELD_LABEL}>Scoring</p>
        <Segmented label="Scoring" value={form.scoring} onChange={v => set('scoring', v)}
          options={[{ value: 'stableford', label: 'Stableford' }, { value: 'strokes', label: 'Strokes' }] as const} />
      </div>
      <div>
        <label htmlFor="comp-allowance" className={FIELD_LABEL}>Handicap allowance</label>
        <div className="flex items-center gap-2">
          <input id="comp-allowance" className={`${FIELD} w-24`} inputMode="numeric" value={String(form.allowance)}
            onChange={e => set('allowance', Number(e.target.value.replace(/\D/g, '') || 0))} />
          <span className="t-label text-ink/80">%</span>
        </div>
        <p className="t-cap text-ink/65 mt-2">Ties are broken on the back 9, then 6, 3 and 2, then shared.</p>
      </div>
      <div>
        <p className={FIELD_LABEL}>Who can watch</p>
        <Segmented label="Who can watch" value={form.watch} onChange={v => set('watch', v)}
          options={[{ value: 'members', label: 'Members only' }, { value: 'guests', label: 'Guests can watch' }] as const} />
        <p className="t-cap text-ink/65 mt-2">
          {form.watch === 'members'
            ? 'Only people on the club’s list, signed in, can open it.'
            : 'Anybody with the code can follow it, read-only. Only members book and score.'}
        </p>
      </div>

      <h2 className="t-h2 text-ink pt-2">Tee times</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="comp-first" className={FIELD_LABEL}>First tee time</label>
          <input id="comp-first" type="time" className={FIELD} value={form.first} onChange={e => set('first', e.target.value)} />
        </div>
        <div>
          <label htmlFor="comp-times" className={FIELD_LABEL}>How many</label>
          <input id="comp-times" className={FIELD} inputMode="numeric" value={String(form.times)}
            onChange={e => set('times', Number(e.target.value.replace(/\D/g, '') || 0))} />
        </div>
      </div>
      <div>
        <p className={FIELD_LABEL}>Minutes between</p>
        <div className="flex flex-wrap gap-2">
          {INTERVALS.map(n => (
            <button key={n} type="button" className={chipClass(form.interval === n)} onClick={() => set('interval', n)}>{n}</button>
          ))}
        </div>
      </div>
      <div>
        <p className={FIELD_LABEL}>Players a tee time</p>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4].map(n => (
            <button key={n} type="button" className={chipClass(form.perTime === n)} onClick={() => set('perTime', n)}>{n}</button>
          ))}
        </div>
      </div>
      <div>
        <p className={FIELD_LABEL}>Booking opens</p>
        <Segmented label="Booking opens" value={form.opens ? 'later' : 'now'}
          onChange={v => set('opens', v === 'now' ? null : { daysBefore: 7, time: '20:00' })}
          options={[{ value: 'now', label: 'Straight away' }, { value: 'later', label: 'Days before' }] as const} />
        {form.opens && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label htmlFor="comp-days" className={FIELD_LABEL}>Days before</label>
              <input id="comp-days" className={FIELD} inputMode="numeric" value={String(form.opens.daysBefore)}
                onChange={e => set('opens', { ...form.opens!, daysBefore: Number(e.target.value.replace(/\D/g, '') || 0) })} />
            </div>
            <div>
              <label htmlFor="comp-open-time" className={FIELD_LABEL}>At</label>
              <input id="comp-open-time" type="time" className={FIELD} value={form.opens.time}
                onChange={e => set('opens', { ...form.opens!, time: e.target.value })} />
            </div>
          </div>
        )}
        <p className="t-cap text-ink/65 mt-2">Irish time. Nobody is emailed when it opens.</p>
      </div>

      {error && <p className="t-cap text-rust-deep" role="alert">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" disabled={busy || !!issue} onClick={save} className={buttonClass('primary', false)}>
          {busy ? 'Making…' : 'Make the competition'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('quiet', false)}>Cancel</button>
      </div>
      {issue && form.name && <p className="t-cap text-ink/65">{issue}</p>}
    </section>
  )
}
