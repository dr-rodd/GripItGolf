'use client'

import { useLabels } from '../useLabels'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@/app/components/icons'
import CourseSelect from '@/app/components/CourseSelect'
import CompBatches from '@/app/components/CompBatches'
import EntryRulesFields from '@/app/components/EntryRulesFields'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'
import { FIELD, FIELD_LABEL, Segmented, buttonClass } from '@/app/components/ui'
import { beforeSunriseLine, compFormIssue, type CompForm } from '@/lib/clubComp'
import { useSunriseStart } from '@/app/components/useSunriseStart'
import { entryRulesIssue, readEntryRules, type Category } from '@/lib/clubMembership'
import { applyPreset, type Preset } from '@/lib/clubPresets'
import { irishToday } from '@/lib/clubs'
import { sunDay, sunWords } from '@/lib/sun'
import type { DirectoryCourse } from '@/lib/courseDirectory'
import { changeCompetition, makeClubhouseCompetition, readCompetitionForm } from '../../clubhouseClient'

/**
 * A competition made or changed in the Clubhouse (stage c1, M10, M11): a
 * side panel of 480 — from a preset or from scratch, the name, day, course,
 * format and allowance, who can enter, the tee times in up to four runs
 * (sunrise and sunset said for the day and course), when booking opens.
 * Changing one keeps every booking at its tee time or is refused, each
 * member named with why — never once a card has started. Edit (D274) is
 * every answer the make form has, who can watch included, with Copy in the
 * footer handing the saved competition to the copy flow — locked or not.
 */
export default function CompPanel({ clubId, slug, code, homeCourseId, cats, ageDate, presets, onClose, onDone, onCopy }: {
  clubId: string
  slug: string
  /** The competition being changed — none for a new one. */
  code: string | null
  homeCourseId: string | null
  cats: Category[]
  ageDate: string
  presets: Preset[]
  onClose: () => void
  /** Handed the new competition when one was made (a match play's qualifier, stage 5). */
  onDone: (made?: { code: string; name: string; date: string }) => void
  /** Copy, from Edit: the saved competition handed to the copy flow (D274). */
  onCopy?: () => void
}) {
  // D288: the club's labels, for who may enter and the colour.
  const { labels } = useLabels(clubId)
  const { courses: listed } = usePlatformCourses()
  const [added, setAdded] = useState<DirectoryCourse[]>([])
  const courses = useMemo(() => [...listed.filter(c => !added.some(a => a.id === c.id)), ...added], [listed, added])
  const blank: CompForm = {
    name: '', date: '', courseId: homeCourseId ?? '', scoring: 'stableford', allowance: 95, watch: 'members',
    batches: [{ start: '08:00', interval: 10, perTime: 4, times: 20 }], opens: { daysBefore: 7, time: '20:00' }, entry: null,
  }
  const preset0 = code ? null : presets.find(p => p.isDefault) ?? null
  const [form, setForm] = useState<CompForm | null>(code ? null : blank)
  const [presetId, setPresetId] = useState<string>(preset0?.id ?? '')
  const [state, setState] = useState<{ booked: number; started: boolean; certified: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [problems, setProblems] = useState<{ name: string; why: string }[]>([])
  const [presetWhy, setPresetWhy] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  const today = irishToday(new Date())

  // A competition being changed is read whole first.
  useEffect(() => {
    if (!code) return
    let live = true
    void readCompetitionForm(clubId, code).then(r => {
      if (!live) return
      if (!r.ok) { setError(r.error); return }
      setForm(r.form); setSaved(JSON.stringify(r.form)); setState({ booked: r.booked, started: r.started, certified: r.certified })
    })
    return () => { live = false }
  }, [clubId, code])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const course = courses.find(c => c.id === form?.courseId)
  const place = course ? { lat: course.latitude ?? NaN, lng: course.longitude ?? NaN } : null
  const sun = form?.date ? sunDay(form.date, place) : null

  // The preset chosen is laid on whenever the day or course changes, so its sunrise and sunset follow them.
  const preset = presets.find(p => p.id === presetId) ?? null
  const presetKey = `${presetId}|${form?.date ?? ''}|${form?.courseId ?? ''}|${course ? 'c' : ''}`
  const [laid, setLaid] = useState('')
  if (!code && preset && form && laid !== presetKey) {
    const out = applyPreset(form, preset, sun)
    setLaid(presetKey); setForm(out.form); setPresetWhy(out.why)
  }

  const set = <K extends keyof CompForm>(k: K, v: CompForm[K]) => setForm(f => (f ? { ...f, [k]: v } : f))
  // A new one from scratch: the first tee time follows sunrise until one is typed (Ross, 17 Nov 2026).
  const setBatches = useSunriseStart(form, sun, !code && !preset, setForm)
  const issue = form ? compFormIssue(form, today) ?? entryRulesIssue(readEntryRules(form.entry), cats.map(c => c.id)) : null
  const locked = !!state && (state.started || state.certified)
  const unsaved = !!code && !!form && !!saved && JSON.stringify(form) !== saved

  async function save() {
    if (!form || issue) { setError(issue ?? ''); return }
    setBusy(true); setError(''); setProblems([])
    const r: { ok: true; code?: string } | { ok: false; error: string; problems?: { name: string; why: string }[] } = code
      ? await changeCompetition(clubId, code, form) : await makeClubhouseCompetition(clubId, form)
    setBusy(false)
    if (!r.ok) { setError(r.error); setProblems(r.problems ?? []); return }
    onDone(!code && r.code ? { code: r.code, name: form.name, date: form.date } : undefined)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="comp-panel-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <form onSubmit={e => { e.preventDefault(); void save() }}
        className="ch-panel relative w-full md:w-[480px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="comp-panel-title" className="t-h2 text-ink break-words">{code ? form?.name || 'Competition' : 'New competition'}</h2>
            {code && <p className="t-cap text-ink/65 mt-1"><Link href={`/clubhouse/${slug}/events/${code}`} className="underline underline-offset-2">Its tee sheet</Link>{state ? ` · ${state.booked} booked` : ''}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>

        {!form ? (
          error ? <p role="alert" className="t-cap text-rust-deep mt-6">{error}</p> : <div className="skeleton h-96 rounded-card mt-6" />
        ) : (
          <fieldset disabled={locked} className="mt-6 space-y-5">
            {locked && <p className="t-cap text-ink/80">{state!.certified ? 'The results are certified, so nothing can change. An Officer reopens them first.' : 'A card has started, so the competition can’t be changed.'}</p>}
            {!code && presets.length > 0 && (
              <div>
                <label htmlFor="cp-preset" className={FIELD_LABEL}>Start from a preset</label>
                <select id="cp-preset" className={`${FIELD} ch-focus`} value={presetId} onChange={e => { setPresetId(e.target.value); setLaid('') }}>
                  <option value="">None — fill it in</option>
                  {presets.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code}){p.isDefault ? ' · default' : ''}</option>)}
                </select>
                {preset?.usedFor && <p className="t-cap text-ink/65 mt-2">{preset.usedFor}</p>}
                {presetWhy && <p className="t-cap text-rust-deep mt-2" role="alert">{presetWhy}</p>}
              </div>
            )}
            <div>
              <label htmlFor="cp-name" className={FIELD_LABEL}>Name</label>
              <input id="cp-name" className={`${FIELD} ch-focus`} value={form.name} maxLength={60} placeholder="e.g. December Medal" onChange={e => set('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cp-date" className={FIELD_LABEL}>Day</label>
                <input id="cp-date" type="date" className={`${FIELD} ch-focus`} value={form.date} min={today} onChange={e => set('date', e.target.value)} />
              </div>
              <div>
                <label htmlFor="cp-allowance" className={FIELD_LABEL}>Handicap allowance</label>
                <div className="flex items-center gap-2">
                  <input id="cp-allowance" className={`${FIELD} ch-focus`} inputMode="numeric" value={String(form.allowance)}
                    onChange={e => set('allowance', Number(e.target.value.replace(/\D/g, '') || 0))} />
                  <span className="t-label text-ink/80">%</span>
                </div>
              </div>
            </div>
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
            {(
              <div>
                <p className={FIELD_LABEL}>Who can watch</p>
                <Segmented label="Who can watch" value={form.watch} onChange={v => set('watch', v)}
                  options={[{ value: 'members', label: 'Members only' }, { value: 'guests', label: 'Guests can watch' }] as const} />
              </div>
            )}

            <h3 className="t-card text-ink pt-1">Who can enter</h3>
            <EntryRulesFields entry={form.entry} onChange={e => set('entry', e)} cats={cats} date={form.date} ageDate={ageDate} idPrefix="cp-entry" labels={labels} />

            <h3 className="t-card text-ink pt-1">Tee times</h3>
            {sun && sunWords(sun) && <p className="t-cap text-ink/65 -mt-3">{sunWords(sun)}</p>}
            <CompBatches batches={form.batches} onChange={setBatches} idPrefix="cp" />
            {beforeSunriseLine(form.batches, sun) && <p className="t-cap text-ink/80 -mt-2">{beforeSunriseLine(form.batches, sun)}</p>}
            <div>
              <p className={FIELD_LABEL}>Booking opens</p>
              <Segmented label="Booking opens" value={form.opens ? 'later' : 'now'}
                onChange={v => set('opens', v === 'now' ? null : { daysBefore: 7, time: '20:00' })}
                options={[{ value: 'now', label: 'Straight away' }, { value: 'later', label: 'Days before' }] as const} />
              {form.opens && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label htmlFor="cp-days" className={FIELD_LABEL}>Days before</label>
                    <input id="cp-days" className={`${FIELD} ch-focus`} inputMode="numeric" value={String(form.opens.daysBefore)}
                      onChange={e => set('opens', { ...form.opens!, daysBefore: Number(e.target.value.replace(/\D/g, '') || 0) })} />
                  </div>
                  <div>
                    <label htmlFor="cp-open-time" className={FIELD_LABEL}>At</label>
                    <input id="cp-open-time" type="time" className={`${FIELD} ch-focus`} value={form.opens.time}
                      onChange={e => set('opens', { ...form.opens!, time: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          </fieldset>
        )}

        {form && error && <p role="alert" className="t-cap text-rust-deep mt-5">{error}</p>}
        {problems.length > 0 && (
          <ul className="mt-2 space-y-1">
            {problems.map((p, i) => <li key={i} className="t-cap text-rust-deep">{p.name}: {p.why}</li>)}
          </ul>
        )}
        {(form || (code && onCopy)) && (
          <div className="flex flex-wrap gap-3 mt-6">
            {form && (
              <button type="submit" disabled={busy || !!issue || locked} className={`${buttonClass('primary', false)} ch-focus`}>
                {busy ? (code ? 'Saving…' : 'Making…') : code ? 'Save the changes' : 'Make the competition'}
              </button>
            )}
            {code && onCopy && <button type="button" onClick={onCopy} className={`${buttonClass('secondary', false)} ch-focus`}>Copy</button>}
            <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>{code ? 'Close' : 'Cancel'}</button>
          </div>
        )}
        {unsaved && onCopy && <p className="t-cap text-ink/65 mt-3">Copy uses the saved competition, not these changes.</p>}
        {form && issue && form.name && !error && <p className="t-cap text-ink/65 mt-3">{issue}</p>}
      </form>
    </div>
  )
}
