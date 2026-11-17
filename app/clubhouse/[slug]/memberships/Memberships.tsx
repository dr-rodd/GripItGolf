'use client'

import { useState } from 'react'
import { askClub } from '@/lib/accountClient'
import {
  CATEGORY_CODE_MAX, CATEGORY_NAME_MAX, EVERY_DAY, WEEKDAYS, WEEKDAY_NAMES, ageDateLabel, categoryCodeFrom, categoryIssue,
  daysLine, normaliseCode, uniqueCode,
} from '@/lib/clubMembership'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass } from '@/app/components/ui'
import { useShell } from '../ShellContext'
import { useCategories, type CountedCategory } from '../useCategories'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

type Draft = { id?: string; name: string; code: string; codeTyped: boolean; days: number[] }

/**
 * Memberships (stage (m), Ross, 17 Nov 2026): the club's categories — Full,
 * 6 Day, Junior — each with a short code for the spreadsheet's Category
 * column and the days of the week it plays. A competition entered on a day a
 * membership does not play refuses it, unless the competition ticks that
 * membership. Below them, the day each season's ages are counted on. The
 * office's (Clubhouse); a phone has it too, one column.
 */
export default function Memberships() {
  const { club, may } = useShell()
  const { categories, ageDate, lost, again, set, setAgeDate } = useCategories(club.id)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [note, setNote] = useState('')

  if (!may('keep_list')) return <p className="text-ink/80 text-[15px]">Only someone with Clubhouse keeps the club’s memberships.</p>

  const list = categories ?? []
  const others = list.filter(c => c.id !== draft?.id)
  const draftCode = draft ? (draft.codeTyped ? normaliseCode(draft.code) : uniqueCode(categoryCodeFrom(draft.name), others.map(c => c.code))) : ''
  const draftWhy = draft ? categoryIssue({ name: draft.name, code: draftCode, days: draft.days }, others) : null

  function open(c: CountedCategory | null) {
    setError(''); setNote(''); setDeleting(null)
    setDraft(c ? { id: c.id, name: c.name, code: c.code, codeTyped: true, days: [...c.days] } : { name: '', code: '', codeTyped: false, days: [...EVERY_DAY] })
  }

  async function save() {
    if (!draft || draftWhy) return
    setBusy(true); setError('')
    const r = await askClub('category.save', { clubId: club.id, id: draft.id, name: draft.name, code: draftCode, days: draft.days })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    set(r.categories ?? list)
    setNote(draft.id ? `${draft.name.trim()} saved.` : `${draft.name.trim()} added — code ${draftCode}.`)
    setDraft(null)
  }

  async function remove(c: CountedCategory) {
    setBusy(true); setError('')
    const r = await askClub('category.delete', { clubId: club.id, id: c.id })
    setBusy(false)
    setDeleting(null)
    if (!r.ok) { setError(r.error); return }
    set(r.categories ?? list.filter(x => x.id !== c.id))
    setNote(`${c.name} deleted.`)
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="t-h1 text-ink">Memberships</h1>
          <p className="t-cap text-ink/65 mt-1">Each has a code for the list’s Category column and the days it plays.</p>
        </div>
        {categories && !draft && (
          <button type="button" onClick={() => open(null)} className={`${buttonClass('secondary', false)} ch-focus`}>Add a membership</button>
        )}
      </div>

      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={again} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      {note && <p role="status" className="t-cap text-ink/80 mt-4">{note}</p>}
      {error && !draft && <p role="alert" className="t-cap text-rust-deep mt-4">{error}</p>}

      <div className="grid gap-4 mt-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-4 min-w-0">
          {draft && (
            <section className={`${cardClass()} p-5`} aria-labelledby="mem-edit">
              <h2 id="mem-edit" className="t-card text-ink">{draft.id ? `Change ${list.find(c => c.id === draft.id)?.name ?? 'the membership'}` : 'A new membership'}</h2>
              <div className="grid gap-4 mt-4 md:grid-cols-[minmax(0,1fr)_200px]">
                <div>
                  <label htmlFor="mem-name" className={FIELD_LABEL}>Name</label>
                  <input id="mem-name" autoFocus value={draft.name} maxLength={CATEGORY_NAME_MAX} placeholder="6 Day"
                    onChange={e => setDraft({ ...draft, name: e.target.value })} className={`${FIELD} ch-focus`} />
                </div>
                <div>
                  <label htmlFor="mem-code" className={FIELD_LABEL}>Code</label>
                  <input id="mem-code" value={draftCode} maxLength={CATEGORY_CODE_MAX} spellCheck={false} autoCapitalize="characters"
                    onChange={e => setDraft({ ...draft, code: e.target.value, codeTyped: true })} className={`${FIELD} field-code ch-focus`} />
                </div>
              </div>
              <fieldset className="mt-4">
                <legend className={FIELD_LABEL}>The days it plays</legend>
                <div className="flex flex-wrap gap-2">
                  {EVERY_DAY.map(d => {
                    const on = draft.days.includes(d)
                    return (
                      <button key={d} type="button" role="checkbox" aria-checked={on} aria-label={WEEKDAY_NAMES[d]}
                        onClick={() => setDraft({ ...draft, days: on ? draft.days.filter(x => x !== d) : [...draft.days, d].sort() })}
                        className={`${chipClass(on, true)} ch-focus min-w-12`}>
                        {WEEKDAYS[d]}
                      </button>
                    )
                  })}
                </div>
                <p className="t-cap text-ink/65 mt-2">{daysLine(draft.days)}</p>
              </fieldset>
              {(error || (draftWhy && draft.name.trim())) && <p role="alert" className="t-cap text-rust-deep mt-3">{error || draftWhy}</p>}
              <div className="flex flex-wrap gap-3 mt-5">
                <button type="button" disabled={busy || !!draftWhy} onClick={() => void save()} className={`${buttonClass('primary', false)} ch-focus`}>
                  {busy ? 'Saving…' : draft.id ? 'Save' : 'Add the membership'}
                </button>
                <button type="button" onClick={() => { setDraft(null); setError('') }} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
              </div>
            </section>
          )}

          {!categories && !lost && <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="skeleton h-16 rounded-tile" />)}</div>}

          {categories && list.length === 0 && !draft && (
            <div className={`${cardClass()} p-6 max-w-xl`}>
              <p className="t-card text-ink">No memberships yet</p>
              <p className="text-ink/80 text-[15px] mt-2">
                Add the club’s memberships — Full, 6 Day, Junior — and the days each plays. Until then everybody plays any day, and competitions can’t be limited to a membership.
              </p>
              <button type="button" onClick={() => open(null)} className={`${buttonClass('primary', false)} ch-focus mt-5`}>Add a membership</button>
            </div>
          )}

          {list.length > 0 && (
            <ul className={`${cardClass()} divide-y divide-line overflow-hidden`}>
              {list.map(c => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 min-h-14">
                  <span className="flex-1 min-w-[12rem]">
                    <span className="block text-[17px] font-medium text-ink leading-snug">{c.name}</span>
                    <span className="block t-cap text-ink/65 mt-0.5">{daysLine(c.days)} · {c.count === 1 ? '1 person' : `${c.count} people`}</span>
                  </span>
                  <span className="t-code text-ink/80" aria-label={`Code ${c.code}`}>{c.code}</span>
                  {deleting === c.id ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="t-cap text-ink/80">Delete {c.name}?</span>
                      <button type="button" disabled={busy} onClick={() => void remove(c)} className={`${buttonClass('danger', false, true)} ch-focus`}>Delete</button>
                      <button type="button" onClick={() => setDeleting(null)} className={`${buttonClass('quiet', false, true)} ch-focus`}>Keep</button>
                    </span>
                  ) : (
                    <span className="flex gap-1">
                      <button type="button" onClick={() => open(c)} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9">Change</button>
                      <button type="button" disabled={c.count > 0} title={c.count > 0 ? 'Move its people to another membership first.' : undefined}
                        onClick={() => { setDeleting(c.id); setNote(''); setError('') }}
                        className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9 disabled:text-ink/50 disabled:cursor-not-allowed">Delete</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <AgeDateCard clubId={club.id} ageDate={ageDate} onSaved={setAgeDate} ready={!!categories} />
          <section className={`${cardClass('flat')} p-5`} aria-labelledby="mem-sheet">
            <h2 id="mem-sheet" className="t-card text-ink">In the spreadsheet</h2>
            <ul className="text-ink/80 text-[15px] mt-3 space-y-2 leading-snug">
              <li><span className="font-medium text-ink">Gender</span>: Male, Female or N/A</li>
              <li><span className="font-medium text-ink">Date of birth</span>: day first, like 03/04/2010, or N/A</li>
              <li><span className="font-medium text-ink">Category</span>: {list.length ? list.map(c => c.code).join(', ') : 'a membership’s code'}, or N/A</li>
            </ul>
            <p className="t-cap text-ink/65 mt-3">An empty cell changes nothing. N/A clears it.</p>
          </section>
        </div>
      </div>
    </>
  )
}

/** The day each season's ages count on — 1 January unless the club says otherwise (Ross, 17 Nov 2026). */
function AgeDateCard({ clubId, ageDate, onSaved, ready }: { clubId: string; ageDate: string; onSaved: (d: string) => void; ready: boolean }) {
  const [month, setMonth] = useState<number | null>(null)
  const [day, setDay] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [say, setSay] = useState<{ text: string; error: boolean } | null>(null)
  const m = month ?? Number(ageDate.slice(0, 2))
  const d = Math.min(day ?? Number(ageDate.slice(3, 5)), MONTH_DAYS[m - 1])
  const value = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const changed = value !== ageDate

  async function save() {
    setBusy(true); setSay(null)
    const r = await askClub('age-date', { clubId, ageDate: value })
    setBusy(false)
    if (!r.ok) { setSay({ text: r.error, error: true }); return }
    onSaved(r.ageDate ?? value)
    setMonth(null); setDay(null)
    setSay({ text: `Ages now count on ${ageDateLabel(value)}.`, error: false })
  }

  return (
    <section className={`${cardClass()} p-5`} aria-labelledby="mem-age">
      <h2 id="mem-age" className="t-card text-ink">Ages count on</h2>
      <p className="t-cap text-ink/65 mt-1">A competition’s age band reads each player’s age on this day of the season.</p>
      <div className="flex gap-2 mt-4">
        <select aria-label="Day" value={d} disabled={!ready} onChange={e => setDay(Number(e.target.value))} className={`${FIELD} ch-focus w-24`}>
          {Array.from({ length: MONTH_DAYS[m - 1] }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select aria-label="Month" value={m} disabled={!ready} onChange={e => setMonth(Number(e.target.value))} className={`${FIELD} ch-focus flex-1`}>
          {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
      </div>
      {say && <p role={say.error ? 'alert' : 'status'} className={`t-cap mt-3 ${say.error ? 'text-rust-deep' : 'text-ink/80'}`}>{say.text}</p>}
      {changed && (
        <button type="button" disabled={busy} onClick={() => void save()} className={`${buttonClass('secondary', false)} ch-focus mt-4`}>
          {busy ? 'Saving…' : 'Save the day'}
        </button>
      )}
    </section>
  )
}
