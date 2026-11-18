'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@/app/components/icons'
import EntryRulesFields from '@/app/components/EntryRulesFields'
import { FIELD, FIELD_LABEL, Segmented, buttonClass } from '@/app/components/ui'
import { entryRulesIssue, readEntryRules, type Category } from '@/lib/clubMembership'
import { clubEventDates, irishToday } from '@/lib/clubs'
import {
  FIELD_CAPS, MATCH_PLAY_FORMATS, MAX_MATCH_ROUNDS, matchPlayFormIssue, matchRoundNames, roundsFor,
  type MatchPlayForm, type MatchPlayFormat,
} from '@/lib/clubMatchPlay'
import { makeClubMatchPlay } from '../../clubhouseClient'
import CompPanel from './CompPanel'
import type { Preset } from '@/lib/clubPresets'

/** One of the club's own stroke competitions, offered as a qualifier. */
export type QualifierChoice = { code: string; name: string; date: string }

/**
 * A club match play made in the Clubhouse (Ross, 17 Nov 2026; D264–D271):
 * a side panel of 480, like a stroke competition's. The format and its
 * allowance, who can enter, how the field is made — members enter by a
 * closing date, or the top of a qualifier from the club's schedule — the
 * biggest field or no limit, when and how the draw is made, a play-by date
 * for every round (from the Final back when there is no limit), and the
 * rules: where matches are played, a match level after 18, and which
 * handicap index counts.
 */
export default function MatchPlayPanel({ clubId, slug, homeCourseId, presets, cats, ageDate, qualifiers: listed, onClose, onDone }: {
  clubId: string
  slug: string
  homeCourseId: string | null
  /** For a qualifier made here (stage 5) — New competition's own panel. */
  presets: Preset[]
  cats: Category[]
  ageDate: string
  qualifiers: QualifierChoice[]
  onClose: () => void
  onDone: () => void
}) {
  const today = irishToday(new Date())
  const [form, setForm] = useState<MatchPlayForm>({
    name: '', format: 'singles', allowance: 100, watch: 'members', entry: null,
    field: 'entries', closes: { date: '', time: '20:00' }, qualifier: null, maxField: 32,
    draw: { when: 'auto', date: null, time: null, seeding: 'random' },
    deadlines: Array(roundsFor(32)).fill(''),
    venue: 'home', tie: 'extra', handicap: 'on_day',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Stage 5 (P8): a qualifier made there and then, through New competition's own panel, chosen on return.
  const [makingQualifier, setMakingQualifier] = useState(false)
  const [madeHere, setMadeHere] = useState<QualifierChoice[]>([])
  const qualifiers = useMemo(() => [...listed, ...madeHere.filter(m => !listed.some(q => q.code === m.code))], [listed, madeHere])
  const set = <K extends keyof MatchPlayForm>(k: K, v: MatchPlayForm[K]) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    // While New competition is open over it, Escape is that panel's alone.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !makingQualifier) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, makingQualifier])

  // The deadlines line up from the Final back (D264): a field made smaller or bigger keeps the later dates.
  const fit = (deadlines: string[], n: number) => Array.from({ length: n }, (_, i) => deadlines[deadlines.length - n + i] ?? '')
  const setCap = (cap: number | null) => setForm(f => ({ ...f, maxField: cap, deadlines: fit(f.deadlines, cap ? roundsFor(cap) : Math.max(1, Math.min(f.deadlines.length, MAX_MATCH_ROUNDS))) }))
  const setFormat = (format: MatchPlayFormat) => setForm(f => {
    const next = { ...f, format, allowance: MATCH_PLAY_FORMATS.find(x => x.key === format)!.allowance }
    // A pair cannot qualify from a singles competition: back to members entering.
    return format !== 'singles' && f.field === 'qualifier'
      ? { ...next, field: 'entries', closes: { date: '', time: '20:00' }, qualifier: null, draw: { ...f.draw, seeding: 'random' } }
      : next
  })
  const setField = (field: MatchPlayForm['field']) => setForm(f => ({
    ...f, field,
    closes: field === 'entries' ? f.closes ?? { date: '', time: '20:00' } : null,
    qualifier: field === 'qualifier' ? f.qualifier ?? { code: qualifiers[0]?.code ?? '', qualify: Math.min(16, f.maxField ?? 16) } : null,
    draw: { ...f.draw, seeding: field === 'qualifier' ? 'qualifier' : f.draw.seeding === 'qualifier' ? 'random' : f.draw.seeding },
  }))
  const setDeadline = (i: number, v: string) => setForm(f => ({ ...f, deadlines: f.deadlines.map((d, j) => (j === i ? v : d)) }))

  const names = useMemo(() => matchRoundNames(form.deadlines.length), [form.deadlines.length])
  const issue = matchPlayFormIssue(form, new Date(), today) ?? entryRulesIssue(readEntryRules(form.entry), cats.map(c => c.id))
  const pairs = form.format !== 'singles'

  async function save() {
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const r = await makeClubMatchPlay(clubId, form)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onDone()
    onClose()
  }

  return (
    <>
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="mp-panel-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <form onSubmit={e => { e.preventDefault(); void save() }}
        className="ch-panel relative w-full md:w-[480px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="mp-panel-title" className="t-h2 text-ink">New match play</h2>
            <p className="t-cap text-ink/65 mt-1">A knockout over weeks. Players arrange their own matches by each round’s play-by date.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="mp-name" className={FIELD_LABEL}>Name</label>
            <input id="mp-name" className={`${FIELD} ch-focus`} value={form.name} maxLength={60} placeholder="e.g. Captain’s Prize Matchplay" onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <p className={FIELD_LABEL}>Format</p>
            <Segmented label="Format" value={form.format} onChange={setFormat}
              options={MATCH_PLAY_FORMATS.map(f => ({ value: f.key, label: f.label }))} />
            <p className="t-cap text-ink/65 mt-2">{MATCH_PLAY_FORMATS.find(f => f.key === form.format)!.hint}</p>
          </div>
          <div>
            <label htmlFor="mp-allowance" className={FIELD_LABEL}>Handicap allowance{form.format === 'foursomes' ? ' (of the pair’s combined)' : ''}</label>
            <div className="flex items-center gap-2 w-40">
              <input id="mp-allowance" className={`${FIELD} ch-focus`} inputMode="numeric" value={String(form.allowance)}
                onChange={e => set('allowance', Number(e.target.value.replace(/\D/g, '') || 0))} />
              <span className="t-label text-ink/80">%</span>
            </div>
          </div>
          <div>
            <p className={FIELD_LABEL}>Who can watch</p>
            <Segmented label="Who can watch" value={form.watch} onChange={v => set('watch', v)}
              options={[{ value: 'members', label: 'Members only' }, { value: 'guests', label: 'Guests can watch' }] as const} />
          </div>

          <h3 className="t-card text-ink pt-1">Who can enter</h3>
          <EntryRulesFields entry={form.entry} onChange={e => set('entry', e)} cats={cats} date={form.closes?.date ?? ''} ageDate={ageDate} idPrefix="mp-entry" />
          {pairs && <p className="t-cap text-ink/65 -mt-2">Both players in a pair must be able to enter.</p>}

          <h3 className="t-card text-ink pt-1">The field</h3>
          <div>
            <p className={FIELD_LABEL}>How the field is made</p>
            <Segmented label="How the field is made" value={form.field} onChange={setField}
              options={pairs ? [{ value: 'entries', label: 'Members enter' }] as const
                : [{ value: 'entries', label: 'Members enter' }, { value: 'qualifier', label: 'From a qualifier' }] as const} />
            {pairs && <p className="t-cap text-ink/65 mt-1.5">Pairs enter themselves — the club’s qualifiers are singles.</p>}
          </div>
          {form.field === 'entries' && form.closes && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="mp-close-date" className={FIELD_LABEL}>Entries close</label>
                <input id="mp-close-date" type="date" className={`${FIELD} ch-focus`} value={form.closes.date} min={today}
                  onChange={e => set('closes', { ...form.closes!, date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="mp-close-time" className={FIELD_LABEL}>At</label>
                <input id="mp-close-time" type="time" className={`${FIELD} ch-focus`} value={form.closes.time}
                  onChange={e => set('closes', { ...form.closes!, time: e.target.value })} />
              </div>
            </div>
          )}
          {form.field === 'qualifier' && form.qualifier && (
            qualifiers.length === 0 ? (
              <p className="t-cap text-ink/80">The club has no competition to qualify from yet — make one below.</p>
            ) : (
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <div>
                  <label htmlFor="mp-qualifier" className={FIELD_LABEL}>Qualifier</label>
                  <select id="mp-qualifier" className={`${FIELD} ch-focus`} value={form.qualifier.code}
                    onChange={e => set('qualifier', { ...form.qualifier!, code: e.target.value })}>
                    {qualifiers.map(q => <option key={q.code} value={q.code}>{q.name} · {q.date}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="mp-qualify" className={FIELD_LABEL}>How many qualify</label>
                  <select id="mp-qualify" className={`${FIELD} ch-focus`} value={form.qualifier.qualify}
                    onChange={e => set('qualifier', { ...form.qualifier!, qualify: Number(e.target.value) })}>
                    {[2, 4, 8, 16, 32, 64, 128].filter(n => !form.maxField || n <= form.maxField).map(n => <option key={n} value={n}>Top {n}</option>)}
                  </select>
                </div>
              </div>
            )
          )}
          {form.field === 'qualifier' && (
            <div>
              <button type="button" onClick={() => setMakingQualifier(true)} className={`${buttonClass('secondary')} ch-focus`}>Make a new qualifier</button>
              <p className="t-cap text-ink/65 mt-1.5">The top finishers become the field the moment its results are certified.</p>
            </div>
          )}
          <div>
            <label htmlFor="mp-cap" className={FIELD_LABEL}>Biggest field{pairs ? ' (pairs)' : ''}</label>
            <select id="mp-cap" className={`${FIELD} ch-focus w-40`} value={form.maxField ?? ''} onChange={e => setCap(e.target.value ? Number(e.target.value) : null)}>
              {FIELD_CAPS.map(n => <option key={n} value={n}>{n}</option>)}
              <option value="">No limit</option>
            </select>
          </div>

          <h3 className="t-card text-ink pt-1">The draw</h3>
          <div>
            <p className={FIELD_LABEL}>When it is made</p>
            <Segmented label="When the draw is made" value={form.draw.when}
              onChange={v => set('draw', { ...form.draw, when: v, date: v === 'date' ? form.draw.date : null, time: v === 'date' ? form.draw.time ?? '20:00' : null })}
              options={[{ value: 'auto', label: form.field === 'qualifier' ? 'On the results' : 'When entries close' }, { value: 'date', label: 'On a date' }, { value: 'manual', label: 'By hand' }] as const} />
            {form.draw.when === 'manual' && <p className="t-cap text-ink/65 mt-2">An Officer makes the draw — seeded, at random or placed by hand.</p>}
          </div>
          {form.draw.when === 'date' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="mp-draw-date" className={FIELD_LABEL}>Day</label>
                <input id="mp-draw-date" type="date" className={`${FIELD} ch-focus`} value={form.draw.date ?? ''} min={form.closes?.date || today}
                  onChange={e => set('draw', { ...form.draw, date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="mp-draw-time" className={FIELD_LABEL}>At</label>
                <input id="mp-draw-time" type="time" className={`${FIELD} ch-focus`} value={form.draw.time ?? ''}
                  onChange={e => set('draw', { ...form.draw, time: e.target.value })} />
              </div>
            </div>
          )}
          {form.draw.when !== 'manual' && (
            <div>
              <p className={FIELD_LABEL}>Seeding</p>
              <Segmented label="Seeding" value={form.draw.seeding} onChange={v => set('draw', { ...form.draw, seeding: v })}
                options={form.field === 'qualifier'
                  ? [{ value: 'qualifier', label: 'By their finish' }, { value: 'random', label: 'At random' }] as const
                  : [{ value: 'random', label: 'At random' }, { value: 'handicap', label: 'By handicap index' }] as const} />
            </div>
          )}

          <h3 className="t-card text-ink pt-1">Play-by dates</h3>
          <p className="t-cap text-ink/65 -mt-3">
            {form.maxField ? `A date for each round of a field of ${form.maxField}. A smaller field drops the earliest.` : 'Set the Final, then add the rounds before it. The draw uses as many as it needs, from the Final back.'}
          </p>
          <div className="space-y-3">
            {form.deadlines.map((d, i) => (
              <div key={`${form.deadlines.length}-${i}`} className="grid grid-cols-[1fr_11rem] items-center gap-3">
                <label htmlFor={`mp-due-${i}`} className="t-label text-ink">{names[i]}</label>
                <input id={`mp-due-${i}`} type="date" className={`${FIELD} ch-focus`} value={d}
                  min={form.deadlines.slice(0, i).filter(Boolean).pop() || form.draw.date || form.closes?.date || today}
                  onChange={e => setDeadline(i, e.target.value)} />
              </div>
            ))}
          </div>
          {!form.maxField && (
            <div className="flex flex-wrap gap-3">
              {form.deadlines.length < MAX_MATCH_ROUNDS && (
                <button type="button" onClick={() => set('deadlines', ['', ...form.deadlines])} className={`${buttonClass('secondary', false)} ch-focus`}>+ Add an earlier round</button>
              )}
              {form.deadlines.length > 1 && (
                <button type="button" onClick={() => set('deadlines', form.deadlines.slice(1))} className={`${buttonClass('quiet', false)} ch-focus`}>Take off the {names[0]}</button>
              )}
            </div>
          )}

          <h3 className="t-card text-ink pt-1">Rules</h3>
          <p className="t-cap text-ink/65 -mt-3">Every match is played on the club’s home course.</p>
          <div>
            <p className={FIELD_LABEL}>Level after 18</p>
            <Segmented label="Level after 18" value={form.tie} onChange={v => set('tie', v)}
              options={[{ value: 'extra', label: 'Down the 19th' }, { value: 'replay', label: 'Replay' }] as const} />
          </div>
          <div>
            <p className={FIELD_LABEL}>Handicap index</p>
            <Segmented label="Handicap index" value={form.handicap} onChange={v => set('handicap', v)}
              options={[{ value: 'on_day', label: 'On the day played' }, { value: 'at_draw', label: 'At the draw' }] as const} />
          </div>
        </div>

        {error && <p role="alert" className="t-cap text-rust-deep mt-5">{error}</p>}
        <div className="flex flex-wrap gap-3 mt-6">
          <button type="submit" disabled={busy || !!issue} className={`${buttonClass('primary', false)} ch-focus`}>
            {busy ? 'Making…' : 'Make the match play'}
          </button>
          <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
        </div>
        {issue && form.name && !error && <p className="t-cap text-ink/65 mt-3">{issue}</p>}
      </form>
    </div>
    {/* Stage 5 (P8): a qualifier made there and then — New competition's own panel over this one, chosen on return. */}
    {makingQualifier && (
      <CompPanel clubId={clubId} slug={slug} code={null} homeCourseId={homeCourseId} cats={cats} ageDate={ageDate} presets={presets}
        onClose={() => setMakingQualifier(false)}
        onDone={made => {
          if (!made) return
          setMadeHere(m => [...m, { code: made.code, name: made.name, date: clubEventDates(made.date, made.date) }])
          setForm(f => ({ ...f, qualifier: { code: made.code, qualify: f.qualifier?.qualify ?? Math.min(16, f.maxField ?? 16) } }))
          onDone()
        }} />
    )}
    </>
  )
}
