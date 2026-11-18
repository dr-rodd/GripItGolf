'use client'

import { useEffect, useState } from 'react'
import { IconX } from '@/app/components/icons'
import EntryRulesFields from '@/app/components/EntryRulesFields'
import { FIELD, FIELD_LABEL, buttonClass } from '@/app/components/ui'
import { askAwards } from '@/lib/accountClient'
import { clubEventDates } from '@/lib/clubs'
import { readEntryRules, type Category } from '@/lib/clubMembership'
import {
  STAGE_WORDS, WEIGHTS, WEIGHT_WORDS, awardIssue, defaultAwardRules, readPointsTable,
  type AwardRules, type Stage, type Weight,
} from '@/lib/clubAward'

/**
 * An award's rules (stage 6, P14), in a side panel of 480 like a
 * competition's: its name, who appears (the competitions' own entry rules),
 * points by finish as a list ("25, 20, 16…"), match play by stage reached,
 * what counts, best N, and each of the year's competitions with its weight
 * (×0 leaves it out, ×2 a Major). Delete takes the award's rules away — no
 * result is touched.
 */
export default function AwardPanel({ clubId, year, award, comps, cats, ageDate, onClose, onSaved }: {
  clubId: string
  year: number
  award: { id: string; name: string; rules: AwardRules } | null
  comps: { code: string; name: string; date: string | null; matchPlay: boolean }[]
  cats: Category[]
  ageDate: string
  onClose: () => void
  onSaved: (id: string | null) => void
}) {
  const [name, setName] = useState(award?.name ?? 'Golfer of the Year')
  const [rules, setRules] = useState<AwardRules>(award?.rules ?? defaultAwardRules())
  const [pointsText, setPointsText] = useState((award?.rules ?? defaultAwardRules()).points.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const set = <K extends keyof AwardRules>(k: K, v: AwardRules[K]) => setRules(r => ({ ...r, [k]: v }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const table = readPointsTable(pointsText)
  const issue = !table ? 'Points by finish are whole numbers, 1st first — "25, 20, 16".' : awardIssue({ name, year, rules: { ...rules, points: table } })

  async function save() {
    if (issue || !table) { setError(issue ?? ''); return }
    setBusy(true); setError('')
    const r = await askAwards('save', { clubId, year, id: award?.id, name, rules: { ...rules, points: table } })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved(r.id ?? award?.id ?? null)
  }

  async function remove() {
    if (!award) return
    setBusy(true); setError('')
    const r = await askAwards('delete', { clubId, year, id: award.id })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved(null)
  }

  const shown = comps.filter(c => (c.matchPlay ? rules.kinds.matchPlay : rules.kinds.stroke))
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="aw-panel-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <form onSubmit={e => { e.preventDefault(); void save() }}
        className="ch-panel relative w-full md:w-[480px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <h2 id="aw-panel-title" className="t-h2 text-ink flex-1">{award ? 'Change the award' : `New award · ${year}`}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus rounded-tile p-2 text-ink"><IconX size={20} /></button>
        </div>

        <div className="space-y-4 mt-5">
          <div>
            <label htmlFor="aw-name" className={FIELD_LABEL}>Name</label>
            <input id="aw-name" className={`${FIELD} ch-focus`} value={name} maxLength={60} onChange={e => setName(e.target.value)} />
          </div>

          <h3 className="t-card text-ink pt-1">Who appears</h3>
          <EntryRulesFields entry={rules.entry} onChange={e => set('entry', readEntryRules(e))} cats={cats} ageDate={ageDate} idPrefix="aw-entry" />
          <p className="t-cap text-ink/65 -mt-2">Everybody on the list who plays here and fits these. Ages are counted on 31 December {year}.</p>

          <h3 className="t-card text-ink pt-1">What counts</h3>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 t-label text-ink">
              <input type="checkbox" checked={rules.kinds.stroke} onChange={e => set('kinds', { ...rules.kinds, stroke: e.target.checked })} /> Stroke competitions
            </label>
            <label className="flex items-center gap-2 t-label text-ink">
              <input type="checkbox" checked={rules.kinds.matchPlay} onChange={e => set('kinds', { ...rules.kinds, matchPlay: e.target.checked })} /> Match play
            </label>
          </div>
          {rules.kinds.stroke && (
            <div>
              <label htmlFor="aw-points" className={FIELD_LABEL}>Points by finish, 1st first</label>
              <input id="aw-points" className={`${FIELD} ch-focus`} value={pointsText} onChange={e => setPointsText(e.target.value)} />
              <p className="t-cap text-ink/65 mt-1.5">Players level share the places’ points — two tied 2nd get 2nd’s and 3rd’s between them. A competition’s Results are only counted once certified.</p>
            </div>
          )}
          {rules.kinds.matchPlay && (
            <div>
              <p className={FIELD_LABEL}>Match play by stage reached</p>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(STAGE_WORDS) as Stage[]).map(k => (
                  <label key={k} className="block">
                    <span className="t-cap text-ink/65">{STAGE_WORDS[k]}</span>
                    <input type="number" min={0} max={1000} className={`${FIELD} ch-focus`} value={rules.stages[k]}
                      onChange={e => set('stages', { ...rules.stages, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                  </label>
                ))}
              </div>
              <p className="t-cap text-ink/65 mt-1.5">Given as each round is decided — both players of a pair.</p>
            </div>
          )}
          <div>
            <label htmlFor="aw-best" className={FIELD_LABEL}>Best results that count</label>
            <select id="aw-best" className={`${FIELD} ch-focus w-48`} value={rules.bestOf ?? ''} onChange={e => set('bestOf', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Every result</option>
              {[3, 4, 5, 6, 8, 10, 12, 15, 20].map(n => <option key={n} value={n}>Best {n}</option>)}
            </select>
          </div>

          <h3 className="t-card text-ink pt-1">Each competition’s weight</h3>
          {shown.length === 0
            ? <p className="t-cap text-ink/65">No competition in {year} yet — every one counts ×1 unless changed here.</p>
            : (
              <ul className="divide-y divide-line">
                {shown.map(c => (
                  <li key={c.code} className="flex items-center gap-3 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="block t-label text-ink truncate">{c.name}</span>
                      <span className="block t-cap text-ink/65">{c.matchPlay ? 'Match play' : 'Stroke'}{c.date ? ` · ${clubEventDates(c.date, c.date)}` : ''}</span>
                    </span>
                    <select aria-label={`${c.name}’s weight`} className={`${FIELD} ch-focus w-40`} value={rules.weights[c.code] ?? 1}
                      onChange={e => {
                        const w = Number(e.target.value) as Weight
                        const { [c.code]: _old, ...rest } = rules.weights
                        void _old
                        set('weights', w === 1 ? rest : { ...rest, [c.code]: w })
                      }}>
                      {WEIGHTS.map(w => <option key={w} value={w}>{WEIGHT_WORDS[w]}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
        </div>

        {error && <p role="alert" className="t-cap text-rust-deep mt-5">{error}</p>}
        <div className="flex flex-wrap gap-3 mt-6">
          <button type="submit" disabled={busy || !!issue} className={`${buttonClass('primary', false)} ch-focus`}>{busy ? 'Saving…' : award ? 'Save' : 'Make the award'}</button>
          <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
          {award && !deleting && <button type="button" onClick={() => setDeleting(true)} className={`${buttonClass('quiet', false)} ch-focus ml-auto`}>Delete</button>}
        </div>
        {issue && name && !error && <p className="t-cap text-ink/65 mt-3">{issue}</p>}
        {award && deleting && (
          <div className="mt-4 p-4 rounded-tile border border-line">
            <p className="text-ink text-[15px]">Delete {award.name}? Its rules go; no competition or result is touched.</p>
            <div className="flex gap-3 mt-3">
              <button type="button" disabled={busy} onClick={() => void remove()} className={`${buttonClass('secondary', false)} ch-focus`}>Delete it</button>
              <button type="button" onClick={() => setDeleting(false)} className={`${buttonClass('quiet', false)} ch-focus`}>Keep it</button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
